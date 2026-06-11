#!/bin/sh
set -e

echo "==> Waiting for PostgreSQL..."
until python - <<'EOF'
import psycopg2, os, sys
db_url = os.environ.get("DATABASE_URL")
if db_url:
    try:
        psycopg2.connect(db_url)
        sys.exit(0)
    except Exception:
        sys.exit(1)
else:
    try:
        psycopg2.connect(
            host=os.environ["DB_HOST"],
            port=os.environ.get("DB_PORT", "5432"),
            dbname=os.environ["DB_NAME"],
            user=os.environ["DB_USER"],
            password=os.environ["DB_PASSWORD"],
        )
        sys.exit(0)
    except Exception:
        sys.exit(1)
EOF
do
    echo "    PostgreSQL not ready — retrying in 2s..."
    sleep 2
done
echo "==> PostgreSQL ready."

echo "==> Enabling pgvector extension (non-fatal)..."
python - <<'EOF' || echo "    WARNING: pgvector extension unavailable — RAG features disabled."
import psycopg2, os
db_url = os.environ.get("DATABASE_URL")
if db_url:
    conn = psycopg2.connect(db_url)
else:
    conn = psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=os.environ.get("DB_PORT", "5432"),
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
    )
conn.autocommit = True
with conn.cursor() as cur:
    cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
conn.close()
print("    pgvector extension ready.")
EOF

echo "==> Running migrations..."
python manage.py migrate --noinput

# Create superuser from env vars if DJANGO_SUPERUSER_PASSWORD is set.
# Set DJANGO_SUPERUSER_USERNAME, DJANGO_SUPERUSER_EMAIL, and
# DJANGO_SUPERUSER_PASSWORD in the Render dashboard to activate this.
if [ -n "$DJANGO_SUPERUSER_PASSWORD" ]; then
  echo "==> Creating/updating superuser '${DJANGO_SUPERUSER_USERNAME:-admin}'..."
  python - <<'EOF'
import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", os.environ["DJANGO_SETTINGS_MODULE"])
django.setup()
from django.contrib.auth import get_user_model
User = get_user_model()
username = os.environ.get("DJANGO_SUPERUSER_USERNAME", "admin")
email    = os.environ.get("DJANGO_SUPERUSER_EMAIL", "")
password = os.environ["DJANGO_SUPERUSER_PASSWORD"]
user, created = User.objects.get_or_create(username=username)
user.email = email
user.set_password(password)
user.is_staff = True
user.is_superuser = True
user.save()
print(f"    Superuser '{username}' {'created' if created else 'updated'}.")
EOF
fi

echo "==> Collecting static files..."
python manage.py collectstatic --noinput --clear

# Kick slow data tasks into background so Gunicorn can bind the port immediately.
# Both commands are idempotent — safe to re-run on every deploy.
(
  echo "==> [background] Seeding ISO 27001 data..."
  python manage.py seed_iso27001
  echo "==> [background] Building RAG index..."
  python manage.py build_rag_index
  echo "==> [background] Data tasks complete."
) &

echo "==> Starting Gunicorn (2 workers, preload)..."
exec gunicorn config.wsgi:application \
    --bind "0.0.0.0:${PORT:-8000}" \
    --workers 2 \
    --preload \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -

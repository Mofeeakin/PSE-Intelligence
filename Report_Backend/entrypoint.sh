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

echo "==> Collecting static files..."
python manage.py collectstatic --noinput --clear

# Seed and RAG-index build are slow on first deploy (ONNX embedding).
# Run them in the background so Gunicorn can bind the port immediately
# and Render's port-scan succeeds.  Both commands are idempotent — safe
# to run async.
echo "==> Seeding ISO 27001 data and building RAG index (background)..."
(
    python manage.py seed_iso27001 && \
    python manage.py build_rag_index
) &

echo "==> Creating superuser if not exists..."
python manage.py shell -c "
from django.contrib.auth.models import User
import os
u = os.environ.get('DJANGO_SUPERUSER_USERNAME', 'admin')
p = os.environ.get('DJANGO_SUPERUSER_PASSWORD', '')
e = os.environ.get('DJANGO_SUPERUSER_EMAIL', 'admin@example.com')
if p and not User.objects.filter(username=u).exists():
    User.objects.create_superuser(u, e, p)
    print('Superuser created:', u)
else:
    print('Superuser already exists or no password set — skipping.')
" || true

echo "==> Starting Gunicorn (2 workers, preload)..."
exec gunicorn config.wsgi:application \
    --bind "0.0.0.0:${PORT:-8000}" \
    --workers 2 \
    --preload \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -

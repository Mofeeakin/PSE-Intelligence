# Render Blueprint Deployment Guide

> **Reference project:** Pinsure / Insurance Light  
> **Strategy:** Single Docker container (FastAPI + Vite SPA) deployed via Render Blueprint (`render.yaml`), with a **Supabase PostgreSQL** database. Local development uses a Docker Compose postgres container with an identical schema applied automatically.

---

## How the Full Stack Works

```
┌─────────────────────────────────────────────────────────┐
│                  RENDER (production)                    │
│                                                         │
│  render.yaml blueprint ──► Web Service (Docker)         │
│                             - FastAPI backend           │
│                             - Vite SPA (static files)   │
│                             - Port 8080                 │
│                             - /health check             │
│                                                         │
│  DATABASE_URL ──► Supabase PostgreSQL (external)        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                  LOCAL DEV (docker-compose)              │
│                                                         │
│  docker-compose.yml                                     │
│    db  ──► pgvector/pgvector:pg16 @ localhost:5432      │
│    app ──► same Dockerfile, connects to db container    │
│            runs apply_migrations.py on startup          │
└─────────────────────────────────────────────────────────┘
```

---

## Part 1 — The render.yaml Blueprint

The `render.yaml` file lives at the **repo root**. When you connect the repo in Render, Render reads this file and creates all services automatically.

### Minimal blueprint for a Docker web service

```yaml
services:
  - type: web
    name: my-app
    runtime: docker
    plan: free                        # or starter / standard
    dockerfilePath: ./Dockerfile
    autoDeploy: true
    healthCheckPath: "/health"        # Render pings this to confirm the service is up
    envVars:
      # Secret — user fills this in the Render dashboard (not committed to git)
      - key: DATABASE_URL
        sync: false

      # Hard-coded defaults safe to commit
      - key: SOME_SETTING
        value: "some-value"
```

### Key rules for render.yaml

| Rule | Why |
|---|---|
| `sync: false` for secrets | Tells Render "I will set this manually in the dashboard" — it will NOT be generated or synced from a file |
| `value: "..."` for non-secrets | Gets injected automatically on deploy; safe to commit |
| `healthCheckPath` must return HTTP 200 | Render marks the deploy failed if it never gets 200 |
| `autoDeploy: true` | Every push to the connected branch re-deploys |
| `runtime: docker` | Render builds and runs your `Dockerfile` directly |

### Pinsure render.yaml env-var categories

```
DATABASE_URL          ← sync: false  (paste Supabase URI in dashboard)
DEEPSEEK_API_KEY      ← sync: false  (secret LLM key)
ADMIN_TOKEN           ← sync: false  (secret admin token)
DEEPSEEK_BASE_URL     ← value: "https://api.deepseek.com"
DEEPSEEK_MODEL        ← value: "deepseek-chat"
ENABLE_*              ← value: "1" or "0"  (feature flags)
POLICIES_TABLE_NAME   ← value: "mock_policies"
```

---

## Part 2 — The Dockerfile (Multi-stage)

The Dockerfile in this project is **3-stage** to keep the final image small and handle a combined frontend + backend container.

```
Stage 1  (node:20-alpine)  ──► npm ci + npm run build → dist/spa/
Stage 2  (python:3.13-slim) ──► pip wheel  → /build/wheels/
Stage 3  (python:3.13-slim) ──► copy wheels + src + built SPA → /app/
```

### Startup command inside the container

```dockerfile
CMD ["sh", "-c", \
  "python scripts/apply_migrations.py && \
   python scripts/seed_demo.py --if-empty && \
   uvicorn src.api.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
```

**Order matters:**
1. `apply_migrations.py` — creates/upgrades DB schema (idempotent; safe to re-run)
2. `seed_demo.py --if-empty` — inserts demo data only if tables are empty
3. `uvicorn` — starts the web server

### Important Dockerfile practices used here

- Non-root user (`useradd appuser`) — security best practice
- Pre-built wheels in stage 2 so native libs compile once
- SPA static files copied from stage 1 → served by FastAPI's `StaticFiles`
- `EXPOSE 8080` + `HEALTHCHECK` so Render and Docker can probe the container

---

## Part 3 — Database Strategy

### Production: Supabase PostgreSQL

Supabase provides a **free hosted PostgreSQL** (with pgvector support).

**How to get the connection string:**
1. Go to `supabase.com` → your project
2. `Project Settings → Database → Connection string`
3. Select **Session pooler** (port `6543`) — use this for serverless/container deployments
4. Copy the URI: `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`
5. Paste it as `DATABASE_URL` in the Render dashboard

> **Why session pooler?** Render containers maintain persistent connections. The session pooler (port 6543) is safe for this. The transaction pooler (port 5432) is for true serverless (short-lived connections only).

### Local: Docker Compose postgres

`docker-compose.yml` spins up a local `pgvector/pgvector:pg16` container that mirrors production exactly.

```yaml
db:
  image: pgvector/pgvector:pg16      # same extensions as Supabase (uuid-ossp + vector)
  environment:
    POSTGRES_DB: pinsure
    POSTGRES_USER: pinsure
    POSTGRES_PASSWORD: pinsure_dev
  ports:
    - "5432:5432"

app:
  depends_on:
    db:
      condition: service_healthy     # waits for pg_isready before starting app
  environment:
    DB_URL: postgresql://pinsure:pinsure_dev@db:5432/pinsure
  command: >-
    sh -c "python scripts/apply_migrations.py && uvicorn src.api.main:app ..."
```

The app container's startup command runs migrations automatically, so `docker-compose up` is all you need to get a fully-migrated local DB.

---

## Part 4 — Migration System

### How `apply_migrations.py` works

```
scripts/migrations/
  000_core_schema.sql      ← CREATE EXTENSION uuid-ossp; CREATE EXTENSION vector;
  001_existing_tables.sql  ← core business tables
  002_vector_tables.sql    ← pgvector embedding tables
  ...
  007_auth_tables.sql      ← auth / JWT tables
```

The script:
1. Resolves `DATABASE_URL` → `DB_URL` → `LOCAL_DB_URL` (in that priority order)
2. Creates a `schema_migrations` table if it doesn't exist
3. Reads all `.sql` files from `scripts/migrations/` **sorted alphabetically**
4. Skips files whose filename is already in `schema_migrations`
5. Runs each new file as a single raw psycopg2 transaction
6. Records the filename in `schema_migrations` on success

This means migrations are **idempotent** — safe to run again on every container start (as Render does on every deploy).

### DB URL resolution priority (in code)

```python
url = (
    os.getenv("DATABASE_URL")   # ← Render sets this
    or os.getenv("DB_URL")      # ← docker-compose sets this
    or os.getenv("LOCAL_DB_URL")
)
```

The script also normalises `postgres://` → `postgresql://` (Render/Supabase sometimes return the older scheme).

---

## Part 5 — Seeding the Database

### `seed_demo.py` (automatic, runs on container start)

- Inserts demo users, policies, claims, etc.
- Uses `--if-empty` flag to skip if data already exists
- Called in the Dockerfile `CMD` so every fresh Render deploy seeds itself

### `seed_render_demo.py` (manual, run once against production)

Used to push richer demo data or fix admin credentials against the live Supabase DB:

```powershell
# Windows PowerShell
$env:DATABASE_URL = "postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
python scripts/seed_render_demo.py
```

Uses `ON CONFLICT DO UPDATE` everywhere — safe to re-run at any time.

---

## Part 6 — Connecting Render to GitHub (Blueprint Deploy)

### Step-by-step

1. **Push `render.yaml` to your repo root** (on the branch you want to deploy, e.g. `main`)
2. Go to [render.com](https://render.com) → **New → Blueprint**
3. Connect your GitHub account and select the repo
4. Render reads `render.yaml` and shows you all services it will create — review and confirm
5. For every env var marked `sync: false`, go to the service's **Environment** tab and paste the value manually
6. Click **Apply** — Render builds the Docker image and deploys
7. After the first deploy, every `git push origin main` triggers a redeploy automatically

### Required secrets to set in Render dashboard

| Env var | Where to get it |
|---|---|
| `DATABASE_URL` | Supabase → Project Settings → Database → Session pooler URI |
| `DEEPSEEK_API_KEY` | DeepSeek platform dashboard |
| `ADMIN_TOKEN` | Choose any strong random string |
| `ADMIN_API_KEY` | Choose any strong random string |

---

## Part 7 — Pushing Local DB Data to Production

### Workflow used in this project

```
Local docker-compose DB  ──[seed script]──►  Supabase (production)
```

The `seed_render_demo.py` script connects **directly** to the Supabase connection string and upserts data. There is no `pg_dump` / `pg_restore` involved — the seed script reconstructs all demo data from Python constants.

**To replicate this pattern in a new project:**

1. Write a seed script that uses `psycopg2` or SQLAlchemy + your production `DATABASE_URL`
2. Use `INSERT ... ON CONFLICT DO UPDATE` (upsert) so re-runs are safe
3. Store pre-hashed passwords (bcrypt) as constants in the script — avoids needing bcrypt installed everywhere
4. Run the script locally against the production URL:

```powershell
$env:DATABASE_URL = "<production-connection-string>"
python scripts/seed_render_demo.py
```

### Alternative: pg_dump → pg_restore (for full data copy)

If you need an exact copy of the local DB schema + data:

```powershell
# Dump local docker-compose DB
docker exec pinsure_db pg_dump -U pinsure -d pinsure -F c -f /tmp/pinsure_local.dump
docker cp pinsure_db:/tmp/pinsure_local.dump ./pinsure_local.dump

# Restore to Supabase
pg_restore --no-owner --no-acl -d "postgresql://postgres.[ref]:[pw]@...pooler.supabase.com:6543/postgres" ./pinsure_local.dump
```

> Note: `--no-owner --no-acl` strips ownership grants that won't work on Supabase.

---

## Part 8 — Health Check Endpoint

Render requires a health check to confirm the service is running. Every project needs this.

**Minimum implementation (FastAPI):**

```python
@app.get("/health")
def health():
    return {"status": "ok"}
```

In `render.yaml`:
```yaml
healthCheckPath: "/health"
```

Render polls this after deploy. If it doesn't return 200 within the timeout window, the deploy is marked failed and rolled back.

---

## Checklist for a New Project

- [ ] `render.yaml` at repo root with `type: web`, `runtime: docker`, `healthCheckPath`
- [ ] `Dockerfile` that exposes port 8080 and has a proper startup `CMD`
- [ ] `GET /health` route returns HTTP 200
- [ ] `scripts/migrations/` folder with numbered `.sql` files
- [ ] `scripts/apply_migrations.py` — reads `DATABASE_URL`, runs new migrations idempotently
- [ ] Startup `CMD` runs `apply_migrations.py` before starting the server
- [ ] All secrets use `sync: false` in `render.yaml`; non-secrets use `value:`
- [ ] Supabase project created; Session pooler URI ready to paste in Render dashboard
- [ ] (Optional) `scripts/seed_demo.py --if-empty` in CMD for automatic demo data
- [ ] (Optional) `scripts/seed_render_demo.py` for manual rich-data push to production

---

## Summary: Flow on Every Render Deploy

```
git push origin main
        │
        ▼
Render detects new commit
        │
        ▼
Docker build (multi-stage)
  Stage 1: npm run build → SPA dist
  Stage 2: pip wheel → Python deps
  Stage 3: copy everything → lean runtime image
        │
        ▼
Container starts
  1. python scripts/apply_migrations.py   (DB schema up to date)
  2. python scripts/seed_demo.py --if-empty  (demo data if empty)
  3. uvicorn src.api.main:app --port 8080  (server live)
        │
        ▼
Render polls GET /health → 200 OK
        │
        ▼
Deploy successful — traffic routed to new container
```

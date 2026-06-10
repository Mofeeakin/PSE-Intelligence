#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# start-stack.sh — PSE Compliance Intelligence System
#
# Local dev   :  bash start-stack.sh
# Full rebuild:  bash start-stack.sh --build
# Production  :  sudo bash start-stack.sh --prod [--install-deps]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

MODE="local"
BUILD_FLAG=""
INSTALL_DEPS=false

# ── Argument parsing ──────────────────────────────────────────────────────────
for arg in "$@"; do
  case $arg in
    --build)        BUILD_FLAG="--build" ;;
    --prod)         MODE="prod" ;;
    --install-deps) INSTALL_DEPS=true ;;
    --help|-h)
      echo "Usage: bash start-stack.sh [--build] [--prod] [--install-deps]"
      exit 0 ;;
    *)
      echo "[!] Unknown argument: $arg" && exit 1 ;;
  esac
done

# ── Colour helpers ────────────────────────────────────────────────────────────
GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; NC="\033[0m"
ok()   { echo -e "${GREEN}[ok]${NC}  $*"; }
warn() { echo -e "${YELLOW}[!!]${NC}  $*"; }
die()  { echo -e "${RED}[!!]${NC}  $*" >&2; exit 1; }

# ── Preflight ─────────────────────────────────────────────────────────────────
echo ""
echo "  PSE Compliance Intelligence System — stack launcher"
echo "  ──────────────────────────────────────────────────"

# Docker
command -v docker &>/dev/null || die "Docker not found. Install from https://docs.docker.com/get-docker/"
docker info &>/dev/null        || die "Docker daemon is not running. Start Docker Desktop or 'sudo systemctl start docker'."
ok "Docker daemon running"

# Docker Compose (v2 plugin)
docker compose version &>/dev/null || die "'docker compose' plugin not available. Update Docker Desktop or install docker-compose-plugin."
ok "Docker Compose v2 available"

# .env file
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    warn ".env not found — copied from .env.example. Review secrets before production use."
  else
    die ".env file missing and no .env.example to copy from."
  fi
else
  ok ".env file present"
fi

# Required env keys
for key in SECRET_KEY DB_NAME DB_USER DB_PASSWORD; do
  val=$(grep -E "^${key}=" .env | cut -d= -f2- | tr -d '[:space:]')
  [ -z "$val" ] && die ".env is missing a value for ${key}."
done
ok "Required env keys present"

# ── Optional: install host dependencies (prod / CI) ───────────────────────────
if [ "$INSTALL_DEPS" = true ]; then
  if [ "$EUID" -ne 0 ]; then
    die "--install-deps requires root. Run: sudo bash start-stack.sh --prod --install-deps"
  fi
  echo ""
  echo "  Installing host dependencies..."
  apt-get update -qq
  apt-get install -y --no-install-recommends docker.io docker-compose-plugin curl
  ok "Host dependencies installed"
fi

# ── Launch ────────────────────────────────────────────────────────────────────
echo ""
if [ "$MODE" = "prod" ]; then
  warn "Starting in PRODUCTION mode — DEBUG is off, WhiteNoise serves SPA."
  docker compose up ${BUILD_FLAG} -d
else
  echo "  Starting local development stack..."
  docker compose up ${BUILD_FLAG}
fi

# ── Post-start info (detached mode only) ─────────────────────────────────────
if [ "$MODE" = "prod" ]; then
  echo ""
  ok "Stack is up. Waiting for backend health check..."
  for i in $(seq 1 24); do
    sleep 5
    STATUS=$(docker compose ps backend --format json 2>/dev/null | python3 -c \
      "import sys,json; d=json.load(sys.stdin); print(d[0].get('Health',''))" 2>/dev/null || true)
    if [ "$STATUS" = "healthy" ]; then
      ok "Backend is healthy."
      break
    fi
    echo "    ... waiting ($((i*5))s)"
  done

  echo ""
  echo "  ┌───────────────────────────────────────────────┐"
  echo "  │  Application endpoints                        │"
  echo "  │  Frontend   →  http://localhost:5173           │"
  echo "  │  API        →  http://localhost:8000/api/     │"
  echo "  │  Grafana    →  http://localhost:3000           │"
  echo "  │  Prometheus →  http://localhost:9090           │"
  echo "  └───────────────────────────────────────────────┘"
  echo ""
fi

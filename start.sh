#!/usr/bin/env bash
# Start AIOS: Postgres (Docker) + migrations + worker daemon + web app.
#
# Usage:  ./start.sh          → production build + start (default, fast)
#         ./start.sh debug    → dev server with hot reload + verbose logs
#         ./start.sh stop     → stop the web app (worker daemon keeps running)
set -euo pipefail

cd "$(dirname "$0")"
PORT=3777
MODE="${1:-prod}"

say() { printf '\033[36m▸\033[0m %s\n' "$1"; }
ok()  { printf '\033[32m✓\033[0m %s\n' "$1"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; read -r -p "press enter to close…" _; exit 1; }

# ── stop ─────────────────────────────────────────────────────────────────────
if [ "$MODE" = "stop" ]; then
  if lsof -t -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
    kill "$(lsof -t -nP -iTCP:$PORT -sTCP:LISTEN)" 2>/dev/null || true
    ok "web app stopped (worker daemon still running)"
  else
    say "nothing listening on :$PORT"
  fi
  exit 0
fi

[ "$MODE" = "debug" ] || [ "$MODE" = "prod" ] || die "unknown mode '$MODE' (use: prod | debug | stop)"

# ── 1. Docker + Postgres ─────────────────────────────────────────────────────
if ! docker info >/dev/null 2>&1; then
  say "starting OrbStack…"
  open -a OrbStack || die "OrbStack not found — install it or start Docker manually"
  for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
  docker info >/dev/null 2>&1 || die "docker daemon still unreachable"
fi
say "starting Postgres…"
docker compose up -d >/dev/null
for _ in $(seq 1 30); do
  docker compose exec -T postgres pg_isready -U aios -d aios >/dev/null 2>&1 && break
  sleep 1
done
docker compose exec -T postgres pg_isready -U aios -d aios >/dev/null 2>&1 \
  || die "Postgres did not become ready"

# ── 2. Deps + schema ─────────────────────────────────────────────────────────
[ -d node_modules ] || { say "installing deps…"; pnpm install; }
say "applying migrations…"
if [ "$MODE" = "debug" ]; then
  pnpm db:migrate || die "migrations failed"
else
  pnpm db:migrate >/dev/null 2>&1 || die "migrations failed — run './start.sh debug' to see why"
fi

# ── 3. Worker daemon (always restarted so it runs current code) ──────────────
PLIST="$HOME/Library/LaunchAgents/com.aios.worker.plist"
if [ -f "$PLIST" ]; then
  say "restarting worker daemon…"
  launchctl kickstart -k "gui/$(id -u)/com.aios.worker" >/dev/null 2>&1 || true
else
  say "installing worker daemon…"
  cp launchd/com.aios.worker.plist "$PLIST"
  launchctl bootstrap "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
fi

# ── 4. Web app ───────────────────────────────────────────────────────────────
if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  ok "already running → http://localhost:$PORT"
  open "http://localhost:$PORT"
  exit 0
fi

if [ "$MODE" = "debug" ]; then
  ok "AIOS (debug) → http://localhost:$PORT   ·   hot reload on, Ctrl-C to stop"
  say "worker log: tail -f ~/Library/Logs/aios-worker.log"
  (sleep 4; open "http://localhost:$PORT") &
  exec pnpm dev
fi

say "building…"
pnpm build >/dev/null 2>&1 || die "build failed — run './start.sh debug' to see why"
ok "AIOS → http://localhost:$PORT   ·   Ctrl-C to stop (worker keeps running)"
(sleep 3; open "http://localhost:$PORT") &
exec pnpm start

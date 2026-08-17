#!/usr/bin/env bash
# AIOS launcher — stops what's running, rebuilds from scratch, brings it all up.
#
# Usage:  ./start.sh          → stop everything, clean rebuild, start (default)
#         ./start.sh debug    → stop, then dev server with hot reload + verbose logs
#         ./start.sh deep     → like default, but also reinstalls node_modules
#         ./start.sh stop     → stop the web app (worker daemon keeps running)
set -euo pipefail

cd "$(dirname "$0")"
PORT=3777
MODE="${1:-prod}"
UID_NUM="$(id -u)"

say()  { printf '\033[36m▸\033[0m %s\n' "$1"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$1"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; read -r -p "press enter to close…" _; exit 1; }

# ── stop the web app (launchd unit if present, then any listener on PORT) ────
stop_web() {
  if launchctl print "gui/$UID_NUM/com.aios.web" >/dev/null 2>&1; then
    say "stopping web LaunchAgent…"
    launchctl bootout "gui/$UID_NUM/com.aios.web" >/dev/null 2>&1 || true
  fi
  local pids
  pids="$(lsof -t -nP -iTCP:$PORT -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    say "stopping web app on :${PORT}…"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    for _ in $(seq 1 12); do
      lsof -t -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1 || break
      sleep 0.5
    done
    pids="$(lsof -t -nP -iTCP:$PORT -sTCP:LISTEN 2>/dev/null || true)"
    if [ -n "$pids" ]; then
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
      sleep 1
    fi
  fi
}

if [ "$MODE" = "stop" ]; then
  stop_web
  ok "web app stopped (worker daemon still running)"
  exit 0
fi

[ "$MODE" = "debug" ] || [ "$MODE" = "prod" ] || [ "$MODE" = "deep" ] \
  || die "unknown mode '$MODE' (use: prod | debug | deep | stop)"

# ── 1. stop everything first (never rebuild under a running server) ──────────
stop_web

# ── 2. Docker + Postgres ────────────────────────────────────────────────────
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

# ── 3. dependencies ─────────────────────────────────────────────────────────
if [ "$MODE" = "deep" ]; then
  say "deep clean: reinstalling node_modules…"
  rm -rf node_modules
  pnpm install || die "pnpm install failed"
elif [ ! -d node_modules ]; then
  say "installing deps…"
  pnpm install || die "pnpm install failed"
fi

# ── 4. schema ───────────────────────────────────────────────────────────────
say "applying migrations…"
if [ "$MODE" = "debug" ]; then
  pnpm db:migrate || die "migrations failed"
else
  pnpm db:migrate >/dev/null 2>&1 \
    || die "migrations failed — run './start.sh debug' to see why"
fi

# ── 5. clean build artifacts (the "from scratch" part) ──────────────────────
say "clearing build cache…"
rm -rf .next node_modules/.cache

# ── 6. worker daemon — always restarted so it runs current code ─────────────
PLIST="$HOME/Library/LaunchAgents/com.aios.worker.plist"
if [ -f "$PLIST" ]; then
  say "restarting worker daemon…"
  launchctl kickstart -k "gui/$UID_NUM/com.aios.worker" >/dev/null 2>&1 || true
else
  say "installing worker daemon…"
  scripts/render-launchd.sh worker >/dev/null 2>&1 || true
fi

# ── 7. web app ──────────────────────────────────────────────────────────────
if [ "$MODE" = "debug" ]; then
  ok "AIOS (debug) → http://localhost:$PORT   ·   hot reload on, Ctrl-C to stop"
  say "worker log: tail -f ~/Library/Logs/aios-worker.log"
  (sleep 4; open "http://localhost:$PORT") &
  exec pnpm dev
fi

say "building from scratch (this takes ~30s)…"
pnpm build >/dev/null 2>&1 || die "build failed — run './start.sh debug' to see why"
ok "AIOS → http://localhost:$PORT   ·   Ctrl-C to stop (worker keeps running)"
(sleep 3; open "http://localhost:$PORT") &
exec pnpm start

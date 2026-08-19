#!/usr/bin/env bash
#
# Clean-room test of the apOS container edition, fully ISOLATED from any running
# host-native apOS: separate compose project, web on :3778 (not :3777), its own
# Postgres volume, no host Postgres port. It only SHARES the host's Ollama
# (read-only inference) — nothing it does can affect a live setup.
#
#   deploy/test-deploy.sh up      # build + start the isolated stack
#   deploy/test-deploy.sh check   # health + smoke checks
#   deploy/test-deploy.sh down    # stop + remove (incl. its volume)
#
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PROJECT=aios-deploy-test
FILE=deploy/docker-compose.yml
WEB=http://localhost:3778
export AIOS_WEB_PORT=3778

dc() { docker compose -p "$PROJECT" -f "$FILE" "$@"; }

case "${1:-check}" in
  up)
    echo "▶ building + starting isolated stack ($PROJECT, web :3778)…"
    dc up -d --build
    ;;
  check)
    echo "▶ waiting for web on :3778 …"
    for i in $(seq 1 60); do
      code=$(curl -s -o /dev/null -w "%{http_code}" "$WEB/" 2>/dev/null || echo 000)
      [ "$code" = "200" ] && { echo "  web 200 after ~$((i*3))s"; break; }
      sleep 3
    done
    echo "▶ containers:"; dc ps --format '  {{.Service}}: {{.Status}}'
    echo "▶ routes self-seeded? (ai_routes count)"
    dc exec -T postgres psql -U aios -d aios -tAc "select count(*) from ai_routes;" 2>&1 | sed 's/^/  ai_routes rows: /'
    echo "▶ worker booted? (log grep)"
    dc logs worker 2>&1 | grep -iE "worker|advisory|cron|listening|scheduled" | tail -3 | sed 's/^/  /' || echo "  (no worker log lines yet)"
    echo "▶ chat smoke (→ host Ollama via host.docker.internal)…"
    curl -s --max-time 120 -X POST "$WEB/api/chat" \
      -H 'Content-Type: application/json' \
      -d '{"messages":[{"role":"user","content":"Reply with exactly the word: pong"}]}' 2>&1 \
      | grep -E '"meta"|"done"|"error"' | sed 's/^/  /' || echo "  (no chat response)"
    ;;
  down)
    echo "▶ tearing down $PROJECT (incl. volume)…"
    dc down -v
    ;;
  *) echo "usage: $0 {up|check|down}"; exit 1;;
esac

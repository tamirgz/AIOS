#!/usr/bin/env bash
#
# apOS local CI + deploy.
#
# Run automatically by the pre-push hook (.githooks/pre-push) on every
# `git push`, and runnable by hand any time: `./scripts/deploy-local.sh`.
#
#   GATE   (blocks the push if it fails): typecheck, build.
#   DEPLOY (best-effort, never blocks):   migrate DB, restart worker + web,
#                                         health-check — so the running app on
#                                         this Mac matches what you just pushed.
#
set -o pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

ROOT="$(git rev-parse --show-toplevel)" || exit 1
cd "$ROOT" || exit 1
UID_NUM="$(id -u)"

step() { printf "\n\033[1;36m▸ %s\033[0m\n" "$*"; }
ok()   { printf "\033[1;32m  ✓ %s\033[0m\n" "$*"; }
warn() { printf "\033[1;33m  ! %s\033[0m\n" "$*"; }
die()  { printf "\n\033[1;31m✗ %s — push aborted\033[0m\n" "$*"; exit 1; }

# ----------------------------- GATE (blocking) -----------------------------
step "Typecheck"
npx tsc --noEmit || die "typecheck failed"
ok "types clean"

step "Build"
pnpm build || die "build failed"
ok "build succeeded"

# --------------------------- DEPLOY (best-effort) --------------------------
step "Apply DB migrations"
if [ -f .env.local ]; then
  DBURL="$(grep -m1 '^DATABASE_URL' .env.local | cut -d= -f2- | tr -d '"')"
  if DATABASE_URL="$DBURL" pnpm db:migrate; then ok "migrations applied"
  else warn "migrate failed (is OrbStack/Postgres up?) — the app may need it"; fi
else
  warn ".env.local not found — skipped migrations"
fi

step "Restart services"
launchctl kickstart -k "gui/$UID_NUM/com.aios.worker" >/dev/null 2>&1 && ok "worker restarted" || warn "worker restart failed"
launchctl kickstart -k "gui/$UID_NUM/com.aios.web"    >/dev/null 2>&1 && ok "web restarted"    || warn "web restart failed"

step "Health check"
up=""
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null http://localhost:3777/; then up=1; break; fi
  sleep 0.5
done
[ -n "$up" ] && ok "web serving on http://localhost:3777" \
             || warn "web not responding yet — see ~/Library/Logs/aios-web.log"

if tail -n 40 ~/Library/Logs/aios-worker.log 2>/dev/null | grep -q "ready —"; then
  ok "worker ready"
else
  warn "worker 'ready' not seen yet — see ~/Library/Logs/aios-worker.log"
fi

printf "\n\033[1;32m✓ Local deploy complete — http://localhost:3777\033[0m\n"

#!/usr/bin/env bash
#
# launchd entrypoint for the AIOS web app (com.aios.web).
#
# Rebuilds only when the source changed since the last build, then serves — so
# a boot or restart always runs the latest code without a stale .next, while a
# crash-respawn (KeepAlive) stays fast because nothing needs rebuilding.
#
set -o pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
# Repo root: prefer AIOS_DIR (set by the launchd plist), else derive from this
# script's own location (scripts/ → repo root) — no hardcoded path.
cd "${AIOS_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)}" || exit 1

need_build=0
if [ ! -f .next/BUILD_ID ]; then
  need_build=1
elif find src next.config.ts package.json pnpm-lock.yaml -newer .next/BUILD_ID -print -quit 2>/dev/null | grep -q .; then
  need_build=1
fi

if [ "$need_build" = "1" ]; then
  echo "[web-launch] source newer than build → rebuilding…"
  pnpm build || { echo "[web-launch] build FAILED — not starting"; exit 1; }
else
  echo "[web-launch] build up to date → starting"
fi

exec pnpm start

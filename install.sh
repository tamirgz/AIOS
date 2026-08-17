#!/usr/bin/env bash
#
# AIOS installer (macOS / Apple Silicon).
#
#   curl -fsSL https://raw.githubusercontent.com/<owner>/AIOS/main/install.sh | bash
#   ./install.sh                      # from a checkout
#
# Default = the CONTAINER edition: app (web + worker + Postgres) in Docker,
# Ollama native on the host (macOS containers get no Metal GPU). Local-first —
# no cloud account needed. Idempotent: safe to re-run.
#
# Flags:
#   --native            host-native install (launchd + full Workbench CLI agents)
#   --tier lite|standard|full   model set (default: auto-detected from RAM)
#   --dir PATH          where to clone when run via curl|bash (default ~/AIOS)
#   --yes               non-interactive (accept the recommended tier)
#   --dry-run           print what would happen, change nothing
#   --help
set -euo pipefail

# ── args ─────────────────────────────────────────────────────────────────────
MODE=container TIER="" DIR="${AIOS_DIR:-$HOME/AIOS}" YES=0 DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --native) MODE=native ;;
    --tier) TIER="${2:-}"; shift ;;
    --dir) DIR="${2:-}"; shift ;;
    --yes|-y) YES=1 ;;
    --dry-run) DRY=1 ;;
    --help|-h) sed -n '3,25p' "$0"; exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

c() { printf '\033[%sm%s\033[0m' "$1" "$2"; }
say()  { printf '%s %s\n' "$(c '36' '▸')" "$1"; }
ok()   { printf '%s %s\n' "$(c '32' '✓')" "$1"; }
warn() { printf '%s %s\n' "$(c '33' '!')" "$1"; }
die()  { printf '%s %s\n' "$(c '31' '✗')" "$1" >&2; exit 1; }
# run a MUTATING command (skipped, only printed, under --dry-run)
run()  { if [ "$DRY" = 1 ]; then printf '   %s %s\n' "$(c '90' 'would run:')" "$*"; else "$@"; fi; }

# ── preflight ────────────────────────────────────────────────────────────────
[ "$(uname -s)" = "Darwin" ] || die "AIOS v1 targets macOS. (Linux edition is planned.)"
[ "$(uname -m)" = "arm64" ] || die "AIOS v1 targets Apple Silicon (arm64)."

RAM_GB=$(( $(sysctl -n hw.memsize) / 1024 / 1024 / 1024 ))
if [ -z "$TIER" ]; then
  if   [ "$RAM_GB" -le 16 ]; then TIER=lite
  elif [ "$RAM_GB" -le 48 ]; then TIER=standard
  else TIER=full; fi
fi
case "$TIER" in lite|standard|full) ;; *) die "invalid --tier '$TIER'";; esac

case "$TIER" in
  lite)     MODELS="nomic-embed-text qwen3:8b" ;;
  standard) MODELS="nomic-embed-text qwen3:8b qwen3-coder:30b" ;;
  full)     MODELS="nomic-embed-text qwen3:8b qwen3-coder:30b gemma4:31b-it-qat" ;;
esac

say "AIOS installer — $(c '1' "$MODE") edition"
say "detected: ${RAM_GB}GB RAM → tier $(c '1' "$TIER")  (models: $MODELS)"
if [ "$YES" != 1 ] && [ "$DRY" != 1 ] && [ -t 0 ]; then
  printf '   continue? [Y/n] '; read -r a; case "$a" in [nN]*) exit 0;; esac
fi

# ── homebrew ─────────────────────────────────────────────────────────────────
if ! command -v brew >/dev/null 2>&1; then
  say "installing Homebrew…"
  run /bin/bash -c "NONINTERACTIVE=1 $(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null || true
else ok "Homebrew present"; fi
BREW="$(command -v brew || echo /opt/homebrew/bin/brew)"

brew_ensure() { # formula [--cask]
  if brew list --versions "$1" >/dev/null 2>&1 || { [ "${2:-}" = "--cask" ] && brew list --cask --versions "$1" >/dev/null 2>&1; }; then
    ok "$1 present"
  else
    say "installing $1…"; run "$BREW" install ${2:+--cask} "$1"
  fi
}

# ── docker engine ────────────────────────────────────────────────────────────
if docker info >/dev/null 2>&1; then
  ok "Docker engine running"
else
  say "no Docker engine — installing Colima (free, OSS)…"
  brew_ensure colima
  say "starting Colima…"; run colima start
fi

# ── ollama (always native) ───────────────────────────────────────────────────
if command -v ollama >/dev/null 2>&1 || curl -fsS --max-time 3 http://localhost:11434/api/tags >/dev/null 2>&1; then
  ok "Ollama present"
else
  brew_ensure ollama
fi
if curl -fsS --max-time 3 http://localhost:11434/api/tags >/dev/null 2>&1; then
  ok "Ollama serving on :11434"
else
  say "starting Ollama…"; run "$BREW" services start ollama
  for _ in $(seq 1 30); do curl -fsS --max-time 2 http://localhost:11434/api/tags >/dev/null 2>&1 && break; sleep 1; done
fi

# ── native-only system deps ──────────────────────────────────────────────────
if [ "$MODE" = native ]; then
  brew_ensure node
  command -v pnpm >/dev/null 2>&1 || run corepack enable
fi

# ── repo ─────────────────────────────────────────────────────────────────────
if [ -f "deploy/docker-compose.yml" ]; then
  REPO="$(pwd)"; ok "using checkout at $REPO"
else
  if [ ! -d "$DIR/.git" ]; then
    say "cloning AIOS → $DIR…"
    run git clone https://github.com/tamirgz/AIOS.git "$DIR"
  fi
  REPO="$DIR"; run cd "$REPO"
fi
[ -f .env.local ] || { say "creating .env.local from .env.example…"; run cp .env.example .env.local; }

# ── models ───────────────────────────────────────────────────────────────────
have_models="$(ollama list 2>/dev/null | awk 'NR>1{print $1}')"
for m in $MODELS; do
  # `ollama list` prints untagged pulls as "name:latest"; match either form.
  if printf '%s\n' "$have_models" | grep -qxF "$m" \
     || printf '%s\n' "$have_models" | grep -qxF "$m:latest"; then
    ok "model $m present"
  else say "pulling $m …"; run ollama pull "$m"; fi
done

# ── bring it up ──────────────────────────────────────────────────────────────
if [ "$MODE" = container ]; then
  say "building + starting the container stack…"
  run docker compose -f deploy/docker-compose.yml up -d --build
else
  say "starting Postgres…";        run docker compose up -d
  say "installing deps…";          run pnpm install
  say "applying migrations…";      run pnpm db:migrate
  say "building…";                 run pnpm build
  say "installing launchd agents…"; run scripts/render-launchd.sh web worker orbstack
fi

# ── verify ───────────────────────────────────────────────────────────────────
if [ "$DRY" = 1 ]; then ok "dry run complete — nothing changed"; exit 0; fi
say "waiting for the web app on :3777…"
for _ in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3777/ 2>/dev/null)" = "200" ] && break; sleep 3
done
if [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3777/ 2>/dev/null)" = "200" ]; then
  ok "AIOS is up → http://localhost:3777"
  open http://localhost:3777 2>/dev/null || true
else
  warn "web app didn't answer yet — check logs:"
  [ "$MODE" = container ] && echo "   docker compose -f deploy/docker-compose.yml logs" \
                          || echo "   tail -f ~/Library/Logs/aios-*.log"
fi

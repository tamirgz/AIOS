#!/bin/sh
# Keep the headless LM Studio (llmster) daemon + OpenAI-compatible server alive.
#
# Installed as the com.aios.lmstudio LaunchAgent's program WITH KeepAlive=true:
# this script starts the server, then STAYS ALIVE while it answers on :1234 and
# EXITS the moment it goes unreachable — so launchd restarts it (self-healing).
# The old agent was a one-shot (KeepAlive=false): it started the daemon at login
# and never recovered when it later died (GUI conflict, sleep, or a crash).
#
# `lms` is on PATH (set by the plist's EnvironmentVariables); curl is in /usr/bin.
set -u
PORT="${LMS_PORT:-1234}"
URL="http://127.0.0.1:${PORT}/v1/models"

lms daemon up 2>&1 || true
lms server start --port "$PORT" 2>&1 || true

# Startup grace: wait up to ~30s for the server to answer before we start
# monitoring, so a slow cold start doesn't look like a failure.
i=0
while [ "$i" -lt 15 ]; do
  curl -fsS --max-time 2 "$URL" >/dev/null 2>&1 && break
  i=$((i + 1))
  sleep 2
done

# Monitor: stay alive (checking every 30s) while the server responds. When it
# stops, exit so launchd's KeepAlive relaunches this script, which re-ups the
# daemon + server.
while curl -fsS --max-time 3 "$URL" >/dev/null 2>&1; do
  sleep 30
done

echo "lms server on :$PORT went unreachable — exiting so launchd restarts it"

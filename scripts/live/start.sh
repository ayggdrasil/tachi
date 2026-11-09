#!/usr/bin/env bash
# (Re)start the public demo server inside the Vercel sandbox. Idempotent; safe to run after every resume.
#   bash scripts/live/start.sh            # restart the server
#   UPDATE=1 bash scripts/live/start.sh   # pull the latest main from GitHub, rebuild, then restart
# Secrets (TACHI_DIRECTOR_KEY, optional API keys) come from the sandbox's own environment, never from this repo.
set -u
cd "$(dirname "$0")/../.."
if [ "${UPDATE:-0}" = "1" ]; then
  curl -sL https://codeload.github.com/ayggdrasil/tachi/tar.gz/refs/heads/main | tar xz --strip-components=1
  NODE_ENV=development npm ci --include=dev --no-audit --no-fund > /tmp/npmci.log 2>&1 || { echo "npm ci failed"; tail -5 /tmp/npmci.log; exit 1; }
fi
if [ "${UPDATE:-0}" = "1" ] || [ ! -f dist/index.html ]; then
  NODE_ENV=development npx vite build > /tmp/build.log 2>&1 || { echo "build failed"; tail -5 /tmp/build.log; exit 1; }
fi
for p in $(pgrep -f "tsx server/index" || true); do kill "$p" 2>/dev/null || true; done
sleep 1
PORT="${PORT:-4100}" NODE_ENV=production setsid nohup npx tsx server/index.ts > /tmp/server.log 2>&1 < /dev/null &
for i in $(seq 1 30); do
  sleep 1
  if curl -sf "localhost:${PORT:-4100}/api/status" > /dev/null; then echo "UP after ${i}s: $(curl -s localhost:${PORT:-4100}/api/status)"; exit 0; fi
done
echo "server did not come up"; tail -20 /tmp/server.log; exit 1

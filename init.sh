#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  npm install
else
  npm install
fi

# Start a Vite dev server for manual smoke testing without blocking cron runs.
if [ "${START_DEV_SERVER:-1}" = "1" ]; then
  if [ -f .vite-dev.pid ] && kill -0 "$(cat .vite-dev.pid)" 2>/dev/null; then
    echo "Vite dev server already running (pid $(cat .vite-dev.pid))."
  else
    nohup npm run dev -- --host 0.0.0.0 > .vite-dev.log 2>&1 &
    echo $! > .vite-dev.pid
    echo "Started Vite dev server (pid $(cat .vite-dev.pid))."
  fi
fi

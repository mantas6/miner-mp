#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  npm install
fi

if [ ! -d server/node_modules ]; then
  npm --prefix server install
fi

cleanup() {
  trap - EXIT INT TERM
  kill "${relay_pid:-}" "${preview_pid:-}" 2>/dev/null || true
  wait "${relay_pid:-}" "${preview_pid:-}" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

PORT="${PORT:-8081}"
VITE_MP_SERVER_URL="${VITE_MP_SERVER_URL:-ws://localhost:${PORT}}" npm run build

PORT="$PORT" node server/index.js &
relay_pid=$!

npm run preview &
preview_pid=$!

echo "Relay: ws://localhost:${PORT}"
echo "Press Ctrl-C to stop the relay and preview server."

wait "$relay_pid" "$preview_pid"

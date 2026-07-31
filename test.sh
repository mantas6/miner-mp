#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

npm run lint
npm test
npm run typecheck
npm run build

# The relay imports shared/ directly, so client-side changes there can break it.
if [ ! -d server/node_modules ]; then
  npm --prefix server install
fi
npm --prefix server test

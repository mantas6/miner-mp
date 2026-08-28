#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

npm run lint
npm run fmt:check
npm test
npm run typecheck
npm run build

# Playwright covers what a DOM shim cannot: canvas focus, native <dialog>
# behaviour, `:focus-visible`, and the boot flow end to end. A Playwright-
# downloaded browser does not run on NixOS, so this only joins the local sequence
# when there is a system Chromium for it to drive — `playwright.config.ts` finds
# that by itself, and CI installs the pinned download instead.
if command -v chromium >/dev/null 2>&1 \
  || command -v chromium-browser >/dev/null 2>&1 \
  || command -v google-chrome-stable >/dev/null 2>&1 \
  || command -v google-chrome >/dev/null 2>&1; then
  npm run test:e2e
else
  echo 'test.sh: no system Chromium on PATH — skipping npm run test:e2e' >&2
fi

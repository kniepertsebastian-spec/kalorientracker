#!/bin/sh
# Runs one or more live E2E scripts against kcal.pwa-tree.de in the Playwright container, on the
# server. Uses only the test account from .env.claude.local (mounted read-only, never printed).
# Screenshots go to e2e/out/. Usage: e2e/run.sh recipes-export.mjs [mobile.mjs …]
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$repo/e2e/out"
status=0
for script in "$@"; do
  echo "━━ $script"
  docker run --rm --ipc=host --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$repo/e2e:/e2e" -v "$repo/e2e/out:/out" \
    -v "$repo/.env.claude.local:/secrets/.env.claude.local:ro" \
    -w /e2e mcr.microsoft.com/playwright:v1.62.1-noble \
    sh -c 'test -d node_modules/playwright || npm i -s --no-save --no-audit --no-fund playwright@1.62.1 >/dev/null 2>&1; node "$0"' "$script" || status=1
done
exit $status

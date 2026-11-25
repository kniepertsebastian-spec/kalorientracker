#!/bin/sh
# SSO acceptance test (Roadmap 01) against the live PWAs, run on the server.
# Uses only the test account from .env.claude.local (mounted read-only, never printed).
# Writes a 390 px screenshot of the Kalorientracker home to e2e/out/.
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$repo/e2e/out"
docker run --rm --ipc=host --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$repo/e2e:/e2e" -v "$repo/e2e/out:/out" \
  -v "$repo/.env.claude.local:/secrets/.env.claude.local:ro" \
  -w /e2e mcr.microsoft.com/playwright:v1.62.1-noble \
  sh -c 'test -d node_modules/playwright || npm i -s --no-save --no-audit --no-fund playwright@1.62.1 >/dev/null 2>&1; node sso-acceptance.mjs'

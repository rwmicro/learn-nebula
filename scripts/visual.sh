#!/usr/bin/env bash
# Visual regression (tests/style.spec.js): build the site from the fixed vault
# in tests/fixtures/vault, then compare screenshots against the tracked
# baselines, inside the Playwright image that matches @playwright/test, so the
# Chromium is the same here, on a laptop and in CI.
#
#   scripts/visual.sh                      # compare
#   scripts/visual.sh --update-snapshots   # rewrite baselines (review the PNGs!)
#
# Extra arguments go to `playwright test`. Needs Docker; CI runs the same steps
# in that image directly (ci.yml, job "visual"), with VISUAL_IN_CONTAINER=1.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ "${VISUAL_IN_CONTAINER:-}" != "1" ]; then
  version="$(node -p 'require("@playwright/test/package.json").version')"
  # node_modules stays in a volume: the image's Node differs from the host's.
  exec docker run --rm --init --ipc=host --network host \
    -v "$ROOT":/w -v learn-nebula-visual-nm:/w/node_modules -w /w \
    -e VISUAL_IN_CONTAINER=1 -e CI \
    -e HTTPS_PROXY -e https_proxy -e NODE_EXTRA_CA_CERTS \
    ${NODE_EXTRA_CA_CERTS:+-v "$NODE_EXTRA_CA_CERTS":"$NODE_EXTRA_CA_CERTS":ro} \
    "mcr.microsoft.com/playwright:v${version}-noble" scripts/visual.sh "$@"
fi

git config --global --add safe.directory "$ROOT" 2>/dev/null || true
# --ignore-scripts: the only build script is better-sqlite3's, which the static
# build never loads (it's the server's) and which has no prebuilt binary for
# the image's Node.
npx -y pnpm@10.28.0 install --frozen-lockfile --ignore-scripts --store-dir /tmp/pnpm-store
NOTES_LOCAL_DIR=tests/fixtures/vault PRECOMPRESS_BROTLI_QUALITY=1 npx pnpm@10.28.0 run build
exec npx playwright test tests/style.spec.js "$@"

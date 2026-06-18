#!/usr/bin/env sh
# Build the static export and run the Playwright suite against it.

set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npm run build
exec npx playwright test "$@"

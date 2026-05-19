#!/usr/bin/env bash
# Installs git hooks for the pensine workflow.
# Run once per clone (per machine): `npm run hooks:install`

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUBMODULE_DIR="$ROOT/public/articles/pensine"

if [ ! -e "$SUBMODULE_DIR/.git" ]; then
  echo "[install-hooks] Submodule not initialized at $SUBMODULE_DIR" >&2
  echo "[install-hooks] Run: git submodule update --init --recursive" >&2
  exit 1
fi

# Resolve the real hooks dir (submodule .git is a file pointing to .git/modules/...)
HOOKS_DIR="$(git -C "$SUBMODULE_DIR" rev-parse --git-path hooks)"
case "$HOOKS_DIR" in
  /*) ;;
  *)  HOOKS_DIR="$SUBMODULE_DIR/$HOOKS_DIR" ;;
esac
HOOKS_DIR="$(cd "$HOOKS_DIR" 2>/dev/null && pwd || echo "$HOOKS_DIR")"

mkdir -p "$HOOKS_DIR"
install -m 0755 "$ROOT/scripts/hooks/pensine-post-commit" "$HOOKS_DIR/post-commit"

echo "[install-hooks] Installed: $HOOKS_DIR/post-commit"
echo "[install-hooks] Each commit in $SUBMODULE_DIR will now:"
echo "                1. push submodule"
echo "                2. sync R2"
echo "                3. bump + commit + push parent"

#!/usr/bin/env bash
# Synchronise les fichiers binaires de public/articles/pensine vers le bucket R2.
# Prérequis : rclone installé (`dnf install rclone`) + remote `r2` configuré (cf. README).
#
# Usage : ./scripts/sync-r2.sh
# Dry-run : ./scripts/sync-r2.sh --dry-run

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ROOT}/public/articles/pensine"
REMOTE="r2-pensine:pensine-assets"

# Filtres : on n'envoie QUE les binaires. Le markdown reste dans le repo.
INCLUDE_FILTERS=(
  --include "*.pdf"
  --include "*.PDF"
  --include "*.apkg"
  --include "*.APKG"
  --include "*.zip"
  --include "*.mp4"
  --include "*.mp3"
  --include "*.webm"
  --include "*.mov"
  --include "*.doc"
  --include "*.docx"
  --include "*.xls"
  --include "*.xlsx"
  --include "*.ppt"
  --include "*.pptx"
  --include "*.jpg"
  --include "*.jpeg"
  --include "*.png"
  --include "*.gif"
  --include "*.webp"
  --include "*.svg"
  --include "*.JPG"
  --include "*.JPEG"
  --include "*.PNG"
)

if ! command -v rclone >/dev/null 2>&1; then
  echo "[sync-r2] rclone introuvable. Install: sudo dnf install rclone" >&2
  exit 1
fi

if ! rclone listremotes | grep -q "^r2-pensine:$"; then
  echo "[sync-r2] Remote 'r2' non configuré. Voir scripts/README-R2.md" >&2
  exit 1
fi

if [[ ! -d "$SRC" ]]; then
  echo "[sync-r2] Dossier source introuvable: $SRC" >&2
  exit 1
fi

EXTRA_FLAGS=()
if [[ "${1:-}" == "--dry-run" ]]; then
  EXTRA_FLAGS+=(--dry-run)
  echo "[sync-r2] Mode DRY-RUN (aucune écriture)"
fi

echo "[sync-r2] Sync $SRC -> $REMOTE"
rclone sync "$SRC" "$REMOTE" \
  "${INCLUDE_FILTERS[@]}" \
  --exclude "*" \
  --progress \
  --transfers 8 \
  --checkers 16 \
  --s3-upload-cutoff 50M \
  --s3-chunk-size 50M \
  "${EXTRA_FLAGS[@]}"

echo "[sync-r2] Terminé. Vérifie sur https://assets.nebula.li/<chemin>"

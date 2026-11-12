#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION_VALUE="${VERSION:-}"
DRY_RUN=false
UPLOAD_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION_VALUE="${2:?--version requires a semver value}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --upload-only)
      UPLOAD_ONLY=true
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$VERSION_VALUE" ]]; then
  echo "Set VERSION or pass --version X.Y.Z." >&2
  exit 1
fi

if [[ ! "$VERSION_VALUE" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$ ]]; then
  echo "Invalid semver: $VERSION_VALUE" >&2
  exit 1
fi

export VERSION="$VERSION_VALUE"
npm run build:web

ZIP_PATH="$HOME/Downloads/openQbank-connector-v${VERSION}.zip"
if [[ ! -f "$ZIP_PATH" ]]; then
  node scripts/pack-extension.mjs
fi

if [[ ! -f "$ZIP_PATH" ]]; then
  echo "Expected extension package was not created: $ZIP_PATH" >&2
  exit 1
fi

if [[ "$DRY_RUN" == true ]]; then
  echo "Dry run complete: $ZIP_PATH"
  exit 0
fi

PUBLISH_ARGS=("$ZIP_PATH")
if [[ "$UPLOAD_ONLY" == true ]]; then
  PUBLISH_ARGS+=(--upload-only)
fi
node scripts/publish-cws.mjs "${PUBLISH_ARGS[@]}"

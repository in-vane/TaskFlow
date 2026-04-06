#!/usr/bin/env sh
set -eu

: "${PREVIOUS_IMAGE_TAG:?PREVIOUS_IMAGE_TAG is required}"

IMAGE_TAG="$PREVIOUS_IMAGE_TAG"
export IMAGE_TAG

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
"$SCRIPT_DIR/deploy.sh"


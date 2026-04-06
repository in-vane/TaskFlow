#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)"

. "$SCRIPT_DIR/common.sh"

: "${IMAGE_TAG:?IMAGE_TAG is required}"
: "${GHCR_OWNER:?GHCR_OWNER is required}"

cd "$ROOT_DIR"

COMPOSE="$(compose_cmd)"

echo "Deploying TaskFlow with image tag $IMAGE_TAG"
$COMPOSE -f compose.yaml -f compose.prod.yaml pull api worker frontend
$COMPOSE -f compose.yaml -f compose.prod.yaml up -d --no-build db redis
$COMPOSE -f compose.yaml -f compose.prod.yaml run --rm api sh -lc "until corepack pnpm prisma:deploy; do echo 'Waiting for database to be ready...'; sleep 3; done"
$COMPOSE -f compose.yaml -f compose.prod.yaml up -d --no-build api worker frontend nginx
"$SCRIPT_DIR/healthcheck.sh"

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
$COMPOSE -f compose.yaml -f compose.prod.yaml up -d --no-build api worker frontend
$COMPOSE -f compose.yaml -f compose.prod.yaml up -d --no-build --force-recreate nginx

if ! "$SCRIPT_DIR/healthcheck.sh"; then
  echo "Deployment healthcheck failed. Container status:"
  $COMPOSE -f compose.yaml -f compose.prod.yaml ps || true

  echo "API health from inside the api container:"
  $COMPOSE -f compose.yaml -f compose.prod.yaml exec -T api \
    node -e "fetch('http://127.0.0.1:3000/api/health/ready').then(async (r)=>{console.log(r.status); console.log(await r.text()); process.exit(r.ok?0:1);}).catch((error)=>{console.error(error); process.exit(1);})" || true

  echo "API health through nginx from inside the nginx container:"
  $COMPOSE -f compose.yaml -f compose.prod.yaml exec -T nginx \
    sh -lc "wget -S -O - http://127.0.0.1/api/health/ready || true" || true

  echo "Recent service logs:"
  $COMPOSE -f compose.yaml -f compose.prod.yaml logs --tail=120 nginx api frontend worker || true
  exit 1
fi

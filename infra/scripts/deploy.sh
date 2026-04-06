#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)"

. "$SCRIPT_DIR/common.sh"

: "${IMAGE_TAG:?IMAGE_TAG is required}"
: "${GHCR_OWNER:?GHCR_OWNER is required}"

cd "$ROOT_DIR"

COMPOSE="$(compose_cmd)"
COMPOSE_ARGS="--env-file .env -f compose.yaml -f compose.prod.yaml"

echo "Deploying TaskFlow with image tag $IMAGE_TAG"
$COMPOSE $COMPOSE_ARGS pull api worker frontend
$COMPOSE $COMPOSE_ARGS up -d --no-build db redis
$COMPOSE $COMPOSE_ARGS run --rm api sh -lc "until corepack pnpm prisma:deploy; do echo 'Waiting for database to be ready...'; sleep 3; done"
$COMPOSE $COMPOSE_ARGS up -d --no-build api worker frontend
$COMPOSE $COMPOSE_ARGS up -d --no-build --force-recreate nginx

if ! "$SCRIPT_DIR/healthcheck.sh"; then
  echo "Deployment healthcheck failed. Container status:"
  $COMPOSE $COMPOSE_ARGS ps || true

  echo "API health from inside the api container:"
  $COMPOSE $COMPOSE_ARGS exec -T api \
    node -e "fetch('http://127.0.0.1:3000/api/health/ready').then(async (r)=>{console.log(r.status); console.log(await r.text()); process.exit(r.ok?0:1);}).catch((error)=>{console.error(error); process.exit(1);})" || true

  echo "API health through nginx from inside the nginx container:"
  $COMPOSE $COMPOSE_ARGS exec -T nginx \
    sh -lc "wget -S -O - http://127.0.0.1/api/health/ready || true" || true

  echo "Recent service logs:"
  $COMPOSE $COMPOSE_ARGS logs --tail=120 nginx api frontend worker || true
  exit 1
fi

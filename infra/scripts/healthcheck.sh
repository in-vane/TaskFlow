#!/usr/bin/env sh
set -eu

BASE_URL="${BASE_URL:-http://localhost}"
RETRIES="${RETRIES:-15}"
SLEEP_SECONDS="${SLEEP_SECONDS:-4}"

attempt=1
while [ "$attempt" -le "$RETRIES" ]; do
  if curl -fsS "$BASE_URL/api/health/ready" >/dev/null 2>&1; then
    echo "Healthcheck passed on attempt $attempt"
    exit 0
  fi

  echo "Healthcheck attempt $attempt failed, retrying..."
  attempt=$((attempt + 1))
  sleep "$SLEEP_SECONDS"
done

echo "Healthcheck failed after $RETRIES attempts" >&2
exit 1


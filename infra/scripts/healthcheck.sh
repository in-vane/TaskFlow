#!/usr/bin/env sh
set -eu

BASE_URL="${BASE_URL:-http://127.0.0.1}"
RETRIES="${RETRIES:-15}"
SLEEP_SECONDS="${SLEEP_SECONDS:-4}"

http_check() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "$1" >/dev/null 2>&1
    return $?
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -q -O /dev/null "$1" >/dev/null 2>&1
    return $?
  fi

  echo "Neither curl nor wget is installed on the host." >&2
  return 127
}

attempt=1
while [ "$attempt" -le "$RETRIES" ]; do
  status=0
  http_check "$BASE_URL/api/health/ready" || status=$?

  if [ "$status" -eq 0 ]; then
    echo "Healthcheck passed on attempt $attempt"
    exit 0
  fi

  if [ "$status" -eq 127 ]; then
    exit 1
  fi

  echo "Healthcheck attempt $attempt failed, retrying..."
  attempt=$((attempt + 1))
  sleep "$SLEEP_SECONDS"
done

echo "Healthcheck failed after $RETRIES attempts" >&2
exit 1

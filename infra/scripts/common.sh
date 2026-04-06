#!/usr/bin/env sh
set -eu

compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    echo "docker compose"
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
    return
  fi

  echo "Docker Compose is not installed. Install the Docker Compose plugin or docker-compose." >&2
  exit 1
}

run_compose() {
  command="$(compose_cmd)"
  exec $command "$@"
}


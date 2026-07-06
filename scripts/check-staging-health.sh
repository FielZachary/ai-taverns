#!/usr/bin/env sh
set -eu

origin="${1:?usage: scripts/check-staging-health.sh https://staging.example.com}"
origin="${origin%/}"

check() {
  path="$1"
  url="${origin}${path}"
  status="$(curl -fsS -o /dev/null -w '%{http_code}' "$url")"
  if [ "$status" != "200" ]; then
    echo "health check failed: ${url} returned ${status}" >&2
    exit 1
  fi
  echo "ok ${url}"
}

check "/health"
check "/"

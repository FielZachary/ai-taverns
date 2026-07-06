#!/usr/bin/env sh
set -eu

origin="${1:?usage: scripts/check-production-health.sh https://example.com}"
origin="${origin%/}"

check_status() {
  path="$1"
  expected_status="$2"
  url="${origin}${path}"
  status="$(curl -fsS -o /dev/null -w '%{http_code}' "$url")"
  if [ "$status" != "$expected_status" ]; then
    echo "production check failed: ${url} returned ${status}, expected ${expected_status}" >&2
    exit 1
  fi
  echo "ok ${url}"
}

check_status "/health" "200"
check_status "/" "200"
check_status "/api/auth/me" "200"

#!/usr/bin/env sh
set -eu

origin="${PRODUCTION_ORIGIN:-https://aitaverns.com}"
origin="${origin%/}"
compose_dir="${COMPOSE_PROJECT_DIR:-/opt/ai-taverns}"
compose_file="${COMPOSE_FILE:-$compose_dir/infra/docker-compose.production.yml}"
env_file="${ENV_FILE:-$compose_dir/infra/production.env}"
backup_dir="${BACKUP_DIR:-$compose_dir/infra/backups}"
disk_path="${DISK_PATH:-$compose_dir}"
disk_warn_percent="${DISK_USAGE_WARN_PERCENT:-85}"
backup_max_age_hours="${BACKUP_MAX_AGE_HOURS:-26}"
postgres_connection_warn_percent="${POSTGRES_CONNECTION_WARN_PERCENT:-80}"
container_cpu_warn_percent="${CONTAINER_CPU_WARN_PERCENT:-90}"
container_memory_warn_percent="${CONTAINER_MEMORY_WARN_PERCENT:-90}"

failures=0

notify() {
  message="$1"
  echo "$message" >&2

  if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
    escaped="$(printf '%s' "$message" | sed 's/\\/\\\\/g; s/"/\\"/g')"
    curl -fsS \
      -X POST \
      -H "content-type: application/json" \
      --data "{\"text\":\"${escaped}\"}" \
      "$ALERT_WEBHOOK_URL" >/dev/null || true
  fi
}

fail() {
  failures=$((failures + 1))
  notify "AI Taverns production monitor failed: $1"
}

ok() {
  echo "ok $1"
}

check_public_endpoint() {
  path="$1"
  expected_status="$2"
  url="${origin}${path}"
  status="$(curl -fsS -o /dev/null -w '%{http_code}' "$url" || printf '000')"
  if [ "$status" != "$expected_status" ]; then
    fail "${url} returned ${status}, expected ${expected_status}"
    return
  fi
  ok "$url"
}

check_service_running() {
  service="$1"
  if docker compose --env-file "$env_file" -f "$compose_file" ps --services --filter status=running | grep -qx "$service"; then
    ok "service ${service} is running"
    return
  fi
  fail "service ${service} is not running"
}

check_disk_usage() {
  usage="$(df -P "$disk_path" | awk 'NR == 2 { gsub("%", "", $5); print $5 }')"
  if [ -z "$usage" ]; then
    fail "could not read disk usage for ${disk_path}"
    return
  fi

  if [ "$usage" -ge "$disk_warn_percent" ]; then
    fail "disk usage for ${disk_path} is ${usage}%, threshold ${disk_warn_percent}%"
    return
  fi

  ok "disk usage ${usage}% below ${disk_warn_percent}%"
}

check_backup_recency() {
  if [ ! -d "$backup_dir" ]; then
    fail "backup directory missing: ${backup_dir}"
    return
  fi

  latest_backup="$(find "$backup_dir" -name 'ai-taverns-production-*.dump' -type f -print | sort | tail -n 1)"
  if [ -z "$latest_backup" ]; then
    fail "no production backup dumps found in ${backup_dir}"
    return
  fi

  now="$(date +%s)"
  modified="$(stat -c %Y "$latest_backup" 2>/dev/null || stat -f %m "$latest_backup")"
  age_hours="$(( (now - modified) / 3600 ))"

  if [ "$age_hours" -gt "$backup_max_age_hours" ]; then
    fail "latest backup is ${age_hours}h old, threshold ${backup_max_age_hours}h: ${latest_backup}"
    return
  fi

  ok "latest backup ${age_hours}h old"
}

check_postgres_connections() {
  output="$(
    docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres sh -lc \
      'psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --tuples-only --no-align --command="select (select count(*) from pg_stat_activity),(select setting::int from pg_settings where name = '"'"'max_connections'"'"');"' \
      2>/dev/null || true
  )"

  current="$(printf '%s' "$output" | awk -F '|' 'NF == 2 { print $1; exit }')"
  maximum="$(printf '%s' "$output" | awk -F '|' 'NF == 2 { print $2; exit }')"

  if [ -z "$current" ] || [ -z "$maximum" ] || [ "$maximum" -eq 0 ]; then
    fail "could not read Postgres connection count"
    return
  fi

  percent="$(( current * 100 / maximum ))"
  if [ "$percent" -ge "$postgres_connection_warn_percent" ]; then
    fail "Postgres connections at ${current}/${maximum} (${percent}%), threshold ${postgres_connection_warn_percent}%"
    return
  fi

  ok "Postgres connections ${current}/${maximum} (${percent}%)"
}

check_container_pressure() {
  service="$1"
  container_id="$(docker compose --env-file "$env_file" -f "$compose_file" ps -q "$service" 2>/dev/null || true)"
  if [ -z "$container_id" ]; then
    fail "could not find container id for ${service}"
    return
  fi

  stats="$(docker stats --no-stream --format '{{.CPUPerc}} {{.MemPerc}}' "$container_id" 2>/dev/null || true)"
  cpu="$(printf '%s' "$stats" | awk '{ gsub("%", "", $1); print $1 }')"
  memory="$(printf '%s' "$stats" | awk '{ gsub("%", "", $2); print $2 }')"

  if [ -z "$cpu" ] || [ -z "$memory" ]; then
    fail "could not read CPU/memory stats for ${service}"
    return
  fi

  if awk "BEGIN { exit !($cpu >= $container_cpu_warn_percent) }"; then
    fail "${service} CPU is ${cpu}%, threshold ${container_cpu_warn_percent}%"
    return
  fi

  if awk "BEGIN { exit !($memory >= $container_memory_warn_percent) }"; then
    fail "${service} memory is ${memory}%, threshold ${container_memory_warn_percent}%"
    return
  fi

  ok "${service} CPU ${cpu}%, memory ${memory}%"
}

check_public_endpoint "/health" "200"
check_public_endpoint "/" "200"
check_public_endpoint "/api/auth/me" "200"

if [ -f "$compose_file" ] && [ -f "$env_file" ]; then
  for service in postgres api web proxy backup; do
    check_service_running "$service"
    check_container_pressure "$service"
  done
  check_disk_usage
  check_backup_recency
  check_postgres_connections
else
  fail "compose or env file missing: ${compose_file}, ${env_file}"
fi

if [ "$failures" -gt 0 ]; then
  exit 1
fi

ok "production monitoring checks passed"

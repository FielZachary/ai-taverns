#!/usr/bin/env sh
set -eu

backup_path="${1:?usage: scripts/restore-production-backup.sh infra/backups/ai-taverns-production-YYYYMMDDTHHMMSSZ.dump}"
compose_file="${COMPOSE_FILE:-infra/docker-compose.production.yml}"
env_file="${ENV_FILE:-infra/production.env}"

if [ ! -f "$backup_path" ]; then
  echo "backup not found: $backup_path" >&2
  exit 1
fi

docker compose --env-file "$env_file" -f "$compose_file" cp "$backup_path" postgres:/tmp/restore.dump
docker compose --env-file "$env_file" -f "$compose_file" exec postgres sh -c '
  set -eu
  dropdb --if-exists --username="$POSTGRES_USER" "$POSTGRES_DB"
  createdb --username="$POSTGRES_USER" "$POSTGRES_DB"
  pg_restore --clean --if-exists --no-owner --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" /tmp/restore.dump
'

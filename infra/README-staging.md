# Droplet Staging

Milestone 6 staging runs the web app, Fastify API, Postgres, Caddy reverse proxy, and automated database backups on a DigitalOcean droplet.

## First Setup

1. Point a staging DNS record at the droplet.
2. Install Docker Engine with the Compose plugin.
3. Copy this repository to `/opt/ai-taverns`.
4. Copy `infra/staging.env.example` to `infra/staging.env` and fill every value.
5. Start the stack:

```bash
docker compose --env-file infra/staging.env -f infra/docker-compose.staging.yml up -d --build
```

Caddy handles TLS automatically for `STAGING_DOMAIN`. The proxy routes `/api/*` and `/health` to `apps/api`, and all other traffic to `apps/web`.

## Verification

Run:

```bash
scripts/check-staging-health.sh https://your-staging-domain.example
docker compose --env-file infra/staging.env -f infra/docker-compose.staging.yml ps
```

The `api`, `web`, `postgres`, and `proxy` services should report healthy. The API container runs database migrations before starting.

## Backups

The `backup` service writes custom-format Postgres dumps to `infra/backups` every `BACKUP_INTERVAL_SECONDS` seconds and deletes files older than `BACKUP_RETENTION_DAYS`.

Create an immediate manual backup with:

```bash
docker compose --env-file infra/staging.env -f infra/docker-compose.staging.yml exec backup sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump --host=postgres --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --file="/backups/ai-taverns-manual-$(date -u +%Y%m%dT%H%M%SZ).dump"'
```

Restore a backup on staging with:

```bash
scripts/restore-staging-backup.sh infra/backups/ai-taverns-YYYYMMDDTHHMMSSZ.dump
```

Run at least one restore drill before promoting this stack to production cutover work.

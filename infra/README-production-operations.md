# Production Operations

Use this runbook after the Milestone 7 cutover window. The live production stack runs from `/opt/ai-taverns` on the DigitalOcean droplet with Docker Compose, Caddy, Fastify, Next.js, self-hosted Postgres, and the backup service.

## Safe Droplet Access

Read `infra/AGENT-DROPLET-ACCESS.md` before opening a droplet shell. Use the one-time access helper for routine operations:

```bash
npm run droplet:one-time-access
```

To run a single command and clean up the temporary key immediately:

```bash
npm run droplet:one-time-access -- docker compose --env-file /opt/ai-taverns/infra/production.env -f /opt/ai-taverns/infra/docker-compose.production.yml ps
```

## Deploy

From the droplet checkout:

```bash
cd /opt/ai-taverns
git fetch origin
git checkout production
git pull --ff-only origin production
docker compose --env-file infra/production.env -f infra/docker-compose.production.yml up -d --build
docker compose --env-file infra/production.env -f infra/docker-compose.production.yml ps
```

Then verify from outside the droplet:

```bash
scripts/check-production-health.sh https://aitaverns.com
```

## GitHub Actions Deploy

The `Deploy production` workflow rebuilds production automatically when
`production` is pushed, and it can also be started manually from GitHub
Actions.

Required repository or environment secrets:

- `PRODUCTION_SSH_HOST`: production droplet host or IP.
- `PRODUCTION_SSH_KEY`: private SSH key allowed to deploy to the droplet.

Optional secrets:

- `PRODUCTION_SSH_USER`: SSH user, defaults to `root`.
- `PRODUCTION_SSH_PORT`: SSH port, defaults to `22`.

Optional repository or environment variables:

- `PRODUCTION_DEPLOY_PATH`: deploy directory, defaults to `/opt/ai-taverns`.
- `PRODUCTION_ORIGIN`: public origin checked after deploy, defaults to `https://aitaverns.com`.

The workflow packages the exact pushed commit, uploads it to the droplet,
preserves `/opt/ai-taverns/infra/production.env` and
`/opt/ai-taverns/infra/backups`, rebuilds
`infra/docker-compose.production.yml`, runs production monitoring on the
droplet, and then runs the public health check from the GitHub runner.

## Health Checks

Check the public endpoints:

```bash
curl -fsS https://aitaverns.com/health
curl -fsS https://aitaverns.com/api/auth/me
curl -fsS https://www.aitaverns.com/
```

Check service health on the droplet:

```bash
docker compose --env-file infra/production.env -f infra/docker-compose.production.yml ps
docker compose --env-file infra/production.env -f infra/docker-compose.production.yml logs --tail=100 api web proxy backup
```

## Monitoring And Alerts

Run the production monitor from the droplet checkout:

```bash
cd /opt/ai-taverns
set -a && . infra/production.env && set +a
./scripts/check-production-monitoring.sh
```

The monitor checks public health endpoints, Docker service status, container CPU/memory pressure, disk usage, backup recency, and Postgres connection pressure. It exits non-zero when a threshold is crossed. Set `ALERT_WEBHOOK_URL` in `infra/production.env` to post failures to a webhook, and tune these thresholds if the droplet size changes:

```bash
PRODUCTION_ORIGIN=https://aitaverns.com
DISK_USAGE_WARN_PERCENT=85
BACKUP_MAX_AGE_HOURS=26
POSTGRES_CONNECTION_WARN_PERCENT=80
CONTAINER_CPU_WARN_PERCENT=90
CONTAINER_MEMORY_WARN_PERCENT=90
ALERT_WEBHOOK_URL=
```

Install it as a five-minute cron check on the droplet:

```bash
*/5 * * * * cd /opt/ai-taverns && set -a && . infra/production.env && set +a && ./scripts/check-production-monitoring.sh >> /var/log/ai-taverns-monitor.log 2>&1
```

Use the same command manually after deploys and during the rollback window. A passing run is the concrete proof point for the migration plan's disk, CPU/service-health, DB-connection, backup, and alerting requirement.

## Backups

The `backup` service writes custom-format Postgres dumps into `/opt/ai-taverns/infra/backups`.

Create a manual backup before risky maintenance:

```bash
docker compose --env-file infra/production.env -f infra/docker-compose.production.yml exec backup sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump --host=postgres --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --file="/backups/ai-taverns-production-manual-$(date -u +%Y%m%dT%H%M%SZ).dump"'
```

Verify recent backup files exist:

```bash
ls -lh /opt/ai-taverns/infra/backups | tail
```

## Restore

Restore only during an approved maintenance or rollback window. Copy the selected dump to the machine that will run the restore command, then run:

```bash
scripts/restore-production-backup.sh infra/backups/ai-taverns-production-YYYYMMDDTHHMMSSZ.dump
```

After restore, run:

```bash
node scripts/verify-production-cutover.mjs
scripts/check-production-health.sh https://aitaverns.com
```

## Incident Response

1. Confirm whether the issue is public traffic, one container, database, disk, or provider calls.
2. Capture current service state and recent logs before restarting anything.
3. If disk is near full, preserve the newest successful backup and remove only known generated artifacts such as old backup dumps outside retention.
4. If Postgres is unhealthy, stop web/API writes before restore or rollback work.
5. If a deploy caused the issue, redeploy the last known good commit or restore DNS only if the rollback window still has a viable previous host.
6. Record the incident, commands run, data risk, and follow-up fixes in Pageden.

## Routine Monitoring

Check these after deploys and during production reviews:

- public health endpoints
- Docker service health
- disk usage
- CPU and memory pressure
- Postgres connection count
- backup recency and restore viability
- login, campaign creation, join flow, room submit, DM turn, regenerate, and debug trace access

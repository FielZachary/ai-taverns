# Production Cutover

Milestone 7 promotes the droplet stack from staging to production after the production database has been migrated and verified.

## Pre-Cutover

1. Keep Vercel and the old database warm for the rollback window.
2. Lower DNS TTL before the cutover window.
3. Copy `infra/production.env.example` to `infra/production.env` on the droplet and fill every value.
4. Import the migrated production data into the droplet Postgres service.
5. Start the production stack:

```bash
docker compose --env-file infra/production.env -f infra/docker-compose.production.yml up -d --build
```

6. Run the data checks:

```bash
node scripts/verify-production-cutover.mjs
```

Set `CUTOVER_STRICT_OWNERS=true` when every active migrated campaign must already be claimed by an owned user.

## One-Time SSH Access

See `infra/AGENT-DROPLET-ACCESS.md` for the full agent safety runbook.

Use the one-time access helper for production droplet maintenance so a temporary key exists only for the current session or command.

```bash
export DROPLET_SSH_HOST=your-production-droplet.example
export DROPLET_SSH_USER=root
export DROPLET_BOOTSTRAP_SSH_KEY="$HOME/.ssh/ai-taverns-production-bootstrap"

npm run droplet:one-time-access
```

For a single production check:

```bash
npm run droplet:one-time-access -- docker compose --env-file /opt/ai-taverns/infra/production.env -f /opt/ai-taverns/infra/docker-compose.production.yml ps
```

The helper installs a temporary ed25519 public key with agent, X11, and port forwarding disabled, removes the remote key entry as soon as login succeeds, and deletes local key material on exit. Set `DROPLET_ACCESS_TTL_SECONDS` to cap the session lifetime when `timeout(1)` is available locally; it defaults to one hour.

## DNS Cutover

After the production stack is healthy and the data checks pass, point the production domain at the droplet.

Verify from outside the droplet:

```bash
scripts/check-production-health.sh https://your-production-domain.example
docker compose --env-file infra/production.env -f infra/docker-compose.production.yml ps
```

The `api`, `web`, `postgres`, and `proxy` services should report healthy. The API container runs database migrations before starting.

## Backups And Restore

The `backup` service writes custom-format Postgres dumps to `infra/backups` every `BACKUP_INTERVAL_SECONDS` seconds and deletes files older than `BACKUP_RETENTION_DAYS`.

Create an immediate manual production backup with:

```bash
docker compose --env-file infra/production.env -f infra/docker-compose.production.yml exec backup sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump --host=postgres --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --file="/backups/ai-taverns-production-manual-$(date -u +%Y%m%dT%H%M%SZ).dump"'
```

Restore a production backup only during an approved maintenance or rollback window:

```bash
scripts/restore-production-backup.sh infra/backups/ai-taverns-production-YYYYMMDDTHHMMSSZ.dump
```

For ongoing deploy, backup, restore, monitoring, and incident work after the cutover window, use `infra/README-production-operations.md`.

## Rollback Window

Keep Vercel and the previous database available for at least 1-2 weeks after DNS cutover. During that window, monitor login, campaign creation, joins, room turns, DM calls, disk usage, CPU, and Postgres connection count.

If the droplet stack fails during the rollback window:

1. Stop writes to the droplet stack.
2. Point DNS back to the previous production host.
3. Keep the droplet database snapshot for investigation.
4. Record whether any accepted writes need manual reconciliation before retrying cutover.

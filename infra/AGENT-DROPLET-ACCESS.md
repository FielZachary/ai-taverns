---
status: canonical
owner: ai-taverns
last-reviewed: 2026-07-06
applies-to: droplet-access agent-operations ssh-safety deployment
read-when:
  - an agent needs to access the AI Taverns DigitalOcean droplet
  - an agent needs to run droplet maintenance commands
  - an agent is changing staging or production deployment state
---

# Safe Droplet Access For Agents

This is the agent runbook for accessing the AI Taverns DigitalOcean droplet.

Agents must use one-time droplet access for routine staging or production operations. Do not add a durable personal or agent SSH key to the droplet for normal maintenance.

Source docs:

- [[ai-taverns/00-start-here/agent-index]]
- [[ai-taverns/03-implementation/fastify-postgres-droplet-migration-plan]]

## Default Rule

Use:

```bash
npm run droplet:one-time-access
```

The helper in `scripts/droplet-one-time-access.sh` creates a temporary SSH key, installs it on the droplet using a durable bootstrap key, logs in with the temporary key, removes the temporary public key from `authorized_keys` as soon as login succeeds, and deletes local temporary key material when the session exits.

## Required Environment

Set these before accessing the droplet:

```bash
export DROPLET_SSH_HOST=your-droplet-host-or-ip
export DROPLET_SSH_USER=root
export DROPLET_BOOTSTRAP_SSH_KEY="$HOME/.ssh/ai-taverns-bootstrap"
```

Optional:

```bash
export DROPLET_SSH_PORT=22
export DROPLET_ACCESS_TTL_SECONDS=3600
```

`DROPLET_BOOTSTRAP_SSH_KEY` is the durable private key used only to install and clean up the temporary key. If `DROPLET_BOOTSTRAP_SSH_KEY` is unset, the helper falls back to `DROPLET_SSH_KEY`. For the AI Taverns droplet, the bootstrap key is authorized for the `root` account; the local key filename does not need to match the remote username.

For local agent runs, `npm run droplet:one-time-access` loads only the
`DROPLET_*` settings from the ignored `apps/api/.env.local` file. Keep the
private key outside the repository and set `DROPLET_BOOTSTRAP_SSH_KEY` to its
local path. Run `npm run droplet:preflight` before a production maintenance
task to verify the path and one-time access configuration.

## Interactive Access

Open a temporary shell:

```bash
npm run droplet:one-time-access
```

Use the shell for the smallest necessary maintenance task, then exit.

## Single Command Access

Prefer single-command access when possible because it limits the maintenance window.

Staging status example:

```bash
npm run droplet:one-time-access -- docker compose --env-file /opt/ai-taverns/infra/staging.env -f /opt/ai-taverns/infra/docker-compose.staging.yml ps
```

Production status example:

```bash
npm run droplet:one-time-access -- docker compose --env-file /opt/ai-taverns/infra/production.env -f /opt/ai-taverns/infra/docker-compose.production.yml ps
```

## Safety Properties

The temporary key is constrained in `authorized_keys` with:

- a forced command that removes its own `authorized_keys` line before handing control to the requested shell or command
- `no-agent-forwarding`
- `no-X11-forwarding`
- `no-port-forwarding`

The local temporary private key is written under a temporary directory and removed by the helper cleanup trap.

If the local machine has `timeout(1)`, `DROPLET_ACCESS_TTL_SECONDS` caps the SSH session lifetime. On macOS, this cap may not be enforced unless `timeout(1)` is installed, but the remote key still self-removes on successful login.

## Agent Rules

- Do not use plain `ssh` for routine droplet access when this helper is available.
- Do not copy, print, persist, or reuse the generated temporary private key.
- Do not paste private key material into chat, logs, documents, shell history, or Pageden.
- Do not add long-lived `authorized_keys` entries unless the user explicitly asks for an emergency break-glass change.
- Do not disable the forced-command or forwarding restrictions on the temporary key.
- Do not run destructive deployment, database, DNS, or rollback commands unless the user asked for that operation or the current task clearly requires it.
- Prefer single-command access over an interactive shell when checking status or running one maintenance command.
- Keep production sessions short and record any production-impacting action in the relevant handoff or cutover notes.

## Cleanup Verification

The helper attempts cleanup in two places:

1. The temporary key removes its own `authorized_keys` line immediately after login succeeds.
2. The local cleanup trap also removes any remaining remote line with the same marker and deletes the local temporary directory.

If a session fails before login completes, run the helper again for a harmless command or inspect `~/.ssh/authorized_keys` on the droplet through the bootstrap path and remove any line containing `ai-taverns-one-time-`.

Example inspection command:

```bash
npm run droplet:one-time-access -- sh -lc "grep -n 'ai-taverns-one-time-' ~/.ssh/authorized_keys || true"
```

No output means no temporary access line remains.

## Related Runbooks

- `infra/README-staging.md`
- `infra/README-production-cutover.md`
- `scripts/droplet-one-time-access.sh`

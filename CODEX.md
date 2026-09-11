# Codex Project Instructions

## Git Workflow

Do not create, switch, delete, rename, or otherwise manage Git branches unless
the user explicitly requests it.

Do not open, update, merge, or enable auto-merge on a pull request unless the
user explicitly asks for that pull request action.

When working on code, remain on the branch the user specified. If they did not
specify one, remain on the current branch and report that branch when handing
off the work.

After code changes, commit and push only when required by higher-priority
instructions or when the user explicitly asks. A push must not create, update,
or merge a pull request unless the user explicitly requested that too.

When the user explicitly requests a pull request, first confirm its source and
target branches. Use the repository PR helper only after that explicit request.

When the user explicitly asks to promote `development` to `production`, create a
short-lived promotion branch from `production`, merge `origin/development` into
it, resolve conflicts, run the relevant checks, and then use:

```bash
npm run pr:promote-production
```

The production helper opens the PR against `production` and requests squash
auto-merge with an explicit clean squash title/body so the resulting production
push still triggers the deploy workflow. Never include GitHub Actions skip
directives in production promotion PR titles or bodies.

Never infer that a completed code change should be promoted, merged, or
deployed.

## Droplet Access

When the user asks to access the AI Taverns DigitalOcean droplet, prefer the
safe one-time access helper:

```bash
npm run droplet:one-time-access
```

Read `infra/AGENT-DROPLET-ACCESS.md` before opening a droplet shell or running
droplet maintenance commands. The helper creates a temporary SSH key, installs
it through a bootstrap SSH credential, removes the remote authorized key entry
as soon as login succeeds, and deletes local key material when the session
exits.

Required bootstrap access:

- `DROPLET_SSH_USER` should be `root` for the AI Taverns droplet.
- `DROPLET_BOOTSTRAP_SSH_KEY` may point to the durable bootstrap private key.
- If unset, the script falls back to `DROPLET_SSH_KEY`.

Do not use plain `ssh` for routine droplet access when the one-time helper is
available.

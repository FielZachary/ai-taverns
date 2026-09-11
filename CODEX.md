# Codex Project Instructions

## Git Workflow

Do not create, switch, delete, rename, or otherwise manage Git branches unless
the user explicitly requests it.

### Branch Creation Preflight

When the user asks to create a new branch, first verify that local
`development` exactly matches `origin/development`:

1. Run `git fetch origin`.
2. Compare `development` with `origin/development`.
3. If they differ, stop. Inform the user that local `development` is stale and
   ask whether they would like to sync it before creating the branch.
4. Only create the requested branch after they match.

Do not automatically pull, merge, rebase, reset, or otherwise synchronize
`development` unless the user explicitly authorizes it.

### Development Branch Protection

Never write, edit, generate, format, or commit code directly on the
`development` branch.

Before any code-changing action, verify the current branch. If it is
`development`, stop and ask the user whether they would like a new branch
created for the work. Ask them to provide the branch name. Do not infer or
choose a branch name, and do not make code changes until the user responds.

Do not open, update, or merge a pull request unless the user explicitly asks
for that pull request action.

When working on code, remain on the branch the user specified. If they did not
specify one, remain on the current branch and report that branch when handing
off the work.

After code changes, commit and push only when required by higher-priority
instructions or when the user explicitly asks. A push must not create, update,
or merge a pull request unless the user explicitly requested that too.

When the user explicitly requests a pull request, first confirm its source and
target branches. Then enable squash auto-merge unless the user explicitly asks
to leave auto-merge off. Use the repository PR helper only after that explicit
request.

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

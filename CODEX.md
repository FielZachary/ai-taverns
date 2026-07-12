# Codex Project Instructions

## Git Workflow

Use the PR-gated workflow for completed work when GitHub branch protection and
auto-merge are available:

```bash
git switch -c codex/<short-change-slug>
git add -A
git commit -m "<descriptive message>"
npm run pr:auto-merge
```

The helper pushes the current branch, opens a PR against `development` when one
does not already exist, and requests squash auto-merge with branch deletion.

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

Current repository caveat: GitHub branch protection/rulesets are unavailable
while this private repository lacks the required GitHub plan features. Until
that is resolved, keep using small verified changes and leave PRs open for
manual merge if auto-merge cannot be enabled.

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

- `DROPLET_BOOTSTRAP_SSH_KEY` may point to the durable bootstrap private key.
- If unset, the script falls back to `DROPLET_SSH_KEY`.

Do not use plain `ssh` for routine droplet access when the one-time helper is
available.

## Hermes Access

When the user asks to access Hermes, prefer the secure ephemeral bridge:

```bash
npm run hermes:secure-bridge
```

This script generates a temporary SSH key, installs the public key on Hermes
through a bootstrap SSH credential, starts the bridge using the temporary key,
and removes both the remote authorized key entry and local key material when the
bridge exits.

Required bootstrap access:

- `HERMES_BOOTSTRAP_SSH_KEY` may point to the durable bootstrap private key.
- If unset, the script falls back to `HERMES_SSH_KEY`, then `$HOME/hermes`.

The temporary key is constrained server-side with an `authorized_keys` forced
command and port-forwarding restriction. Do not use or persist the generated
temporary key outside the script lifecycle.

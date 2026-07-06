# Codex Project Instructions

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

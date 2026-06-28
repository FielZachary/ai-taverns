# Codex Project Instructions

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

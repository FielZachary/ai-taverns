#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  npm run droplet:one-time-access
  npm run droplet:one-time-access -- docker compose ps

Environment:
  DROPLET_SSH_HOST                Required droplet host or IP.
  DROPLET_SSH_USER                SSH user. Defaults to root.
  DROPLET_BOOTSTRAP_SSH_KEY       Durable private key used only to install/remove the temporary key.
  DROPLET_SSH_KEY                 Fallback bootstrap private key.
  DROPLET_SSH_PORT                SSH port. Defaults to 22.
  DROPLET_ACCESS_TTL_SECONDS      Optional max session lifetime when timeout(1) is available.

The script creates a temporary ed25519 key, installs its public key on the
droplet with a forced command that removes the key as soon as login succeeds,
then deletes local key material when the session exits.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

SSH_HOST="${DROPLET_SSH_HOST:-}"
SSH_USER="${DROPLET_SSH_USER:-root}"
SSH_PORT="${DROPLET_SSH_PORT:-22}"
BOOTSTRAP_SSH_KEY="${DROPLET_BOOTSTRAP_SSH_KEY:-${DROPLET_SSH_KEY:-}}"
ACCESS_TTL_SECONDS="${DROPLET_ACCESS_TTL_SECONDS:-3600}"

case "$SSH_HOST" in
  ("") echo "DROPLET_SSH_HOST is required." >&2; usage >&2; exit 1 ;;
esac

case "$SSH_PORT" in
  (*[!0-9]* | "") echo "DROPLET_SSH_PORT must be numeric." >&2; exit 1 ;;
esac

case "$ACCESS_TTL_SECONDS" in
  (*[!0-9]* | "") echo "DROPLET_ACCESS_TTL_SECONDS must be numeric." >&2; exit 1 ;;
esac

if [[ -z "$BOOTSTRAP_SSH_KEY" ]]; then
  echo "Set DROPLET_BOOTSTRAP_SSH_KEY to the durable private key for bootstrap access." >&2
  exit 1
fi

if [[ ! -r "$BOOTSTRAP_SSH_KEY" ]]; then
  echo "Droplet bootstrap key is not readable: $BOOTSTRAP_SSH_KEY" >&2
  exit 1
fi

TEMP_DIR="$(mktemp -d)"
TEMP_KEY="$TEMP_DIR/ai-taverns-droplet-one-time"
MARKER="ai-taverns-one-time-$(date +%Y%m%d%H%M%S)-$RANDOM"

cleanup() {
  local exit_code=$?
  set +e

  ssh -i "$BOOTSTRAP_SSH_KEY" \
    -p "$SSH_PORT" \
    -o BatchMode=yes \
    -o IdentitiesOnly=yes \
    -o StrictHostKeyChecking=accept-new \
    "$SSH_USER@$SSH_HOST" \
    "if [ -f ~/.ssh/authorized_keys ]; then awk -v marker='$MARKER' 'index(\$0, marker) == 0 { print }' ~/.ssh/authorized_keys > ~/.ssh/authorized_keys.tmp && mv ~/.ssh/authorized_keys.tmp ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys; fi" \
    >/dev/null 2>&1

  rm -rf "$TEMP_DIR"
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

ssh-keygen -q -t ed25519 -N "" -C "$MARKER" -f "$TEMP_KEY"

PUBLIC_KEY="$(cat "$TEMP_KEY.pub")"
ONE_TIME_COMMAND="marker='$MARKER'; auth=\"\$HOME/.ssh/authorized_keys\"; if [ -f \"\$auth\" ]; then awk -v marker=\"\$marker\" 'index(\$0, marker) == 0 { print }' \"\$auth\" > \"\$auth.tmp\" && mv \"\$auth.tmp\" \"\$auth\" && chmod 600 \"\$auth\"; fi; if [ -n \"\${SSH_ORIGINAL_COMMAND:-}\" ]; then exec sh -lc \"\$SSH_ORIGINAL_COMMAND\"; else exec \"\${SHELL:-/bin/sh}\" -l; fi"
ESCAPED_ONE_TIME_COMMAND="${ONE_TIME_COMMAND//\\/\\\\}"
ESCAPED_ONE_TIME_COMMAND="${ESCAPED_ONE_TIME_COMMAND//\"/\\\"}"
RESTRICTED_PUBLIC_KEY="command=\"$ESCAPED_ONE_TIME_COMMAND\",no-agent-forwarding,no-X11-forwarding,no-port-forwarding $PUBLIC_KEY"

printf "%s\n" "$RESTRICTED_PUBLIC_KEY" | ssh -i "$BOOTSTRAP_SSH_KEY" \
  -p "$SSH_PORT" \
  -o BatchMode=yes \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=accept-new \
  "$SSH_USER@$SSH_HOST" \
  "umask 077; mkdir -p ~/.ssh; touch ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys; cat >> ~/.ssh/authorized_keys"

printf "%s\n" "Temporary droplet access installed for $SSH_USER@$SSH_HOST."
printf "%s\n" "The temporary key removes itself from authorized_keys when login succeeds."
if command -v timeout >/dev/null 2>&1; then
  printf "%s\n" "This session is capped at ${ACCESS_TTL_SECONDS}s."
else
  printf "%s\n" "Install timeout(1) to enforce the optional ${ACCESS_TTL_SECONDS}s session cap locally."
fi

SSH_ARGS=(
  -i "$TEMP_KEY"
  -p "$SSH_PORT"
  -o BatchMode=yes
  -o IdentitiesOnly=yes
  -o ServerAliveInterval=30
  -o StrictHostKeyChecking=accept-new
)

if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_PREFIX=(timeout "$ACCESS_TTL_SECONDS")
else
  TIMEOUT_PREFIX=()
fi

if (($# > 0)); then
  if ((${#TIMEOUT_PREFIX[@]} > 0)); then
    "${TIMEOUT_PREFIX[@]}" ssh "${SSH_ARGS[@]}" "$SSH_USER@$SSH_HOST" "$@"
  else
    ssh "${SSH_ARGS[@]}" "$SSH_USER@$SSH_HOST" "$@"
  fi
else
  if ((${#TIMEOUT_PREFIX[@]} > 0)); then
    "${TIMEOUT_PREFIX[@]}" ssh -tt "${SSH_ARGS[@]}" "$SSH_USER@$SSH_HOST"
  else
    ssh -tt "${SSH_ARGS[@]}" "$SSH_USER@$SSH_HOST"
  fi
fi

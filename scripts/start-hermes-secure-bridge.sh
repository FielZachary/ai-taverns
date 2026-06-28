#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_ENV_FILE="$ROOT_DIR/apps/web/.env.local"

BOOTSTRAP_SSH_KEY="${HERMES_BOOTSTRAP_SSH_KEY:-${HERMES_SSH_KEY:-$HOME/hermes}}"
SSH_HOST="${HERMES_SSH_HOST:-209.97.166.202}"
SSH_USER="${HERMES_SSH_USER:-hermes}"
LOCAL_PORT="${HERMES_LOCAL_PORT:-8642}"
REMOTE_PORT="${HERMES_REMOTE_PORT:-8642}"
TOKEN="${HERMES_AGENT_TOKEN:-$(openssl rand -hex 32)}"

case "$LOCAL_PORT:$REMOTE_PORT" in
  (*[!0-9:]* | *::* | :* | *:) echo "Hermes ports must be numeric." >&2; exit 1 ;;
esac

case "$TOKEN" in
  (*[!A-Fa-f0-9]* | "") echo "Hermes agent token must be non-empty hex." >&2; exit 1 ;;
esac

if [[ ! -r "$BOOTSTRAP_SSH_KEY" ]]; then
  echo "Hermes bootstrap key is not readable: $BOOTSTRAP_SSH_KEY" >&2
  exit 1
fi

TEMP_DIR="$(mktemp -d)"
TEMP_KEY="$TEMP_DIR/hermes-codex-temp"
ORIGINAL_ENV_FILE="$TEMP_DIR/original.env.local"
MARKER="codex-hermes-temp-$(date +%Y%m%d%H%M%S)-$RANDOM"

cleanup() {
  local exit_code=$?
  set +e

  ssh -i "$BOOTSTRAP_SSH_KEY" \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    "$SSH_USER@$SSH_HOST" \
    "if [ -f ~/.ssh/authorized_keys ]; then awk -v marker='$MARKER' 'index(\$0, marker) == 0 { print }' ~/.ssh/authorized_keys > ~/.ssh/authorized_keys.tmp && mv ~/.ssh/authorized_keys.tmp ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys; fi" \
    >/dev/null 2>&1

  if [[ -f "$ORIGINAL_ENV_FILE" ]]; then
    cp "$ORIGINAL_ENV_FILE" "$WEB_ENV_FILE"
  else
    grep -v -E '^(HERMES_AGENT_URL|HERMES_AGENT_TOKEN)=' "$WEB_ENV_FILE" > "$TEMP_DIR/env.cleaned" 2>/dev/null
    mv "$TEMP_DIR/env.cleaned" "$WEB_ENV_FILE" 2>/dev/null
  fi

  rm -rf "$TEMP_DIR"
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

mkdir -p "$(dirname "$WEB_ENV_FILE")"
touch "$WEB_ENV_FILE"
cp "$WEB_ENV_FILE" "$ORIGINAL_ENV_FILE"

ssh-keygen -q -t ed25519 -N "" -C "$MARKER" -f "$TEMP_KEY"

REMOTE_COMMAND="API_SERVER_ENABLED=true API_SERVER_KEY=$TOKEN API_SERVER_HOST=127.0.0.1 API_SERVER_PORT=$REMOTE_PORT HERMES_ACCEPT_HOOKS=1 /home/hermes/hermes-venv/bin/hermes gateway run --replace"
ESCAPED_REMOTE_COMMAND="${REMOTE_COMMAND//\\/\\\\}"
ESCAPED_REMOTE_COMMAND="${ESCAPED_REMOTE_COMMAND//\"/\\\"}"
RESTRICTED_PUBLIC_KEY="restrict,port-forwarding,permitopen=\"127.0.0.1:$REMOTE_PORT\",command=\"$ESCAPED_REMOTE_COMMAND\" $(cat "$TEMP_KEY.pub")"

printf "%s\n" "$RESTRICTED_PUBLIC_KEY" | ssh -i "$BOOTSTRAP_SSH_KEY" \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  "$SSH_USER@$SSH_HOST" \
  "umask 077; mkdir -p ~/.ssh; touch ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys; cat >> ~/.ssh/authorized_keys"

TEMP_ENV_FILE="$(mktemp)"
{
  grep -v -E '^(HERMES_AGENT_URL|HERMES_AGENT_TOKEN)=' "$WEB_ENV_FILE" || true
  printf "HERMES_AGENT_URL=http://127.0.0.1:%s\n" "$LOCAL_PORT"
  printf "HERMES_AGENT_TOKEN=%s\n" "$TOKEN"
} > "$TEMP_ENV_FILE"
mv "$TEMP_ENV_FILE" "$WEB_ENV_FILE"

printf "%s\n" "Secure Hermes bridge env written to apps/web/.env.local"
printf "%s\n" "Temporary Hermes key installed. It will be removed when this bridge exits."
printf "%s\n" "Keep this terminal open while playing. Restart the Next dev server after starting this bridge."

ssh -i "$TEMP_KEY" \
  -o BatchMode=yes \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o StrictHostKeyChecking=accept-new \
  -L "$LOCAL_PORT:127.0.0.1:$REMOTE_PORT" \
  "$SSH_USER@$SSH_HOST"

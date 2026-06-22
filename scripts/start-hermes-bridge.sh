#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_ENV_FILE="$ROOT_DIR/apps/web/.env.local"

SSH_KEY="${HERMES_SSH_KEY:-$HOME/hermes}"
SSH_HOST="${HERMES_SSH_HOST:-209.97.166.202}"
SSH_USER="${HERMES_SSH_USER:-hermes}"
LOCAL_PORT="${HERMES_LOCAL_PORT:-8642}"
REMOTE_PORT="${HERMES_REMOTE_PORT:-8642}"
TOKEN="${HERMES_AGENT_TOKEN:-$(openssl rand -hex 32)}"

mkdir -p "$(dirname "$WEB_ENV_FILE")"
touch "$WEB_ENV_FILE"
TEMP_ENV_FILE="$(mktemp)"
{
  grep -v -E '^(HERMES_AGENT_URL|HERMES_AGENT_TOKEN)=' "$WEB_ENV_FILE" || true
  printf "HERMES_AGENT_URL=http://127.0.0.1:%s\n" "$LOCAL_PORT"
  printf "HERMES_AGENT_TOKEN=%s\n" "$TOKEN"
} > "$TEMP_ENV_FILE"
mv "$TEMP_ENV_FILE" "$WEB_ENV_FILE"

printf "%s\n" "Hermes bridge env written to apps/web/.env.local"
printf "%s\n" "Keep this terminal open while playing. Restart the Next dev server after starting this bridge."

ssh -i "$SSH_KEY" \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -L "$LOCAL_PORT:127.0.0.1:$REMOTE_PORT" \
  "$SSH_USER@$SSH_HOST" \
  "API_SERVER_ENABLED=true API_SERVER_KEY='$TOKEN' API_SERVER_HOST=127.0.0.1 API_SERVER_PORT='$REMOTE_PORT' HERMES_ACCEPT_HOOKS=1 /home/hermes/hermes-venv/bin/hermes gateway run --replace"

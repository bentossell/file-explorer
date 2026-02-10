#!/usr/bin/env bash
# deploy.sh — Deploy file-explorer to a remote machine and register it as a device
#
# Usage:
#   ./deploy.sh <ssh-host> [hub-url] [device-url]
#
# Examples:
#   ./deploy.sh vps-london                              # deploy + register with local hub
#   ./deploy.sh root@192.168.1.50                       # deploy to IP
#   ./deploy.sh vps-london http://mini:3456             # register with specific hub
#   ./deploy.sh vps-london http://mini:3456 http://box.tailnet:3456  # explicit remote url
#
# What it does:
#   1. Installs bun on remote (if needed)
#   2. Syncs file-explorer code
#   3. Installs deps
#   4. Starts the server (port 3456, bound 0.0.0.0)
#   5. Registers with the hub device API
#
# The remote machine needs: SSH access, internet (for bun install)

set -euo pipefail

SSH_HOST="${1:?Usage: ./deploy.sh <ssh-host> [hub-url] [device-url]}"
HUB_URL="${2:-http://127.0.0.1:3456}"
DEVICE_URL_OVERRIDE="${3:-}"
REMOTE_PORT=3456
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HUB_TOKEN="${HUB_TOKEN:-${FILE_EXPLORER_ADMIN_TOKEN:-${FILE_EXPLORER_API_TOKEN:-}}}"
DEVICE_AUTH_TOKEN="${DEVICE_AUTH_TOKEN:-${FILE_EXPLORER_ADMIN_TOKEN:-${FILE_EXPLORER_API_TOKEN:-}}}"

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

echo "🚀 Deploying file-explorer to ${SSH_HOST}..."

# 1. Ensure bun is installed
echo "📦 Checking bun..."
ssh "$SSH_HOST" "export PATH=\$HOME/.bun/bin:\$PATH; if which bun >/dev/null 2>&1; then echo 'bun found'; else
  echo 'Installing bun...';
  (apt-get update -qq && apt-get install -y -qq unzip) 2>/dev/null || (yum install -y unzip) 2>/dev/null || true;
  curl -fsSL https://bun.sh/install | bash;
fi" 2>&1 | grep -v "^$" | sed 's/^/   /'

# 2. Sync code
echo "📂 Syncing code..."
rsync -az --delete \
  --exclude='node_modules' \
  --exclude='.DS_Store' \
  --exclude='.test-sandbox*' \
  --exclude='.file-explorer' \
  "${SCRIPT_DIR}/" "${SSH_HOST}:~/file-explorer/" 2>&1 | sed 's/^/   /'

# 3. Install deps
echo "📥 Installing dependencies..."
ssh "$SSH_HOST" "export PATH=\$HOME/.bun/bin:\$PATH; cd ~/file-explorer && bun install" 2>&1 | tail -3 | sed 's/^/   /'

# 4. Start server (kill old, start new)
echo "🔄 Starting server on port ${REMOTE_PORT}..."
# Kill any existing instance
ssh "$SSH_HOST" "kill \$(lsof -t -i:${REMOTE_PORT}) 2>/dev/null; sleep 1; echo ok" 2>/dev/null || true
# Start in background via nohup + disown pattern
if [ -n "$DEVICE_AUTH_TOKEN" ]; then
  ssh -f "$SSH_HOST" "export PATH=\$HOME/.bun/bin:\$PATH; cd ~/file-explorer && PORT=${REMOTE_PORT} FILE_EXPLORER_ADMIN_TOKEN='${DEVICE_AUTH_TOKEN}' nohup bun server/index.ts > /tmp/file-explorer.log 2>&1 &" 2>/dev/null
else
  ssh -f "$SSH_HOST" "export PATH=\$HOME/.bun/bin:\$PATH; cd ~/file-explorer && PORT=${REMOTE_PORT} nohup bun server/index.ts > /tmp/file-explorer.log 2>&1 &" 2>/dev/null
fi
sleep 3
# Verify
if ssh "$SSH_HOST" "curl -sf http://127.0.0.1:${REMOTE_PORT}/ > /dev/null 2>&1 && echo ok" 2>/dev/null | grep -q ok; then
  echo "   Server running ✓"
else
  echo "   Server failed — checking log:"
  ssh "$SSH_HOST" "tail -20 /tmp/file-explorer.log" 2>/dev/null | sed 's/^/   /'
  exit 1
fi

# Resolve best remote URL (Tailscale first, then LAN/public)
REMOTE_TAILSCALE_DNS=$(ssh "$SSH_HOST" "if command -v tailscale >/dev/null 2>&1; then tailscale status --json 2>/dev/null | sed -n 's/.*\"DNSName\":[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p' | head -n1 | sed 's/\\.$//'; fi" 2>/dev/null || true)
REMOTE_TAILSCALE_IP=$(ssh "$SSH_HOST" "if command -v tailscale >/dev/null 2>&1; then tailscale ip -4 2>/dev/null | head -n1; fi" 2>/dev/null || true)
REMOTE_LAN_IP=$(ssh "$SSH_HOST" "hostname -I 2>/dev/null | awk '{print \$1}' || ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true" 2>/dev/null || true)
REMOTE_PUBLIC_IP=$(ssh "$SSH_HOST" "curl -4 -s --max-time 2 ifconfig.me 2>/dev/null || true" 2>/dev/null || true)

# 5. Register with hub
if [ -n "$DEVICE_URL_OVERRIDE" ]; then
  DEVICE_URL="$DEVICE_URL_OVERRIDE"
elif [ -n "$REMOTE_TAILSCALE_DNS" ]; then
  DEVICE_URL="http://${REMOTE_TAILSCALE_DNS}:${REMOTE_PORT}"
elif [ -n "$REMOTE_TAILSCALE_IP" ]; then
  DEVICE_URL="http://${REMOTE_TAILSCALE_IP}:${REMOTE_PORT}"
elif [ -n "$REMOTE_LAN_IP" ]; then
  DEVICE_URL="http://${REMOTE_LAN_IP}:${REMOTE_PORT}"
elif [ -n "$REMOTE_PUBLIC_IP" ]; then
  DEVICE_URL="http://${REMOTE_PUBLIC_IP}:${REMOTE_PORT}"
else
  echo "❌ Could not determine remote URL. Pass it explicitly as arg 3."
  exit 1
fi

DEVICE_NAME=$(echo "$SSH_HOST" | sed 's/@.*//; s/[^a-zA-Z0-9-]/-/g')
echo "   URL selected: ${DEVICE_URL}"
PAYLOAD="{\"name\":\"$(json_escape "$DEVICE_NAME")\",\"url\":\"$(json_escape "$DEVICE_URL")\",\"icon\":\"🖥️\""
if [ -n "$DEVICE_AUTH_TOKEN" ]; then
  PAYLOAD="${PAYLOAD},\"authToken\":\"$(json_escape "$DEVICE_AUTH_TOKEN")\""
fi
PAYLOAD="${PAYLOAD}}"

CURL_AUTH_ARGS=()
if [ -n "$HUB_TOKEN" ]; then
  CURL_AUTH_ARGS=(-H "Authorization: Bearer ${HUB_TOKEN}")
fi

echo "🔗 Registering with hub at ${HUB_URL}..."
RESULT=$(curl -sf "${CURL_AUTH_ARGS[@]}" -X POST "${HUB_URL}/api/devices" \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}" 2>&1) || true

if echo "$RESULT" | grep -q '"success":true'; then
  echo "   Registered ✓"
elif echo "$RESULT" | grep -q 'already exists'; then
  echo "   Already registered (updating...)"
  UPDATE_PAYLOAD="{\"url\":\"$(json_escape "$DEVICE_URL")\",\"enabled\":true"
  if [ -n "$DEVICE_AUTH_TOKEN" ]; then
    UPDATE_PAYLOAD="${UPDATE_PAYLOAD},\"authToken\":\"$(json_escape "$DEVICE_AUTH_TOKEN")\""
  fi
  UPDATE_PAYLOAD="${UPDATE_PAYLOAD}}"
  curl -sf "${CURL_AUTH_ARGS[@]}" -X PUT "${HUB_URL}/api/devices/${DEVICE_NAME}" \
    -H "Content-Type: application/json" \
    -d "${UPDATE_PAYLOAD}" > /dev/null 2>&1 || true
  echo "   Updated ✓"
else
  echo "   Registration: ${RESULT}"
  echo "   You can manually add: ${DEVICE_URL}"
fi

echo ""
echo "✅ Done! ${SSH_HOST} is now browsable at:"
echo "   Direct: ${DEVICE_URL}"
echo "   Via hub: ${HUB_URL} → device switcher"

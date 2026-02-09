#!/usr/bin/env bash
# deploy.sh — Deploy file-explorer to a remote machine and register it as a device
#
# Usage:
#   ./deploy.sh <ssh-host> [hub-url]
#
# Examples:
#   ./deploy.sh vps-london                              # deploy + register with local hub
#   ./deploy.sh root@192.168.1.50                       # deploy to IP
#   ./deploy.sh vps-london http://mini:3456             # register with specific hub
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

SSH_HOST="${1:?Usage: ./deploy.sh <ssh-host> [hub-url]}"
HUB_URL="${2:-http://127.0.0.1:3456}"
REMOTE_PORT=3456
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🚀 Deploying file-explorer to ${SSH_HOST}..."

# Resolve the remote's reachable IP/hostname for the hub
REMOTE_IP=$(ssh "$SSH_HOST" "hostname -I 2>/dev/null | awk '{print \$1}' || curl -s ifconfig.me" 2>/dev/null)
echo "   Remote IP: ${REMOTE_IP}"

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
ssh -f "$SSH_HOST" "export PATH=\$HOME/.bun/bin:\$PATH; cd ~/file-explorer && PORT=${REMOTE_PORT} nohup bun server/index.ts > /tmp/file-explorer.log 2>&1 &" 2>/dev/null
sleep 3
# Verify
if ssh "$SSH_HOST" "curl -sf http://127.0.0.1:${REMOTE_PORT}/ > /dev/null 2>&1 && echo ok" 2>/dev/null | grep -q ok; then
  echo "   Server running ✓"
else
  echo "   Server failed — checking log:"
  ssh "$SSH_HOST" "tail -20 /tmp/file-explorer.log" 2>/dev/null | sed 's/^/   /'
  exit 1
fi

# 5. Register with hub
DEVICE_URL="http://${REMOTE_IP}:${REMOTE_PORT}"
DEVICE_NAME=$(echo "$SSH_HOST" | sed 's/@.*//; s/[^a-zA-Z0-9-]/-/g')

echo "🔗 Registering with hub at ${HUB_URL}..."
RESULT=$(curl -sf -X POST "${HUB_URL}/api/devices" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${DEVICE_NAME}\",\"url\":\"${DEVICE_URL}\",\"icon\":\"🖥️\"}" 2>&1) || true

if echo "$RESULT" | grep -q '"success":true'; then
  echo "   Registered ✓"
elif echo "$RESULT" | grep -q 'already exists'; then
  echo "   Already registered (updating...)"
  curl -sf -X PUT "${HUB_URL}/api/devices/${DEVICE_NAME}" \
    -H "Content-Type: application/json" \
    -d "{\"url\":\"${DEVICE_URL}\",\"enabled\":true}" > /dev/null 2>&1 || true
  echo "   Updated ✓"
else
  echo "   Registration: ${RESULT}"
  echo "   You can manually add: ${DEVICE_URL}"
fi

echo ""
echo "✅ Done! ${SSH_HOST} is now browsable at:"
echo "   Direct: ${DEVICE_URL}"
echo "   Via hub: ${HUB_URL} → device switcher"

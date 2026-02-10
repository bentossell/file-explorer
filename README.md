# File Explorer

Self-hosted multi-machine file browser.
built with [droid](https://factory.ai)

## Model

- One instance is your `hub` (UI + device registry + proxy).
- You add machines to hub with:
- `URL mode` (recommended): remote runs file-explorer HTTP server.
- `SSH mode`: hub directly runs SSH commands on remote.

## Quickstart (Hub)

### 1. Install + run

```bash
git clone https://github.com/<your-org-or-user>/file-explorer.git
cd file-explorer
bun install
bun run build
FILE_EXPLORER_ADMIN_TOKEN=<strong-admin-token> bun run start
```

Open: `http://<hub-host>:3456`

### 2. Optional read-only token

```bash
FILE_EXPLORER_ADMIN_TOKEN=<strong-admin-token> \
FILE_EXPLORER_READ_TOKEN=<read-only-token> \
bun run start
```

## Add Machines

### URL mode (recommended)

Run file-explorer on remote machine:

```bash
git clone https://github.com/<your-org-or-user>/file-explorer.git
cd file-explorer
bun install
bun run build
PORT=3456 bun run start
```

Then in hub UI:

- Device switcher -> `Add a Machine` -> `Device URL`
- Paste host or URL.
- Host-only input works (app auto-adds `http://` + `:3456`).
- If remote has token auth, add `Remote token` field.

Good URL examples:

- `my-host.your-tailnet.ts.net`
- `http://my-host.your-tailnet.ts.net:3456`
- `http://192.168.1.20:3456`

### SSH mode (power users)

No remote HTTP server needed.

- Device switcher -> `Add a Machine` -> `SSH Host`
- Hub must SSH non-interactive to target (keys + config).
- Quick check from hub:

```bash
ssh my-host 'echo ok'
```

## Deploy Helper

Deploy remote + auto-register to hub:

```bash
HUB_TOKEN=<hub-admin-token> \
DEVICE_AUTH_TOKEN=<remote-admin-token-or-empty> \
./deploy.sh <ssh-host> [hub-url] [device-url]
```

Examples:

```bash
./deploy.sh vps-london
./deploy.sh mini http://hub.local:3456
./deploy.sh mini http://hub.local:3456 http://mini.your-tailnet.ts.net:3456
```

## What "Any Machine" Means

Machine is addable if hub has one of:

- Network route to machine URL (`URL mode`).
- SSH access to machine (`SSH mode`).

Usually works well:

- macOS, Linux, VPS, NAS, home servers.

Usually not practical directly:

- iOS/Android phones (no normal Bun server/SSH daemon setup).

## Security

Env vars:

- `FILE_EXPLORER_ADMIN_TOKEN`: full read/write.
- `FILE_EXPLORER_READ_TOKEN`: read-only.
- `FILE_EXPLORER_API_TOKEN`: legacy alias for admin token.

Behavior:

- Auth prompt appears in client when enabled.
- Write APIs require admin token.
- Read token can browse/search/preview/download.

## Troubleshooting

- `Cannot reach ...`:
- Remote not running, wrong host, wrong port, or no route from hub.
- Check: `curl http://<remote>:3456/api/files?path=`

- `Remote returned 401/403`:
- Remote token auth enabled.
- Fill `Remote token` when adding URL machine.

- SSH add fails:
- Validate from hub shell: `ssh <alias> 'echo ok'`

## Data Location

- Device registry + settings: `~/.file-explorer/`

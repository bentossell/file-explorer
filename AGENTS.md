# File Explorer Agent Instructions

> Inherits from ~/repos/AGENTS.md

## Project Commands

- Build: `bun run build`
- Dev: `bun run dev`
- Test all: `bun test`
- Test single: `bun test <path>`
- Start: `bun run start`
- Deploy to remote: `./deploy.sh <ssh-host> [hub-url]`

## Project Structure

- `server/index.ts` — Hono API server (file ops, device registry, proxy, settings, combos)
- `server/index.test.ts` — Core file API tests (49 tests)
- `server/devices.test.ts` — Device management + proxy tests (21 tests)
- `server/settings.test.ts` — Settings + combo views tests (15 tests)
- `client/index.tsx` — Full React SPA (single file, Tailwind via CDN)
- `client/index.html` — HTML shell with Tailwind config + custom theme
- `build.ts` — Bun build script (compiles client to dist/)
- `deploy.sh` — Remote deployment script (rsync + bun + auto-register)

## Architecture

### Multi-Device
- Each machine runs its own file-explorer instance on port 3456
- One instance acts as "hub" — others register as remote devices
- Hub proxies all requests through `/api/d/:deviceId/*` routes
- Device config stored in `~/.file-explorer/devices.json`
- Settings (local name/icon, combo views) in `~/.file-explorer/settings.json`

### API Routes
- `/api/files` — list directory
- `/api/search` — fuzzy search (Fuse.js)
- `/api/preview` — file preview (text/images)
- `/api/download` — file download
- `/api/info` — file metadata
- `/api/mkdir`, `/api/touch`, `/api/rename`, `/api/delete`, `/api/save`, `/api/upload`, `/api/duplicate` — file operations
- `/api/recent` — recent files tracking
- `/api/devices` — CRUD device registry
- `/api/devices/:id/health` — health check
- `/api/d/:deviceId/*` — device proxy
- `/api/settings` — local device customization
- `/api/combos` — CRUD combo views (named device groups)

### Client
- Single-file React app with inline Tailwind
- Device switcher dropdown + full device manager modal
- Combo views (custom device groups) + "All Devices" unified view
- Command palette (⌘K), favourites, recent files, file preview/edit
- Dark/light theme, grid/list view, drag-n-drop upload

## Key Patterns

- All file paths validated with `resolveSafePath()` to prevent traversal
- Device proxy strips device prefix and forwards to remote
- Local device always ID "local", cannot be deleted
- Combo views stored in settings.json alongside local device customization
- `createApi(deviceId)` in client scopes all API calls to active device

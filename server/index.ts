import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import * as fs from "fs";
import * as path from "path";
import Fuse from "fuse.js";

const app = new Hono();

// Store recent files in memory (would use SQLite in production)
let recentFiles: Array<{
  path: string;
  name: string;
  accessedAt: number;
  type: string;
  size: number;
}> = [];

const MAX_RECENT = 50;

// Root directory to browse (configurable via env)
const ROOT_DIR = process.env.FILE_EXPLORER_ROOT || process.env.HOME || "/";

// ─── Device Registry ─────────────────────────────────────────────────────────

interface DeviceConfig {
  id: string;
  name: string;
  url: string;       // base URL of the remote file-explorer instance e.g. http://192.168.1.5:3456
  icon?: string;      // emoji or identifier
  enabled: boolean;
}

interface ComboView {
  id: string;
  name: string;
  icon: string;
  deviceIds: string[];   // ordered list of device IDs to include
}

interface SettingsData {
  localName?: string;    // custom name for local device
  localIcon?: string;    // custom icon for local device
  comboViews: ComboView[];
}

const DEVICES_DIR = process.env.FILE_EXPLORER_DATA || path.join(process.env.HOME || "/tmp", ".file-explorer");
const DEVICES_FILE = path.join(DEVICES_DIR, "devices.json");
const SETTINGS_FILE = path.join(DEVICES_DIR, "settings.json");

function loadDevices(): DeviceConfig[] {
  try {
    if (fs.existsSync(DEVICES_FILE)) {
      return JSON.parse(fs.readFileSync(DEVICES_FILE, "utf-8"));
    }
  } catch { /* corrupt file, start fresh */ }
  return [];
}

function saveDevices(devices: DeviceConfig[]) {
  fs.mkdirSync(DEVICES_DIR, { recursive: true });
  fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2), "utf-8");
}

function loadSettings(): SettingsData {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
      return { comboViews: [], ...data };
    }
  } catch { /* corrupt file, start fresh */ }
  return { comboViews: [] };
}

function saveSettings(settings: SettingsData) {
  fs.mkdirSync(DEVICES_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}

// Get hostname for the local device name
function getLocalName(): string {
  const settings = loadSettings();
  if (settings.localName) return settings.localName;
  try {
    const hostname = require("os").hostname();
    return hostname.replace(/\.local$/, "");
  } catch { return "This Machine"; }
}

function getLocalIcon(): string {
  const settings = loadSettings();
  return settings.localIcon || "💻";
}

// ─── Identity ────────────────────────────────────────────────────────────────
// Returns this machine's identity so remote instances can register it

app.get("/api/whoami", (c) => {
  const os = require("os");
  const hostname = os.hostname().replace(/\.local$/, "");
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const iface of Object.values(interfaces) as any[]) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) ips.push(addr.address);
    }
  }
  return c.json({
    hostname,
    name: getLocalName(),
    icon: getLocalIcon(),
    port: parseInt(process.env.PORT || "3456"),
    ips,
  });
});

// ─── Device Management API ───────────────────────────────────────────────────

// List all devices (including "local")
app.get("/api/devices", (c) => {
  const devices = loadDevices();
  const local: DeviceConfig & { isLocal: true } = {
    id: "local",
    name: getLocalName(),
    url: "",
    icon: getLocalIcon(),
    enabled: true,
    isLocal: true,
  };
  return c.json({ devices: [local, ...devices] });
});

// Add a device
app.post("/api/devices", async (c) => {
  const body = await c.req.json();
  const { name, url, icon } = body;
  if (!name || !url) return c.json({ error: "name and url required" }, 400);

  const devices = loadDevices();
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `device-${Date.now()}`;

  if (id === "local" || devices.some((d) => d.id === id)) {
    return c.json({ error: "Device ID already exists" }, 409);
  }

  // Validate connectivity
  try {
    const cleanUrl = url.replace(/\/+$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const probe = await fetch(`${cleanUrl}/api/files?path=`, { signal: controller.signal }).finally(() => clearTimeout(timeout));
    if (!probe.ok) return c.json({ error: `Remote returned ${probe.status}` }, 502);
  } catch (err: any) {
    return c.json({ error: `Cannot reach ${url}: ${err.message || "timeout"}` }, 502);
  }

  const device: DeviceConfig = { id, name, url: url.replace(/\/+$/, ""), icon: icon || "🖥️", enabled: true };
  devices.push(device);
  saveDevices(devices);
  return c.json({ success: true, device });
});

// Update a device
app.put("/api/devices/:id", async (c) => {
  const id = c.req.param("id");
  if (id === "local") return c.json({ error: "Cannot edit local device" }, 400);
  const devices = loadDevices();
  const idx = devices.findIndex((d) => d.id === id);
  if (idx === -1) return c.json({ error: "Device not found" }, 404);

  const body = await c.req.json();
  if (body.name !== undefined) devices[idx].name = body.name;
  if (body.url !== undefined) devices[idx].url = body.url.replace(/\/+$/, "");
  if (body.icon !== undefined) devices[idx].icon = body.icon;
  if (body.enabled !== undefined) devices[idx].enabled = body.enabled;
  saveDevices(devices);
  return c.json({ success: true, device: devices[idx] });
});

// Delete a device
app.delete("/api/devices/:id", (c) => {
  const id = c.req.param("id");
  if (id === "local") return c.json({ error: "Cannot delete local device" }, 400);
  const devices = loadDevices();
  const filtered = devices.filter((d) => d.id !== id);
  if (filtered.length === devices.length) return c.json({ error: "Device not found" }, 404);
  saveDevices(filtered);
  return c.json({ success: true });
});

// Health check a device
app.get("/api/devices/:id/health", async (c) => {
  const id = c.req.param("id");
  if (id === "local") return c.json({ status: "ok", latency: 0 });

  const devices = loadDevices();
  const device = devices.find((d) => d.id === id);
  if (!device) return c.json({ error: "Device not found" }, 404);

  const start = Date.now();
  try {
    const res = await fetch(`${device.url}/api/files?path=`, { signal: AbortSignal.timeout(5000) });
    const latency = Date.now() - start;
    return c.json({ status: res.ok ? "ok" : "error", latency, httpStatus: res.status });
  } catch (err: any) {
    return c.json({ status: "unreachable", latency: Date.now() - start, error: err.message });
  }
});

// ─── Settings API ────────────────────────────────────────────────────────────

// Get all settings
app.get("/api/settings", (c) => {
  const settings = loadSettings();
  return c.json(settings);
});

// Update settings (partial merge)
app.put("/api/settings", async (c) => {
  const body = await c.req.json();
  const settings = loadSettings();
  if (body.localName !== undefined) settings.localName = body.localName || undefined;
  if (body.localIcon !== undefined) settings.localIcon = body.localIcon || undefined;
  saveSettings(settings);
  return c.json({ success: true, settings });
});

// ─── Combo Views API ─────────────────────────────────────────────────────────

// List combo views
app.get("/api/combos", (c) => {
  const settings = loadSettings();
  return c.json({ combos: settings.comboViews });
});

// Create combo view
app.post("/api/combos", async (c) => {
  const body = await c.req.json();
  const { name, icon, deviceIds } = body;
  if (!name) return c.json({ error: "name required" }, 400);
  if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
    return c.json({ error: "deviceIds required (array of device IDs)" }, 400);
  }

  const settings = loadSettings();
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `combo-${Date.now()}`;

  if (settings.comboViews.some((v) => v.id === id)) {
    return c.json({ error: "Combo view with this name already exists" }, 409);
  }

  const combo: ComboView = { id, name, icon: icon || "📁", deviceIds };
  settings.comboViews.push(combo);
  saveSettings(settings);
  return c.json({ success: true, combo });
});

// Update combo view
app.put("/api/combos/:id", async (c) => {
  const id = c.req.param("id");
  const settings = loadSettings();
  const idx = settings.comboViews.findIndex((v) => v.id === id);
  if (idx === -1) return c.json({ error: "Combo view not found" }, 404);

  const body = await c.req.json();
  if (body.name !== undefined) settings.comboViews[idx].name = body.name;
  if (body.icon !== undefined) settings.comboViews[idx].icon = body.icon;
  if (body.deviceIds !== undefined) settings.comboViews[idx].deviceIds = body.deviceIds;
  saveSettings(settings);
  return c.json({ success: true, combo: settings.comboViews[idx] });
});

// Delete combo view
app.delete("/api/combos/:id", (c) => {
  const id = c.req.param("id");
  const settings = loadSettings();
  const filtered = settings.comboViews.filter((v) => v.id !== id);
  if (filtered.length === settings.comboViews.length) return c.json({ error: "Combo view not found" }, 404);
  settings.comboViews = filtered;
  saveSettings(settings);
  return c.json({ success: true });
});

// ─── Device Proxy ────────────────────────────────────────────────────────────
// Routes: /api/d/:deviceId/files, /api/d/:deviceId/mkdir, etc.
// For "local" → fall through to normal handlers. For remote → proxy to device URL.

app.all("/api/d/:deviceId/*", async (c) => {
  const deviceId = c.req.param("deviceId");
  if (deviceId === "local") {
    // Rewrite URL to local handler: /api/d/local/files?x=y → /api/files?x=y
    const suffix = c.req.path.replace(`/api/d/local`, "");
    const localUrl = new URL(c.req.url);
    localUrl.pathname = `/api${suffix}`;
    const newReq = new Request(localUrl.toString(), {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: c.req.method !== "GET" && c.req.method !== "HEAD" ? c.req.raw.body : undefined,
    });
    return app.fetch(newReq);
  }

  const devices = loadDevices();
  const device = devices.find((d) => d.id === deviceId);
  if (!device) return c.json({ error: "Device not found" }, 404);
  if (!device.enabled) return c.json({ error: "Device is disabled" }, 403);

  // Proxy to remote device
  const suffix = c.req.path.replace(`/api/d/${deviceId}`, "");
  const remoteUrl = new URL(`${device.url}/api${suffix}`);
  // Forward query params
  const originalUrl = new URL(c.req.url);
  originalUrl.searchParams.forEach((v, k) => remoteUrl.searchParams.set(k, v));

  try {
    const proxyHeaders = new Headers(c.req.raw.headers);
    proxyHeaders.delete("host");

    const proxyController = new AbortController();
    const proxyTimeout = setTimeout(() => proxyController.abort(), 30000);
    const proxyRes = await fetch(remoteUrl.toString(), {
      method: c.req.method,
      headers: proxyHeaders,
      body: c.req.method !== "GET" && c.req.method !== "HEAD" ? c.req.raw.body : undefined,
      signal: proxyController.signal,
    }).finally(() => clearTimeout(proxyTimeout));

    // Forward the response
    return new Response(proxyRes.body, {
      status: proxyRes.status,
      headers: proxyRes.headers,
    });
  } catch (err: any) {
    return c.json({ error: `Proxy error: ${err.message}` }, 502);
  }
});

// File type categories
function getFileType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico", ".bmp"];
  const videoExts = [".mp4", ".webm", ".mov", ".avi", ".mkv"];
  const audioExts = [".mp3", ".wav", ".ogg", ".flac", ".m4a"];
  const codeExts = [".js", ".ts", ".jsx", ".tsx", ".py", ".rb", ".go", ".rs", ".java", ".c", ".cpp", ".h", ".css", ".scss", ".html", ".json", ".yaml", ".yml", ".toml", ".md", ".sh", ".bash", ".zsh"];
  const docExts = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt"];
  const archiveExts = [".zip", ".tar", ".gz", ".rar", ".7z"];

  if (imageExts.includes(ext)) return "image";
  if (videoExts.includes(ext)) return "video";
  if (audioExts.includes(ext)) return "audio";
  if (codeExts.includes(ext)) return "code";
  if (docExts.includes(ext)) return "document";
  if (archiveExts.includes(ext)) return "archive";
  return "file";
}

// Get file icon based on type
function getFileIcon(filename: string, isDir: boolean): string {
  if (isDir) return "folder";
  return getFileType(filename);
}

// Resolve and validate path (prevent directory traversal)
function resolveSafePath(requestedPath: string): string | null {
  const resolved = path.resolve(ROOT_DIR, requestedPath);
  if (!resolved.startsWith(ROOT_DIR)) {
    return null;
  }
  return resolved;
}

app.use("*", cors());

// API: List directory contents
app.get("/api/files", async (c) => {
  const requestedPath = c.req.query("path") || "";
  const safePath = resolveSafePath(requestedPath);

  if (!safePath) {
    return c.json({ error: "Invalid path" }, 400);
  }

  try {
    const stats = fs.statSync(safePath);
    if (!stats.isDirectory()) {
      return c.json({ error: "Not a directory" }, 400);
    }

    const showHidden = c.req.query("showHidden") === "true";
    const entries = fs.readdirSync(safePath, { withFileTypes: true });
    const files = entries
      .filter(entry => showHidden || !entry.name.startsWith(".")) // Hide hidden files unless requested
      .map(entry => {
        const fullPath = path.join(safePath, entry.name);
        const relativePath = path.relative(ROOT_DIR, fullPath);
        let stats: fs.Stats | null = null;

        try {
          stats = fs.statSync(fullPath);
        } catch {
          // Skip files we can't stat
        }

        return {
          name: entry.name,
          path: relativePath,
          isDirectory: entry.isDirectory(),
          icon: getFileIcon(entry.name, entry.isDirectory()),
          size: stats?.size || 0,
          modified: stats?.mtime?.toISOString() || null,
        };
      })
      .filter(f => f !== null)
      .sort((a, b) => {
        // Directories first, then alphabetically
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

    const relativePath = path.relative(ROOT_DIR, safePath);
    const breadcrumbs = relativePath
      ? relativePath.split(path.sep).map((name, i, arr) => ({
          name,
          path: arr.slice(0, i + 1).join(path.sep),
        }))
      : [];

    return c.json({
      path: relativePath,
      breadcrumbs: [{ name: "Home", path: "" }, ...breadcrumbs],
      files,
    });
  } catch (error) {
    return c.json({ error: "Failed to read directory" }, 500);
  }
});

// API: Search files
app.get("/api/search", async (c) => {
  const query = c.req.query("q") || "";
  const searchPath = c.req.query("path") || "";

  if (!query || query.length < 2) {
    return c.json({ results: [] });
  }

  const safePath = resolveSafePath(searchPath);
  if (!safePath) {
    return c.json({ error: "Invalid path" }, 400);
  }

  const results: Array<{
    name: string;
    path: string;
    isDirectory: boolean;
    icon: string;
    size: number;
  }> = [];

  // Recursive search with depth limit
  function searchDir(dir: string, depth: number) {
    if (depth > 5 || results.length >= 100) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;

        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(ROOT_DIR, fullPath);

        results.push({
          name: entry.name,
          path: relativePath,
          isDirectory: entry.isDirectory(),
          icon: getFileIcon(entry.name, entry.isDirectory()),
          size: 0,
        });

        if (entry.isDirectory() && results.length < 100) {
          searchDir(fullPath, depth + 1);
        }
      }
    } catch {
      // Ignore directories we can't read
    }
  }

  searchDir(safePath, 0);

  // Fuzzy search with Fuse.js
  const fuse = new Fuse(results, {
    keys: ["name"],
    threshold: 0.4,
    includeScore: true,
  });

  const searchResults = fuse.search(query).slice(0, 50).map(r => r.item);

  return c.json({ results: searchResults });
});

// API: Get recent files
app.get("/api/recent", (c) => {
  return c.json({ files: recentFiles });
});

// API: Track file access
app.post("/api/recent", async (c) => {
  const body = await c.req.json();
  const { path: filePath, name, type, size } = body;

  // Remove if already exists
  recentFiles = recentFiles.filter(f => f.path !== filePath);

  // Add to front
  recentFiles.unshift({
    path: filePath,
    name,
    accessedAt: Date.now(),
    type,
    size,
  });

  // Trim to max
  if (recentFiles.length > MAX_RECENT) {
    recentFiles = recentFiles.slice(0, MAX_RECENT);
  }

  return c.json({ success: true });
});

// API: Preview file content
app.get("/api/preview", async (c) => {
  const requestedPath = c.req.query("path") || "";
  const safePath = resolveSafePath(requestedPath);

  if (!safePath) {
    return c.json({ error: "Invalid path" }, 400);
  }

  try {
    const stats = fs.statSync(safePath);
    if (stats.isDirectory()) {
      return c.json({ error: "Cannot preview directory" }, 400);
    }

    const ext = path.extname(safePath).toLowerCase();
    const fileType = getFileType(path.basename(safePath));

    // For images, return base64
    if (fileType === "image") {
      const buffer = fs.readFileSync(safePath);
      const base64 = buffer.toString("base64");
      const mimeTypes: Record<string, string> = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".bmp": "image/bmp",
      };
      return c.json({
        type: "image",
        mimeType: mimeTypes[ext] || "image/png",
        content: base64,
      });
    }

    // For text/code files, return content
    if (fileType === "code" || ext === ".txt" || ext === ".md") {
      // Limit file size for preview
      if (stats.size > 500000) {
        return c.json({ error: "File too large to preview" }, 400);
      }
      const content = fs.readFileSync(safePath, "utf-8");
      return c.json({
        type: "text",
        language: ext.slice(1),
        content,
      });
    }

    return c.json({
      type: "unsupported",
      message: `Preview not available for ${ext} files`,
    });
  } catch (error) {
    return c.json({ error: "Failed to read file" }, 500);
  }
});

// API: Download file
app.get("/api/download", async (c) => {
  const requestedPath = c.req.query("path") || "";
  const safePath = resolveSafePath(requestedPath);

  if (!safePath) {
    return c.json({ error: "Invalid path" }, 400);
  }

  try {
    const stats = fs.statSync(safePath);
    if (stats.isDirectory()) {
      return c.json({ error: "Cannot download directory" }, 400);
    }

    const filename = path.basename(safePath);
    const file = Bun.file(safePath);

    return new Response(file, {
      headers: {
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": file.type,
      },
    });
  } catch (error) {
    return c.json({ error: "Failed to download file" }, 500);
  }
});

// API: Get file info
app.get("/api/info", async (c) => {
  const requestedPath = c.req.query("path") || "";
  const safePath = resolveSafePath(requestedPath);

  if (!safePath) {
    return c.json({ error: "Invalid path" }, 400);
  }

  try {
    const stats = fs.statSync(safePath);
    const filename = path.basename(safePath);

    return c.json({
      name: filename,
      path: requestedPath,
      isDirectory: stats.isDirectory(),
      size: stats.size,
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString(),
      accessed: stats.atime.toISOString(),
      icon: getFileIcon(filename, stats.isDirectory()),
      type: getFileType(filename),
    });
  } catch (error) {
    return c.json({ error: "Failed to get file info" }, 500);
  }
});

// API: Create folder
app.post("/api/mkdir", async (c) => {
  const { path: dirPath } = await c.req.json();
  const safePath = resolveSafePath(dirPath);
  if (!safePath) return c.json({ error: "Invalid path" }, 400);
  try {
    fs.mkdirSync(safePath, { recursive: true });
    return c.json({ success: true, path: dirPath });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to create folder" }, 500);
  }
});

// API: Create file
app.post("/api/touch", async (c) => {
  const { path: filePath, content } = await c.req.json();
  const safePath = resolveSafePath(filePath);
  if (!safePath) return c.json({ error: "Invalid path" }, 400);
  try {
    const dir = path.dirname(safePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(safePath, content || "", "utf-8");
    return c.json({ success: true, path: filePath });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to create file" }, 500);
  }
});

// API: Rename / move
app.post("/api/rename", async (c) => {
  const { from, to } = await c.req.json();
  const safeFrom = resolveSafePath(from);
  const safeTo = resolveSafePath(to);
  if (!safeFrom || !safeTo) return c.json({ error: "Invalid path" }, 400);
  try {
    if (fs.existsSync(safeTo)) return c.json({ error: "Destination already exists" }, 409);
    fs.renameSync(safeFrom, safeTo);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to rename" }, 500);
  }
});

// API: Delete (move to trash not available server-side, so real delete with confirmation on client)
app.post("/api/delete", async (c) => {
  const { path: targetPath } = await c.req.json();
  const safePath = resolveSafePath(targetPath);
  if (!safePath) return c.json({ error: "Invalid path" }, 400);
  // Safety: don't delete the root
  if (safePath === ROOT_DIR) return c.json({ error: "Cannot delete root directory" }, 400);
  try {
    const stats = fs.statSync(safePath);
    if (stats.isDirectory()) {
      fs.rmSync(safePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(safePath);
    }
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to delete" }, 500);
  }
});

// API: Save file content
app.post("/api/save", async (c) => {
  const { path: filePath, content } = await c.req.json();
  const safePath = resolveSafePath(filePath);
  if (!safePath) return c.json({ error: "Invalid path" }, 400);
  try {
    fs.writeFileSync(safePath, content, "utf-8");
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to save" }, 500);
  }
});

// API: Upload file
app.post("/api/upload", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  const targetDir = formData.get("path") as string || "";
  if (!file) return c.json({ error: "No file provided" }, 400);
  const safePath = resolveSafePath(path.join(targetDir, file.name));
  if (!safePath) return c.json({ error: "Invalid path" }, 400);
  try {
    const buffer = await file.arrayBuffer();
    fs.writeFileSync(safePath, Buffer.from(buffer));
    return c.json({ success: true, path: path.relative(ROOT_DIR, safePath) });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to upload" }, 500);
  }
});

// API: Duplicate file/folder
app.post("/api/duplicate", async (c) => {
  const { path: srcPath } = await c.req.json();
  const safeSrc = resolveSafePath(srcPath);
  if (!safeSrc) return c.json({ error: "Invalid path" }, 400);
  try {
    const ext = path.extname(safeSrc);
    const base = path.basename(safeSrc, ext);
    const dir = path.dirname(safeSrc);
    let copyName = `${base} copy${ext}`;
    let copyPath = path.join(dir, copyName);
    let i = 2;
    while (fs.existsSync(copyPath)) {
      copyName = `${base} copy ${i}${ext}`;
      copyPath = path.join(dir, copyName);
      i++;
    }
    const stats = fs.statSync(safeSrc);
    if (stats.isDirectory()) {
      fs.cpSync(safeSrc, copyPath, { recursive: true });
    } else {
      fs.copyFileSync(safeSrc, copyPath);
    }
    return c.json({ success: true, path: path.relative(ROOT_DIR, copyPath) });
  } catch (error: any) {
    return c.json({ error: error.message || "Failed to duplicate" }, 500);
  }
});

// Serve static files from dist/client
app.use("/*", serveStatic({ root: "./dist/client" }));

// Fallback to index.html for SPA routing
app.get("*", async (c) => {
  const indexPath = path.join(process.cwd(), "dist/client/index.html");
  try {
    const content = fs.readFileSync(indexPath, "utf-8");
    return c.html(content);
  } catch {
    return c.text("Build the client first: bun run build", 404);
  }
});

const port = parseInt(process.env.PORT || "3456");
console.log(`🗂️  File Explorer running at http://localhost:${port}`);
console.log(`📁 Browsing: ${ROOT_DIR}`);

const hostname = process.env.BIND_HOST || "0.0.0.0";

export default {
  port,
  hostname,
  fetch: app.fetch,
};

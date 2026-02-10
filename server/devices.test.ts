// Device management API tests
// Run: bun test server/devices.test.ts

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const PORT = 13457;
const BASE = `http://127.0.0.1:${PORT}`;

const SANDBOX = path.join(import.meta.dir, "../.test-sandbox-devices");
const DATA_DIR = path.join(SANDBOX, ".file-explorer");

let proc: any;

function ensureSandbox() {
  if (fs.existsSync(SANDBOX)) fs.rmSync(SANDBOX, { recursive: true, force: true });
  fs.mkdirSync(SANDBOX, { recursive: true });
}

function cleanSandbox() {
  if (fs.existsSync(SANDBOX)) fs.rmSync(SANDBOX, { recursive: true, force: true });
}

async function waitForServer(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE}/api/files?path=`);
      if (res.ok) return;
    } catch { /* */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Server did not start");
}

beforeAll(async () => {
  ensureSandbox();
  proc = Bun.spawn(["bun", "server/index.ts"], {
    cwd: path.join(import.meta.dir, ".."),
    env: {
      ...process.env,
      PORT: String(PORT),
      FILE_EXPLORER_ROOT: SANDBOX,
      FILE_EXPLORER_DATA: DATA_DIR,
      FILE_EXPLORER_ALLOW_NO_AUTH: "true",
    },
    stdout: "ignore",
    stderr: "ignore",
  });
  await waitForServer();
});

afterAll(() => {
  proc?.kill();
  cleanSandbox();
});

beforeEach(() => {
  // Reset devices
  if (fs.existsSync(path.join(DATA_DIR, "devices.json"))) {
    fs.unlinkSync(path.join(DATA_DIR, "devices.json"));
  }
});

// ─── Device Listing ──────────────────────────────────────────────────────────

describe("GET /api/devices", () => {
  test("lists local device by default", async () => {
    const res = await fetch(`${BASE}/api/devices`);
    const data = await res.json();
    expect(data.devices.length).toBe(1);
    expect(data.devices[0].id).toBe("local");
    expect(data.devices[0].isLocal).toBe(true);
  });
});

// ─── Add Device ──────────────────────────────────────────────────────────────

describe("POST /api/devices", () => {
  test("rejects without name", async () => {
    const res = await fetch(`${BASE}/api/devices`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://localhost:9999" }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects without url", async () => {
    const res = await fetch(`${BASE}/api/devices`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test" }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects unreachable URL", async () => {
    // Use a localhost port that's definitely not listening — fast failure
    const res = await fetch(`${BASE}/api/devices`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Unreachable", url: "http://127.0.0.1:19999" }),
    });
    expect(res.status).toBe(502);
  });

  test("adds a reachable device (self-loop)", async () => {
    // Add ourselves as a "remote" device
    const res = await fetch(`${BASE}/api/devices`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Self Loop", url: `http://127.0.0.1:${PORT}`, icon: "🔁" }),
    });
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.device.id).toBe("self-loop");
    expect(data.device.name).toBe("Self Loop");
    expect(data.device.icon).toBe("🔁");

    // Should appear in list
    const list = await (await fetch(`${BASE}/api/devices`)).json();
    expect(list.devices.length).toBe(2);
    expect(list.devices[1].id).toBe("self-loop");
  });

  test("stores remote auth token without exposing it in API responses", async () => {
    const res = await fetch(`${BASE}/api/devices`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Tokened", url: `http://127.0.0.1:${PORT}`, authToken: "secret-token" }),
    });
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.device.hasAuthToken).toBe(true);
    expect(data.device.authToken).toBeUndefined();

    const list = await (await fetch(`${BASE}/api/devices`)).json();
    const tokened = list.devices.find((d: any) => d.id === "tokened");
    expect(tokened.hasAuthToken).toBe(true);
    expect(tokened.authToken).toBeUndefined();
  });

  test("rejects duplicate device ID", async () => {
    // Add first
    await fetch(`${BASE}/api/devices`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Dupe Test", url: `http://127.0.0.1:${PORT}` }),
    });
    // Add again
    const res = await fetch(`${BASE}/api/devices`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Dupe Test", url: `http://127.0.0.1:${PORT}` }),
    });
    expect(res.status).toBe(409);
  });
});

// ─── Update Device ───────────────────────────────────────────────────────────

describe("PUT /api/devices/:id", () => {
  test("updates device name", async () => {
    await fetch(`${BASE}/api/devices`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Old Name", url: `http://127.0.0.1:${PORT}` }),
    });
    const res = await fetch(`${BASE}/api/devices/old-name`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name", icon: "🎉" }),
    });
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.device.name).toBe("New Name");
    expect(data.device.icon).toBe("🎉");
  });

  test("can disable a device", async () => {
    await fetch(`${BASE}/api/devices`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Toggle Me", url: `http://127.0.0.1:${PORT}` }),
    });
    const res = await fetch(`${BASE}/api/devices/toggle-me`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect((await res.json()).success).toBe(true);

    const list = await (await fetch(`${BASE}/api/devices`)).json();
    const device = list.devices.find((d: any) => d.id === "toggle-me");
    expect(device.enabled).toBe(false);
  });

  test("rejects editing local", async () => {
    const res = await fetch(`${BASE}/api/devices/local`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Hacked" }),
    });
    expect(res.status).toBe(400);
  });

  test("404 for unknown device", async () => {
    const res = await fetch(`${BASE}/api/devices/nonexistent`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nope" }),
    });
    expect(res.status).toBe(404);
  });
});

// ─── Delete Device ───────────────────────────────────────────────────────────

describe("DELETE /api/devices/:id", () => {
  test("removes a device", async () => {
    await fetch(`${BASE}/api/devices`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "To Remove", url: `http://127.0.0.1:${PORT}` }),
    });
    const res = await fetch(`${BASE}/api/devices/to-remove`, { method: "DELETE" });
    expect((await res.json()).success).toBe(true);

    const list = await (await fetch(`${BASE}/api/devices`)).json();
    expect(list.devices.length).toBe(1); // only local
  });

  test("rejects deleting local", async () => {
    const res = await fetch(`${BASE}/api/devices/local`, { method: "DELETE" });
    expect(res.status).toBe(400);
  });

  test("404 for unknown device", async () => {
    const res = await fetch(`${BASE}/api/devices/ghost`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

// ─── Health Check ────────────────────────────────────────────────────────────

describe("GET /api/devices/:id/health", () => {
  test("local is always ok", async () => {
    const res = await fetch(`${BASE}/api/devices/local/health`);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.latency).toBe(0);
  });

  test("checks remote health", async () => {
    await fetch(`${BASE}/api/devices`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Health Check", url: `http://127.0.0.1:${PORT}` }),
    });
    const res = await fetch(`${BASE}/api/devices/health-check/health`);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.latency).toBeGreaterThanOrEqual(0);
  });
});

// ─── Device Proxy ────────────────────────────────────────────────────────────

describe("Device Proxy /api/d/:deviceId/*", () => {
  test("proxies to local transparently", async () => {
    fs.writeFileSync(path.join(SANDBOX, "proxy-test.txt"), "local content");
    const res = await fetch(`${BASE}/api/d/local/files?path=`);
    const data = await res.json();
    expect(data.files.some((f: any) => f.name === "proxy-test.txt")).toBe(true);
  });

  test("proxies preview to local", async () => {
    fs.writeFileSync(path.join(SANDBOX, "proxy-preview.md"), "# Hello proxy");
    const res = await fetch(`${BASE}/api/d/local/preview?path=proxy-preview.md`);
    const data = await res.json();
    expect(data.type).toBe("text");
    expect(data.content).toBe("# Hello proxy");
  });

  test("proxies write operations to local", async () => {
    const res = await fetch(`${BASE}/api/d/local/mkdir`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "proxy-mkdir" }),
    });
    expect((await res.json()).success).toBe(true);
    expect(fs.existsSync(path.join(SANDBOX, "proxy-mkdir"))).toBe(true);
  });

  test("proxies to remote device (self-loop)", async () => {
    // Add self as remote
    await fetch(`${BASE}/api/devices`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Proxy Remote", url: `http://127.0.0.1:${PORT}` }),
    });
    fs.writeFileSync(path.join(SANDBOX, "remote-test.txt"), "remote content");

    const res = await fetch(`${BASE}/api/d/proxy-remote/files?path=`);
    const data = await res.json();
    expect(data.files.some((f: any) => f.name === "remote-test.txt")).toBe(true);
  });

  test("returns 404 for unknown device", async () => {
    const res = await fetch(`${BASE}/api/d/nonexistent/files?path=`);
    expect(res.status).toBe(404);
  });

  test("returns 403 for disabled device", async () => {
    await fetch(`${BASE}/api/devices`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Disabled Device", url: `http://127.0.0.1:${PORT}` }),
    });
    await fetch(`${BASE}/api/devices/disabled-device`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });

    const res = await fetch(`${BASE}/api/d/disabled-device/files?path=`);
    expect(res.status).toBe(403);
  });
});

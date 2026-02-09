// Settings + Combo Views API tests
// Run: bun test server/settings.test.ts

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const PORT = 13458;
const BASE = `http://127.0.0.1:${PORT}`;

const SANDBOX = path.join(import.meta.dir, "../.test-sandbox-settings");
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
    env: { ...process.env, PORT: String(PORT), FILE_EXPLORER_ROOT: SANDBOX, FILE_EXPLORER_DATA: DATA_DIR },
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
  // Reset settings + devices
  const settingsFile = path.join(DATA_DIR, "settings.json");
  const devicesFile = path.join(DATA_DIR, "devices.json");
  if (fs.existsSync(settingsFile)) fs.unlinkSync(settingsFile);
  if (fs.existsSync(devicesFile)) fs.unlinkSync(devicesFile);
});

// ─── Settings ────────────────────────────────────────────────────────────────

describe("GET /api/settings", () => {
  test("returns default settings", async () => {
    const res = await fetch(`${BASE}/api/settings`);
    const data = await res.json();
    expect(data.comboViews).toEqual([]);
  });
});

describe("PUT /api/settings", () => {
  test("updates local device name", async () => {
    const res = await fetch(`${BASE}/api/settings`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ localName: "My MacBook" }),
    });
    const data = await res.json();
    expect(data.success).toBe(true);

    // Verify it reflects in device list
    const devRes = await fetch(`${BASE}/api/devices`);
    const devData = await devRes.json();
    expect(devData.devices[0].name).toBe("My MacBook");
  });

  test("updates local device icon", async () => {
    const res = await fetch(`${BASE}/api/settings`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ localIcon: "🏠" }),
    });
    expect((await res.json()).success).toBe(true);

    const devRes = await fetch(`${BASE}/api/devices`);
    const devData = await devRes.json();
    expect(devData.devices[0].icon).toBe("🏠");
  });

  test("clears custom name when empty", async () => {
    // Set
    await fetch(`${BASE}/api/settings`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ localName: "Custom" }),
    });
    // Clear
    await fetch(`${BASE}/api/settings`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ localName: "" }),
    });

    const settings = await (await fetch(`${BASE}/api/settings`)).json();
    expect(settings.localName).toBeUndefined();
  });
});

// ─── Combo Views ─────────────────────────────────────────────────────────────

describe("GET /api/combos", () => {
  test("empty by default", async () => {
    const res = await fetch(`${BASE}/api/combos`);
    const data = await res.json();
    expect(data.combos).toEqual([]);
  });
});

describe("POST /api/combos", () => {
  test("creates a combo view", async () => {
    const res = await fetch(`${BASE}/api/combos`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Dev Machines", icon: "⚡", deviceIds: ["local", "mini"] }),
    });
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.combo.id).toBe("dev-machines");
    expect(data.combo.name).toBe("Dev Machines");
    expect(data.combo.icon).toBe("⚡");
    expect(data.combo.deviceIds).toEqual(["local", "mini"]);
  });

  test("rejects without name", async () => {
    const res = await fetch(`${BASE}/api/combos`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceIds: ["local"] }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects without deviceIds", async () => {
    const res = await fetch(`${BASE}/api/combos`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "No Devices" }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects empty deviceIds", async () => {
    const res = await fetch(`${BASE}/api/combos`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Empty", deviceIds: [] }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects duplicate name", async () => {
    await fetch(`${BASE}/api/combos`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Dupe", deviceIds: ["local"] }),
    });
    const res = await fetch(`${BASE}/api/combos`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Dupe", deviceIds: ["local"] }),
    });
    expect(res.status).toBe(409);
  });

  test("shows in list", async () => {
    await fetch(`${BASE}/api/combos`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Listed", icon: "🔧", deviceIds: ["local"] }),
    });
    const list = await (await fetch(`${BASE}/api/combos`)).json();
    expect(list.combos.length).toBe(1);
    expect(list.combos[0].name).toBe("Listed");
  });
});

describe("PUT /api/combos/:id", () => {
  test("updates combo name and devices", async () => {
    await fetch(`${BASE}/api/combos`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Old Name", deviceIds: ["local"] }),
    });
    const res = await fetch(`${BASE}/api/combos/old-name`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name", deviceIds: ["local", "mini"] }),
    });
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.combo.name).toBe("New Name");
    expect(data.combo.deviceIds).toEqual(["local", "mini"]);
  });

  test("404 for unknown combo", async () => {
    const res = await fetch(`${BASE}/api/combos/nonexistent`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nope" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/combos/:id", () => {
  test("removes a combo", async () => {
    await fetch(`${BASE}/api/combos`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "To Remove", deviceIds: ["local"] }),
    });
    const res = await fetch(`${BASE}/api/combos/to-remove`, { method: "DELETE" });
    expect((await res.json()).success).toBe(true);

    const list = await (await fetch(`${BASE}/api/combos`)).json();
    expect(list.combos.length).toBe(0);
  });

  test("404 for unknown combo", async () => {
    const res = await fetch(`${BASE}/api/combos/ghost`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

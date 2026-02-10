// Auth API tests
// Run: bun test server/auth.test.ts

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const PORT = 13459;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_TOKEN = "admin-test-token";
const READ_TOKEN = "read-test-token";

const SANDBOX = path.join(import.meta.dir, "../.test-sandbox-auth");
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
      const res = await fetch(`${BASE}/api/auth/status`);
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
      FILE_EXPLORER_ADMIN_TOKEN: ADMIN_TOKEN,
      FILE_EXPLORER_READ_TOKEN: READ_TOKEN,
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
  fs.writeFileSync(path.join(SANDBOX, "auth-file.txt"), "ok", "utf-8");
});

describe("GET /api/auth/status", () => {
  test("reports auth enabled", async () => {
    const res = await fetch(`${BASE}/api/auth/status`);
    const data = await res.json();
    expect(data.required).toBe(true);
    expect(data.hasReadToken).toBe(true);
  });
});

describe("token enforcement", () => {
  test("rejects unauthenticated API request", async () => {
    const res = await fetch(`${BASE}/api/files?path=`);
    expect(res.status).toBe(401);
  });

  test("allows read token for read endpoints", async () => {
    const res = await fetch(`${BASE}/api/files?path=`, {
      headers: { Authorization: `Bearer ${READ_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.files)).toBe(true);
  });

  test("blocks read token for write endpoints", async () => {
    const res = await fetch(`${BASE}/api/mkdir`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${READ_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: "cant-write" }),
    });
    expect(res.status).toBe(403);
  });

  test("allows admin token for write endpoints", async () => {
    const res = await fetch(`${BASE}/api/mkdir`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: "can-write" }),
    });
    expect(res.status).toBe(200);
  });

  test("rejects token query param (download)", async () => {
    const res = await fetch(`${BASE}/api/download?path=auth-file.txt&token=${READ_TOKEN}`);
    expect(res.status).toBe(401);
  });
});

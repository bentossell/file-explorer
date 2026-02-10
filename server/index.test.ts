// Server API tests for file-explorer
// Run: bun test server/index.test.ts

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const PORT = 13456; // test port to avoid conflicts
let proc: any;
const BASE = `http://127.0.0.1:${PORT}`;

// Test sandbox directory
const SANDBOX = path.join(import.meta.dir, "../.test-sandbox");

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
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Server did not start in time");
}

beforeAll(async () => {
  ensureSandbox();
  // Start the server with test sandbox as root
  proc = Bun.spawn(["bun", "server/index.ts"], {
    cwd: path.join(import.meta.dir, ".."),
    env: { ...process.env, PORT: String(PORT), FILE_EXPLORER_ROOT: SANDBOX, FILE_EXPLORER_ALLOW_NO_AUTH: "true" },
    stdout: "ignore",
    stderr: "ignore",
  });
  await waitForServer();
});

afterAll(() => {
  proc?.kill();
  cleanSandbox();
});

// Helper: seed files into sandbox
function seed(relativePath: string, content = "") {
  const full = path.join(SANDBOX, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
}

function seedDir(relativePath: string) {
  fs.mkdirSync(path.join(SANDBOX, relativePath), { recursive: true });
}

function exists(relativePath: string) {
  return fs.existsSync(path.join(SANDBOX, relativePath));
}

function readContent(relativePath: string) {
  return fs.readFileSync(path.join(SANDBOX, relativePath), "utf-8");
}

// ─── List Files ──────────────────────────────────────────────────────────────

describe("GET /api/files", () => {
  beforeEach(() => {
    ensureSandbox();
  });

  test("lists empty directory", async () => {
    const res = await fetch(`${BASE}/api/files?path=`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.files).toEqual([]);
    expect(data.breadcrumbs).toEqual([{ name: "Home", path: "" }]);
  });

  test("lists files and folders sorted correctly", async () => {
    seed("b-file.txt", "b");
    seed("a-file.txt", "a");
    seedDir("z-folder");
    seedDir("a-folder");

    const res = await fetch(`${BASE}/api/files?path=`);
    const data = await res.json();
    expect(data.files.length).toBe(4);
    // Folders first, then alphabetical
    expect(data.files[0].name).toBe("a-folder");
    expect(data.files[0].isDirectory).toBe(true);
    expect(data.files[1].name).toBe("z-folder");
    expect(data.files[1].isDirectory).toBe(true);
    expect(data.files[2].name).toBe("a-file.txt");
    expect(data.files[3].name).toBe("b-file.txt");
  });

  test("hides dotfiles by default", async () => {
    seed(".hidden", "secret");
    seed("visible.txt", "hi");

    const res = await fetch(`${BASE}/api/files?path=`);
    const data = await res.json();
    expect(data.files.length).toBe(1);
    expect(data.files[0].name).toBe("visible.txt");
  });

  test("shows dotfiles when showHidden=true", async () => {
    seed(".hidden", "secret");
    seed("visible.txt", "hi");

    const res = await fetch(`${BASE}/api/files?path=&showHidden=true`);
    const data = await res.json();
    expect(data.files.length).toBe(2);
    const names = data.files.map((f: any) => f.name);
    expect(names).toContain(".hidden");
    expect(names).toContain("visible.txt");
  });

  test("navigates subdirectories with breadcrumbs", async () => {
    seed("parent/child/file.txt", "deep");

    const res = await fetch(`${BASE}/api/files?path=parent/child`);
    const data = await res.json();
    expect(data.files.length).toBe(1);
    expect(data.files[0].name).toBe("file.txt");
    expect(data.breadcrumbs.length).toBe(3);
    expect(data.breadcrumbs[0].name).toBe("Home");
    expect(data.breadcrumbs[1].name).toBe("parent");
    expect(data.breadcrumbs[2].name).toBe("child");
  });

  test("rejects directory traversal", async () => {
    const res = await fetch(`${BASE}/api/files?path=../../etc`);
    expect(res.status).toBe(400);
  });

  test("rejects sibling-prefix traversal outside root", async () => {
    const siblingName = `${path.basename(SANDBOX)}-sibling`;
    const siblingPath = path.join(path.dirname(SANDBOX), siblingName);
    fs.mkdirSync(siblingPath, { recursive: true });
    try {
      fs.writeFileSync(path.join(siblingPath, "secret.txt"), "secret", "utf-8");
      const res = await fetch(`${BASE}/api/files?path=${encodeURIComponent(`../${siblingName}`)}`);
      expect(res.status).toBe(400);
    } finally {
      if (fs.existsSync(siblingPath)) fs.rmSync(siblingPath, { recursive: true, force: true });
    }
  });

  test("returns file type icons correctly", async () => {
    seed("code.ts", "const x = 1;");
    seed("image.png", "fake png");
    seed("doc.pdf", "fake pdf");
    seedDir("mydir");

    const res = await fetch(`${BASE}/api/files?path=`);
    const data = await res.json();
    const byName: Record<string, any> = {};
    data.files.forEach((f: any) => { byName[f.name] = f; });

    expect(byName["mydir"].icon).toBe("folder");
    expect(byName["code.ts"].icon).toBe("code");
    expect(byName["image.png"].icon).toBe("image");
    expect(byName["doc.pdf"].icon).toBe("document");
  });

  test("returns 400 for non-directory path", async () => {
    seed("file.txt", "hi");
    const res = await fetch(`${BASE}/api/files?path=file.txt`);
    expect(res.status).toBe(400);
  });
});

// ─── Create Folder ───────────────────────────────────────────────────────────

describe("POST /api/mkdir", () => {
  beforeEach(() => ensureSandbox());

  test("creates a folder", async () => {
    const res = await fetch(`${BASE}/api/mkdir`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "new-folder" }),
    });
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(exists("new-folder")).toBe(true);
    expect(fs.statSync(path.join(SANDBOX, "new-folder")).isDirectory()).toBe(true);
  });

  test("creates nested folders recursively", async () => {
    const res = await fetch(`${BASE}/api/mkdir`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "a/b/c" }),
    });
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(exists("a/b/c")).toBe(true);
  });

  test("rejects directory traversal", async () => {
    const res = await fetch(`${BASE}/api/mkdir`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "../../evil" }),
    });
    expect(res.status).toBe(400);
  });
});

// ─── Create File ─────────────────────────────────────────────────────────────

describe("POST /api/touch", () => {
  beforeEach(() => ensureSandbox());

  test("creates empty file", async () => {
    const res = await fetch(`${BASE}/api/touch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "empty.txt" }),
    });
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(exists("empty.txt")).toBe(true);
    expect(readContent("empty.txt")).toBe("");
  });

  test("creates file with content", async () => {
    const res = await fetch(`${BASE}/api/touch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "hello.md", content: "# Hello" }),
    });
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(readContent("hello.md")).toBe("# Hello");
  });

  test("creates parent dirs if needed", async () => {
    const res = await fetch(`${BASE}/api/touch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "deep/nested/file.txt", content: "hi" }),
    });
    expect((await res.json()).success).toBe(true);
    expect(readContent("deep/nested/file.txt")).toBe("hi");
  });

  test("rejects traversal", async () => {
    const res = await fetch(`${BASE}/api/touch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "../../../etc/evil" }),
    });
    expect(res.status).toBe(400);
  });
});

// ─── Rename ──────────────────────────────────────────────────────────────────

describe("POST /api/rename", () => {
  beforeEach(() => ensureSandbox());

  test("renames a file", async () => {
    seed("old.txt", "content");
    const res = await fetch(`${BASE}/api/rename`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "old.txt", to: "new.txt" }),
    });
    expect((await res.json()).success).toBe(true);
    expect(exists("old.txt")).toBe(false);
    expect(exists("new.txt")).toBe(true);
    expect(readContent("new.txt")).toBe("content");
  });

  test("renames a folder", async () => {
    seedDir("old-dir");
    seed("old-dir/child.txt", "hi");
    const res = await fetch(`${BASE}/api/rename`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "old-dir", to: "new-dir" }),
    });
    expect((await res.json()).success).toBe(true);
    expect(exists("old-dir")).toBe(false);
    expect(exists("new-dir/child.txt")).toBe(true);
  });

  test("409 if destination exists", async () => {
    seed("a.txt", "a");
    seed("b.txt", "b");
    const res = await fetch(`${BASE}/api/rename`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "a.txt", to: "b.txt" }),
    });
    expect(res.status).toBe(409);
    // Both still exist with original content
    expect(readContent("a.txt")).toBe("a");
    expect(readContent("b.txt")).toBe("b");
  });

  test("rejects traversal on from", async () => {
    const res = await fetch(`${BASE}/api/rename`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "../../etc/passwd", to: "stolen" }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects traversal on to", async () => {
    seed("legit.txt", "hi");
    const res = await fetch(`${BASE}/api/rename`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "legit.txt", to: "../../evil.txt" }),
    });
    expect(res.status).toBe(400);
  });
});

// ─── Delete ──────────────────────────────────────────────────────────────────

describe("POST /api/delete", () => {
  beforeEach(() => ensureSandbox());

  test("deletes a file", async () => {
    seed("doomed.txt", "bye");
    const res = await fetch(`${BASE}/api/delete`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "doomed.txt" }),
    });
    expect((await res.json()).success).toBe(true);
    expect(exists("doomed.txt")).toBe(false);
  });

  test("deletes a folder recursively", async () => {
    seedDir("dir");
    seed("dir/a.txt", "a");
    seed("dir/sub/b.txt", "b");
    const res = await fetch(`${BASE}/api/delete`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "dir" }),
    });
    expect((await res.json()).success).toBe(true);
    expect(exists("dir")).toBe(false);
  });

  test("rejects deleting root", async () => {
    const res = await fetch(`${BASE}/api/delete`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "" }),
    });
    // Empty path resolves to root → should be blocked
    expect(res.status).toBe(400);
  });

  test("rejects traversal", async () => {
    const res = await fetch(`${BASE}/api/delete`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "../../important" }),
    });
    expect(res.status).toBe(400);
  });
});

// ─── Save ────────────────────────────────────────────────────────────────────

describe("POST /api/save", () => {
  beforeEach(() => ensureSandbox());

  test("saves content to existing file", async () => {
    seed("editable.txt", "old");
    const res = await fetch(`${BASE}/api/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "editable.txt", content: "new content" }),
    });
    expect((await res.json()).success).toBe(true);
    expect(readContent("editable.txt")).toBe("new content");
  });

  test("saves empty content", async () => {
    seed("file.txt", "stuff");
    const res = await fetch(`${BASE}/api/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "file.txt", content: "" }),
    });
    expect((await res.json()).success).toBe(true);
    expect(readContent("file.txt")).toBe("");
  });

  test("handles unicode content", async () => {
    seed("unicode.txt", "");
    const content = "こんにちは 🌍 émojis & spëcial chars <>&\"'";
    const res = await fetch(`${BASE}/api/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "unicode.txt", content }),
    });
    expect((await res.json()).success).toBe(true);
    expect(readContent("unicode.txt")).toBe(content);
  });

  test("rejects traversal", async () => {
    const res = await fetch(`${BASE}/api/save`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "../../etc/passwd", content: "hacked" }),
    });
    expect(res.status).toBe(400);
  });
});

// ─── Duplicate ───────────────────────────────────────────────────────────────

describe("POST /api/duplicate", () => {
  beforeEach(() => ensureSandbox());

  test("duplicates a file", async () => {
    seed("original.txt", "data");
    const res = await fetch(`${BASE}/api/duplicate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "original.txt" }),
    });
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.path).toBe("original copy.txt");
    expect(readContent("original.txt")).toBe("data");
    expect(readContent("original copy.txt")).toBe("data");
  });

  test("duplicates with incrementing suffix", async () => {
    seed("file.txt", "a");
    seed("file copy.txt", "b");
    const res = await fetch(`${BASE}/api/duplicate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "file.txt" }),
    });
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.path).toBe("file copy 2.txt");
  });

  test("duplicates a folder", async () => {
    seedDir("mydir");
    seed("mydir/a.txt", "a");
    const res = await fetch(`${BASE}/api/duplicate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "mydir" }),
    });
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(exists("mydir copy/a.txt")).toBe(true);
    expect(readContent("mydir copy/a.txt")).toBe("a");
  });

  test("rejects traversal", async () => {
    const res = await fetch(`${BASE}/api/duplicate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "../../etc/passwd" }),
    });
    expect(res.status).toBe(400);
  });
});

// ─── Upload ──────────────────────────────────────────────────────────────────

describe("POST /api/upload", () => {
  beforeEach(() => ensureSandbox());

  test("uploads a file", async () => {
    const blob = new Blob(["uploaded content"], { type: "text/plain" });
    const file = new File([blob], "uploaded.txt", { type: "text/plain" });
    const form = new FormData();
    form.append("file", file);
    form.append("path", "");

    const res = await fetch(`${BASE}/api/upload`, { method: "POST", body: form });
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(readContent("uploaded.txt")).toBe("uploaded content");
  });

  test("uploads to subdirectory", async () => {
    seedDir("subdir");
    const blob = new Blob(["sub content"], { type: "text/plain" });
    const file = new File([blob], "sub.txt", { type: "text/plain" });
    const form = new FormData();
    form.append("file", file);
    form.append("path", "subdir");

    const res = await fetch(`${BASE}/api/upload`, { method: "POST", body: form });
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(readContent("subdir/sub.txt")).toBe("sub content");
  });

  test("rejects upload with no file", async () => {
    const form = new FormData();
    form.append("path", "");
    const res = await fetch(`${BASE}/api/upload`, { method: "POST", body: form });
    expect(res.status).toBe(400);
  });
});

// ─── Preview ─────────────────────────────────────────────────────────────────

describe("GET /api/preview", () => {
  beforeEach(() => ensureSandbox());

  test("previews text file", async () => {
    seed("readme.md", "# Title\n\nBody text");
    const res = await fetch(`${BASE}/api/preview?path=readme.md`);
    const data = await res.json();
    expect(data.type).toBe("text");
    expect(data.content).toBe("# Title\n\nBody text");
    expect(data.language).toBe("md");
  });

  test("previews code file", async () => {
    seed("app.ts", "const x = 1;");
    const res = await fetch(`${BASE}/api/preview?path=app.ts`);
    const data = await res.json();
    expect(data.type).toBe("text");
    expect(data.language).toBe("ts");
  });

  test("returns unsupported for unknown types", async () => {
    seed("data.bin", "\x00\x01\x02");
    const res = await fetch(`${BASE}/api/preview?path=data.bin`);
    const data = await res.json();
    expect(data.type).toBe("unsupported");
  });

  test("rejects directory preview", async () => {
    seedDir("mydir");
    const res = await fetch(`${BASE}/api/preview?path=mydir`);
    expect(res.status).toBe(400);
  });

  test("rejects traversal", async () => {
    const res = await fetch(`${BASE}/api/preview?path=../../etc/passwd`);
    expect(res.status).toBe(400);
  });

  test("rejects symlink escape outside root", async () => {
    const outsidePath = path.join(path.dirname(SANDBOX), `${path.basename(SANDBOX)}-outside`);
    const symlinkPath = path.join(SANDBOX, "outside-link");
    fs.mkdirSync(outsidePath, { recursive: true });
    fs.writeFileSync(path.join(outsidePath, "secret.txt"), "secret", "utf-8");
    fs.symlinkSync(outsidePath, symlinkPath);
    try {
      const res = await fetch(`${BASE}/api/preview?path=outside-link/secret.txt`);
      expect(res.status).toBe(400);
    } finally {
      if (fs.existsSync(symlinkPath)) fs.unlinkSync(symlinkPath);
      if (fs.existsSync(outsidePath)) fs.rmSync(outsidePath, { recursive: true, force: true });
    }
  });
});

// ─── Search ──────────────────────────────────────────────────────────────────

describe("GET /api/search", () => {
  beforeEach(() => ensureSandbox());

  test("finds files by name", async () => {
    seed("readme.md", "hi");
    seed("notes.md", "hi");
    seed("app.ts", "code");

    const res = await fetch(`${BASE}/api/search?q=readme`);
    const data = await res.json();
    expect(data.results.length).toBeGreaterThanOrEqual(1);
    expect(data.results[0].name).toBe("readme.md");
  });

  test("returns empty for short query", async () => {
    const res = await fetch(`${BASE}/api/search?q=a`);
    const data = await res.json();
    expect(data.results).toEqual([]);
  });

  test("finds in subdirectories", async () => {
    seed("deep/nested/target.txt", "found");

    const res = await fetch(`${BASE}/api/search?q=target`);
    const data = await res.json();
    expect(data.results.length).toBeGreaterThanOrEqual(1);
    expect(data.results.some((r: any) => r.name === "target.txt")).toBe(true);
  });
});

// ─── Info ────────────────────────────────────────────────────────────────────

describe("GET /api/info", () => {
  beforeEach(() => ensureSandbox());

  test("returns file info", async () => {
    seed("info-test.json", '{"a":1}');
    const res = await fetch(`${BASE}/api/info?path=info-test.json`);
    const data = await res.json();
    expect(data.name).toBe("info-test.json");
    expect(data.isDirectory).toBe(false);
    expect(data.size).toBeGreaterThan(0);
    expect(data.type).toBe("code");
    expect(data.modified).toBeTruthy();
    expect(data.created).toBeTruthy();
  });

  test("returns folder info", async () => {
    seedDir("info-dir");
    const res = await fetch(`${BASE}/api/info?path=info-dir`);
    const data = await res.json();
    expect(data.name).toBe("info-dir");
    expect(data.isDirectory).toBe(true);
    expect(data.icon).toBe("folder");
  });

  test("rejects traversal", async () => {
    const res = await fetch(`${BASE}/api/info?path=../../etc/passwd`);
    expect(res.status).toBe(400);
  });
});

// ─── Download ────────────────────────────────────────────────────────────────

describe("GET /api/download", () => {
  beforeEach(() => ensureSandbox());

  test("downloads a file", async () => {
    seed("download-me.txt", "file content here");
    const res = await fetch(`${BASE}/api/download?path=download-me.txt`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("file content here");
    expect(res.headers.get("content-disposition")).toContain("download-me.txt");
  });

  test("rejects directory download", async () => {
    seedDir("nodownload");
    const res = await fetch(`${BASE}/api/download?path=nodownload`);
    expect(res.status).toBe(400);
  });

  test("rejects traversal", async () => {
    const res = await fetch(`${BASE}/api/download?path=../../etc/passwd`);
    expect(res.status).toBe(400);
  });
});

// ─── Whoami ──────────────────────────────────────────────────────────────────

describe("GET /api/whoami", () => {
  test("returns machine identity", async () => {
    const res = await fetch(`${BASE}/api/whoami`);
    const data = await res.json();
    expect(data.hostname).toBeDefined();
    expect(typeof data.hostname).toBe("string");
    expect(data.name).toBeDefined();
    expect(data.port).toBe(PORT);
    expect(Array.isArray(data.ips)).toBe(true);
  });
});

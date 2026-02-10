import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// Build client
const result = await Bun.build({
  entrypoints: ["./client/index.tsx"],
  outdir: "./dist/client",
  minify: true,
  target: "browser",
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Generate content hash for cache busting
const jsPath = path.join(process.cwd(), "dist/client/index.js");
const jsContent = fs.readFileSync(jsPath);
const hash = crypto.createHash("md5").update(jsContent).digest("hex").slice(0, 8);

// Copy HTML with cache-busted script reference
const htmlSrc = path.join(process.cwd(), "client/index.html");
const htmlDest = path.join(process.cwd(), "dist/client/index.html");

fs.mkdirSync(path.dirname(htmlDest), { recursive: true });
let html = fs.readFileSync(htmlSrc, "utf-8");
html = html.replace(/\/index\.js(\?v=[^"]*)?/, `/index.js?v=${hash}`);
fs.writeFileSync(htmlDest, html);

console.log("✅ Build complete!");
console.log(`   Output: dist/client/ (hash: ${hash})`);

import * as fs from "fs";
import * as path from "path";

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

// Copy HTML
const htmlSrc = path.join(process.cwd(), "client/index.html");
const htmlDest = path.join(process.cwd(), "dist/client/index.html");

fs.mkdirSync(path.dirname(htmlDest), { recursive: true });
fs.copyFileSync(htmlSrc, htmlDest);

console.log("✅ Build complete!");
console.log("   Output: dist/client/");

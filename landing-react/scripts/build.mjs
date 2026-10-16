// Production build: client bundle + server bundle, then pre-render the page to static HTML.
//   node scripts/build.mjs        →  dist/   (deploy this folder to any static host)
import { build } from "vite";
import { readFileSync, writeFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync, brotliCompressSync } from "node:zlib";

const root = fileURLToPath(new URL("..", import.meta.url));
rmSync(join(root, "dist"), { recursive: true, force: true });
rmSync(join(root, "dist-ssr"), { recursive: true, force: true });

await build({ root, logLevel: "warn" });                                                   // client → dist/
await build({ root, logLevel: "warn", build: { ssr: "src/entry-server.tsx", outDir: "dist-ssr", emptyOutDir: true } });

const { render } = await import(pathToFileURL(join(root, "dist-ssr/entry-server.js")).href);
const template = readFileSync(join(root, "dist/index.html"), "utf8");
if (!template.includes("<!--app-html-->")) throw new Error("template placeholder missing");
const page = template.replace("<!--app-html-->", render());
writeFileSync(join(root, "dist/index.html"), page);
rmSync(join(root, "dist-ssr"), { recursive: true, force: true });

// Report what a visitor downloads.
const files = [];
(function walk(dir) { for (const f of readdirSync(dir)) { const p = join(dir, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } })(join(root, "dist"));
let raw = 0, br = 0;
const text = /\.(html|css|js|svg|woff|txt)$/;
for (const p of files) {
  const b = readFileSync(p); raw += b.length;
  br += text.test(p) ? brotliCompressSync(b).length : b.length;
}
const html = readFileSync(join(root, "dist/index.html"));
console.log(`\nbuilt ${files.length} files — ${(raw / 1024).toFixed(0)} KB on disk, ${(br / 1024).toFixed(0)} KB with brotli`);
console.log(`index.html: ${(html.length / 1024).toFixed(0)} KB (${(gzipSync(html).length / 1024).toFixed(0)} KB gzip) — already contains the full page, no JS needed to read it`);

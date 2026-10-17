// Production build: client bundle + server bundle, then pre-render the page to static HTML.
//   node scripts/build.mjs        →  dist/   (deploy this folder to any static host)
import { build } from "vite";
import { readFileSync, writeFileSync, rmSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
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

// One static page per route. Each gets its own title, description and canonical link.
const SITE = "https://mypixelguard.agentiqbd.com";
const routes = [
  { route: "home", path: "", file: "index.html" },
  { route: "mac", path: "download/mac/", file: "download/mac/index.html",
    title: "Download MyPixelGuard for macOS", desc: "Download MyPixelGuard for Mac (macOS 13 or later, Apple Silicon and Intel) with a step-by-step install guide. Free, works offline, nothing is uploaded." },
  { route: "windows", path: "download/windows/", file: "download/windows/index.html",
    title: "Download MyPixelGuard for Windows", desc: "Download MyPixelGuard for Windows 10/11 (64-bit) with a step-by-step install guide. Free, works offline, nothing is uploaded." },
];
for (const r of routes) {
  let html = template.replace("<!--app-html-->", () => render(r.route));
  if (r.title) {
    const full = `${r.title} — MyPixelGuard`;
    html = html
      .replace(/<title>[^<]*<\/title>/, `<title>${full}</title>`)
      .replace(/(<meta name="description" content=")[^"]*"/, `$1${r.desc}"`)
      .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${full}"`)
      .replace(/(<meta property="og:description" content=")[^"]*"/, `$1${r.desc}"`)
      .replace(/(<meta property="og:url" content=")[^"]*"/, `$1${SITE}/${r.path}"`)
      .replace(/(<link rel="canonical" href=")[^"]*"/, `$1${SITE}/${r.path}"`);
  }
  const out = join(root, "dist", r.file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
}
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

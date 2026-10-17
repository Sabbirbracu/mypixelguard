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

const { render, ROUTES, SITE } = await import(pathToFileURL(join(root, "dist-ssr/entry-server.js")).href);
const template = readFileSync(join(root, "dist/index.html"), "utf8");
if (!template.includes("<!--app-html-->")) throw new Error("template placeholder missing");

// One static page per route, each with its own title, description, canonical link, robots rule and structured data.
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const today = new Date().toISOString().slice(0, 10);
for (const r of ROUTES) {
  let html = template.replace("<!--app-html-->", () => render(r.id));
  const url = `${SITE}${r.path}`;
  const full = r.id === "home" ? r.title : `${r.title} — MyPixelGuard`;
  html = html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(full)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*"/, `$1${esc(r.desc)}"`)
    .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${esc(full)}"`)
    .replace(/(<meta property="og:description" content=")[^"]*"/, `$1${esc(r.desc)}"`)
    .replace(/(<meta property="og:url" content=")[^"]*"/, `$1${url}"`)
    .replace(/(<link rel="canonical" href=")[^"]*"/, `$1${url}"`);
  const robots = r.noindex ? "noindex, follow" : "index, follow, max-image-preview:large";
  const ld = r.jsonld.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`).join("\n  ");
  html = html.replace("</head>", `  <meta name="robots" content="${robots}">\n  ${ld}\n</head>`);
  const out = join(root, "dist", r.path.slice(1), "index.html");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
}

// sitemap.xml lists only pages meant to appear in search results; robots.txt points to it.
const urls = ROUTES.filter((r) => !r.noindex).map((r) => `  <url><loc>${SITE}${r.path}</loc><lastmod>${today}</lastmod></url>`).join("\n");
writeFileSync(join(root, "dist/sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
writeFileSync(join(root, "dist/robots.txt"), `User-agent: *\nAllow: /\nDisallow: /downloads/\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);
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

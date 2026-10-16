// Tiny static server for checking dist/ locally. Sends brotli/gzip and long-lived caching for hashed files,
// like a real host would.   node scripts/serve.mjs [port]
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const port = Number(process.argv[2] ?? 4173);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain" };
const compressible = new Set([".html", ".js", ".css", ".svg", ".woff", ".txt"]);

createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path.endsWith("/")) path += "index.html";
  let file = join(dist, path);
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) { file = join(dist, "index.html"); path = "/index.html"; }
  const ext = extname(file);
  let body = readFileSync(file);
  const headers = { "Content-Type": types[ext] ?? "application/octet-stream", "Cache-Control": path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache" };
  const accept = String(req.headers["accept-encoding"] ?? "");
  if (compressible.has(ext) && /br/.test(accept)) { body = brotliCompressSync(body); headers["Content-Encoding"] = "br"; }
  else if (compressible.has(ext) && /gzip/.test(accept)) { body = gzipSync(body); headers["Content-Encoding"] = "gzip"; }
  headers["Content-Length"] = body.length;
  res.writeHead(200, headers).end(body);
}).listen(port, () => console.log(`http://localhost:${port}`));

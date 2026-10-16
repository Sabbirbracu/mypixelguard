// MyPixelGuard visitor counter — a tiny, dependency-free server.
//
//   POST /api/visit   {"id":"<random id the browser made>"}  →  {"total":1234,"counted":true|false}
//   GET  /api/count                                           →  {"total":1234}
//   GET  /health                                              →  ok
//
// A "visitor" is one browser: the page makes a random id once and keeps it in localStorage. The same id is never counted
// twice. The server stores only a salted hash of each id (no IP address, no user agent, nothing that identifies a person).
// Clearing site data or using another browser counts as a new visitor — that is how every cookie-less counter works.
//
// Run:  node server/visitor-counter.mjs
// Env:  PORT=8787  HOST=127.0.0.1  DATA_FILE=./data/visitors.json  ALLOW_ORIGIN=https://your-site.com[,https://www.your-site.com]  TRUST_PROXY=1
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const PORT = Number(process.env.PORT ?? 8787);
const DATA_FILE = process.env.DATA_FILE ?? "./data/visitors.json";
const ORIGINS = (process.env.ALLOW_ORIGIN ?? "*").split(",").map((s) => s.trim()).filter(Boolean);
// Listens on this machine only by default; nginx is the public door. Set HOST=0.0.0.0 only inside a container.
const HOST = process.env.HOST ?? "127.0.0.1";
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const START_AT = Number(process.env.START_AT ?? 0);      // optional: begin counting from a number (e.g. visitors before this counter existed)
const RATE_PER_MINUTE = 40;

// ---- persistence --------------------------------------------------------------------------------------------
mkdirSync(dirname(DATA_FILE), { recursive: true });
let state = { since: new Date().toISOString(), salt: randomBytes(16).toString("hex"), total: START_AT, seen: [] };
if (existsSync(DATA_FILE)) {
  try { state = { ...state, ...JSON.parse(readFileSync(DATA_FILE, "utf8")) }; } catch (e) { console.error("could not read", DATA_FILE, e.message); process.exit(1); }
}
const seen = new Set(state.seen);
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DATA_FILE + ".tmp";
    writeFileSync(tmp, JSON.stringify({ ...state, seen: [...seen] }));
    renameSync(tmp, DATA_FILE);                           // atomic: a crash can never leave a half-written file
  }, 300);
}
process.on("SIGINT", () => { clearTimeout(saveTimer); writeFileSync(DATA_FILE, JSON.stringify({ ...state, seen: [...seen] })); process.exit(0); });
process.on("SIGTERM", () => process.emit("SIGINT"));

// ---- helpers ------------------------------------------------------------------------------------------------
const hits = new Map(); // ip -> recent timestamps (memory only, never written to disk)
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v[v.length - 1] > 60_000) hits.delete(k);
  return list.length > RATE_PER_MINUTE;
}
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|monitor|curl|wget|python-requests|httpclient|preview/i;

function cors(req, res) {
  const origin = req.headers.origin;
  if (ORIGINS.includes("*")) res.setHeader("Access-Control-Allow-Origin", "*");
  else if (origin && ORIGINS.includes(origin)) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}
const json = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(body)); };

async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 2048) throw new Error("too large"); chunks.push(c); }
  return Buffer.concat(chunks).toString("utf8");
}

createServer(async (req, res) => {
  cors(req, res);
  const url = new URL(req.url, "http://x");
  const ip = (TRUST_PROXY && String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim()) || req.socket.remoteAddress || "?";
  try {
    if (req.method === "OPTIONS") return res.writeHead(204).end();
    if (url.pathname === "/health") return res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
    if (limited(ip)) return json(res, 429, { error: "slow down" });

    if (req.method === "GET" && url.pathname === "/api/count") return json(res, 200, { total: state.total });

    if (req.method === "POST" && url.pathname === "/api/visit") {
      const { id } = JSON.parse((await readBody(req)) || "{}");
      if (typeof id !== "string" || !/^[A-Za-z0-9-]{16,64}$/.test(id)) return json(res, 400, { error: "bad id" });
      if (BOT.test(String(req.headers["user-agent"] ?? ""))) return json(res, 200, { total: state.total, counted: false });
      const key = createHash("sha256").update(state.salt + id).digest("hex").slice(0, 20);
      const fresh = !seen.has(key);
      if (fresh) { seen.add(key); state.total += 1; save(); }
      return json(res, 200, { total: state.total, counted: fresh });
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, 400, { error: String(e.message ?? e) });
  }
}).listen(PORT, HOST, () => console.log(`visitor counter on http://${HOST}:${PORT}  (total so far: ${state.total}, data: ${DATA_FILE})`));

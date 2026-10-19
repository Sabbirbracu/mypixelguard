// MyPixelGuard visitor counter — a tiny, dependency-free server.
//
//   POST /api/visit   {"id":"<random id the browser made>"}  →  {"total":1234,"counted":true|false}
//   GET  /api/count                                           →  {"total":1234}
//   GET  /health                                              →  ok
//
// The desktop app (only if the user allowed it in Settings) sends one small report a week, and feedback when the user asks:
//   POST /api/app/stats     {"id","v","os","lang","platform","days","opens","saved","failed","tools":{"clean":3,…}}  →  {"ok":true}
//   POST /api/app/feedback  {"rating":1-5,"text","v","os","lang","platform"}                                       →  {"ok":true}
//   GET  /api/app/summary   Authorization: Bearer $ADMIN_TOKEN  →  weekly totals + latest feedback (disabled when ADMIN_TOKEN is unset)
// Reports carry no file names, images, metadata or paths. The install id is stored only as a salted hash, IPs are never stored.
//
// A "visitor" is one browser: the page makes a random id once and keeps it in localStorage. The same id is never counted
// twice. The server stores only a salted hash of each id (no IP address, no user agent, nothing that identifies a person).
// Clearing site data or using another browser counts as a new visitor — that is how every cookie-less counter works.
//
// Run:  node server/visitor-counter.mjs
// Env:  PORT=8787  HOST=127.0.0.1  DATA_FILE=./data/visitors.json  ADMIN_TOKEN=<long random string>  ALLOW_ORIGIN=https://your-site.com[,https://www.your-site.com]  TRUST_PROXY=1
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const PORT = Number(process.env.PORT ?? 8787);
const DATA_FILE = process.env.DATA_FILE ?? "./data/visitors.json";
const ORIGINS = (process.env.ALLOW_ORIGIN ?? "*").split(",").map((s) => s.trim()).filter(Boolean);
// Listens on this machine only by default; nginx is the public door. Set HOST=0.0.0.0 only inside a container.
const HOST = process.env.HOST ?? "127.0.0.1";
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const START_AT = Number(process.env.START_AT ?? 0);      // optional: begin counting from a number (e.g. visitors before this counter existed)
const RATE_PER_MINUTE = 40;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";
const APP_FILE = join(dirname(DATA_FILE), "app-stats.json");
const FEEDBACK_FILE = join(dirname(DATA_FILE), "feedback.jsonl");

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
// App usage, one bucket per ISO week: { "2026-W43": { installs: [hash…], reports, opens, saved, failed, tools: {}, versions: {}, os: {}, lang: {}, platform: {} } }
let app = { weeks: {} };
if (existsSync(APP_FILE)) {
  try { app = JSON.parse(readFileSync(APP_FILE, "utf8")); } catch (e) { console.error("could not read", APP_FILE, e.message); process.exit(1); }
}
let appTimer = null;
const writeApp = () => { const tmp = APP_FILE + ".tmp"; writeFileSync(tmp, JSON.stringify(app)); renameSync(tmp, APP_FILE); };
function saveApp() { clearTimeout(appTimer); appTimer = setTimeout(writeApp, 300); }

process.on("SIGINT", () => { clearTimeout(saveTimer); clearTimeout(appTimer); writeFileSync(DATA_FILE, JSON.stringify({ ...state, seen: [...seen] })); writeApp(); process.exit(0); });
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

async function readBody(req, max = 2048) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > max) throw new Error("too large"); chunks.push(c); }
  return Buffer.concat(chunks).toString("utf8");
}

// ---- app reports ----------------------------------------------------------------------------------------------
const TOOLS = new Set(["inspect", "clean", "redact", "convert", "resize", "compress", "background", "studio", "enhance"]);
const word = (v, max = 40) => (typeof v === "string" && /^[\w .()+-]{1,40}$/.test(v) ? v.slice(0, max) : "unknown");
const count = (v, max = 100000) => (Number.isInteger(v) && v >= 0 ? Math.min(v, max) : 0);
const bump = (obj, key, by = 1) => { obj[key] = (obj[key] ?? 0) + by; };
function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear(), w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

function recordStats(b) {
  if (typeof b.id !== "string" || !/^[A-Za-z0-9-]{16,64}$/.test(b.id)) throw new Error("bad id");
  const wk = (app.weeks[isoWeek()] ??= { installs: [], reports: 0, opens: 0, saved: 0, failed: 0, tools: {}, versions: {}, os: {}, lang: {}, platform: {} });
  const key = createHash("sha256").update(state.salt + "app:" + b.id).digest("hex").slice(0, 20);
  if (!wk.installs.includes(key)) wk.installs.push(key);
  wk.reports += 1;
  wk.opens += count(b.opens); wk.saved += count(b.saved); wk.failed += count(b.failed);
  if (b.tools && typeof b.tools === "object") for (const [t, n] of Object.entries(b.tools)) if (TOOLS.has(t)) bump(wk.tools, t, count(n));
  bump(wk.versions, word(b.v)); bump(wk.os, word(b.os)); bump(wk.lang, word(b.lang, 8)); bump(wk.platform, word(b.platform, 12));
  saveApp();
}

function recordFeedback(b) {
  const rating = Number.isInteger(b.rating) && b.rating >= 1 && b.rating <= 5 ? b.rating : null;
  const text = typeof b.text === "string" ? b.text.trim().slice(0, 2000) : "";
  if (!rating && !text) throw new Error("empty");
  appendFileSync(FEEDBACK_FILE, JSON.stringify({ at: new Date().toISOString(), rating, text, v: word(b.v), os: word(b.os), lang: word(b.lang, 8), platform: word(b.platform, 12) }) + "\n");
}

function summary() {
  const weeks = Object.entries(app.weeks).sort(([a], [b]) => b.localeCompare(a)).slice(0, 12)
    .map(([week, w]) => ({ week, activeInstalls: w.installs.length, ...w, installs: undefined }));
  let feedback = [];
  if (existsSync(FEEDBACK_FILE)) feedback = readFileSync(FEEDBACK_FILE, "utf8").trim().split("\n").filter(Boolean).slice(-50).reverse().map((l) => JSON.parse(l));
  return { visitors: state.total, weeks, feedback };
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

    if (req.method === "POST" && url.pathname === "/api/app/stats") {
      recordStats(JSON.parse((await readBody(req)) || "{}"));
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/app/feedback") {
      recordFeedback(JSON.parse((await readBody(req, 8192)) || "{}"));
      return json(res, 200, { ok: true });
    }
    if (req.method === "GET" && url.pathname === "/api/app/summary") {
      if (!ADMIN_TOKEN || req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`) return json(res, 404, { error: "not found" });
      return json(res, 200, summary());
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, 400, { error: String(e.message ?? e) });
  }
}).listen(PORT, HOST, () => console.log(`visitor counter on http://${HOST}:${PORT}  (total so far: ${state.total}, data: ${DATA_FILE})`));

import { useEffect, useRef, useState } from "react";
import { VISITOR_API } from "./config";
import { storage, useLang } from "./ui";

const VISITOR_DISPLAY_OFFSET = 1_000;

/**
 * Real visitor count, shown at the top of the hero.
 * - A browser gets a random id once (kept in localStorage) and tells the counter server about it; the server counts each
 *   id once. See server/visitor-counter.mjs.
 * - If no server is configured, or it can't be reached, NOTHING is shown. A made-up number is never displayed.
 */
function newId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from({ length: 4 }, () => Math.random().toString(16).slice(2, 10)).join("-");
}

async function fetchTotal(signal: AbortSignal): Promise<number | null> {
  if (!VISITOR_API) return null;
  const post = (id: string) =>
    fetch(`${VISITOR_API}/api/visit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }), signal });
  const get = () => fetch(`${VISITOR_API}/api/count`, { signal });

  let id = storage.get("mpg-vid");
  if (!id) { id = newId(); storage.set("mpg-vid", id); }
  const canRemember = storage.get("mpg-vid") === id;           // private mode: don't count, just read
  const alreadySent = storage.get("mpg-vid-sent") === "1";
  const automated = navigator.webdriver === true;              // test browsers and scrapers are not visitors

  const res = canRemember && !alreadySent && !automated ? await post(id) : await get();
  if (!res.ok) return null;
  const data = (await res.json()) as { total?: unknown };
  if (canRemember && !alreadySent && !automated) storage.set("mpg-vid-sent", "1");
  return typeof data.total === "number" && data.total >= 0
    ? data.total + VISITOR_DISPLAY_OFFSET
    : null;
}

export function VisitorCount() {
  const { lang } = useLang();
  const [total, setTotal] = useState<number | null>(null);
  const [shown, setShown] = useState(0);
  const timer = useRef<number>(0);

  useEffect(() => {
    const ac = new AbortController();
    const timeout = window.setTimeout(() => ac.abort(), 5000);
    fetchTotal(ac.signal).then(setTotal).catch(() => setTotal(null)).finally(() => window.clearTimeout(timeout));
    return () => { ac.abort(); window.clearTimeout(timeout); };
  }, []);

  // Count up to the real number (instantly for people who prefer reduced motion).
  useEffect(() => {
    if (total === null) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || total < 20) { setShown(total); return; }
    const start = Date.now(), duration = 900;
    timer.current = window.setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / duration);
      setShown(Math.round(total * (1 - (1 - t) ** 3)));
      if (t === 1) window.clearInterval(timer.current);
    }, 40);
    return () => window.clearInterval(timer.current);
  }, [total]);

  const nf = new Intl.NumberFormat(lang === "bn" ? "bn-BD" : "en-US");
  const label = lang === "bn" ? "জন এসেছেন" : total === 1 ? "visitor" : "visitors";

  return (
    <div className="visitors" aria-live="polite">
      {total !== null && (
        <span className="visitors-pill">
          <i className="live-dot" aria-hidden="true" />
          <b>{nf.format(shown)}</b>
          <span>{label}</span>
        </span>
      )}
    </div>
  );
}

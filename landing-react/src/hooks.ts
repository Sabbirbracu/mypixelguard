import { useCallback, useEffect, useState, type KeyboardEvent } from "react";

/** Vertical tab list with the same keyboard behaviour as before (arrows move and select). */
export function useTabs(ids: string[]) {
  const [tab, setTab] = useState(ids[0]);
  const onKey = useCallback((e: KeyboardEvent, i: number) => {
    const next = ({ ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1 } as Record<string, number>)[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const id = ids[(next + ids.length) % ids.length];
    document.getElementById("t-" + id)?.focus();
    setTab(id);
  }, [ids]);
  return { tab, setTab, onKey };
}

/** Gentle fade-up for elements marked .rv (skipped for people who prefer reduced motion). */
export function useReveal() {
  useEffect(() => {
    const items = document.querySelectorAll(".rv");
    const revealAll = () => items.forEach((el) => el.classList.add("in"));
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      revealAll();
      return;
    }
    let fired = false;
    const io = new IntersectionObserver((entries) => {
      fired = true;
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    items.forEach((el) => io.observe(el));
    // Safety net: if the browser never reports intersections (throttled or embedded views), never leave content invisible.
    const failsafe = window.setTimeout(() => { if (!fired) revealAll(); }, 3500);
    return () => { io.disconnect(); window.clearTimeout(failsafe); };
  }, []);
}

/** After the page has loaded and the browser is idle, fetch the screenshots of the hidden tool tabs,
 *  so switching tabs is instant. Nothing here delays the first paint or the load event. */
export function usePrefetchTabImages() {
  useEffect(() => {
    const run = () => document.querySelectorAll<HTMLImageElement>(".panel img[loading=lazy]").forEach((img) => { img.loading = "eager"; });
    const schedule = () => {
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
      if (ric) ric(run, { timeout: 4000 }); else window.setTimeout(run, 2500);
    };
    if (document.readyState === "complete") schedule(); else window.addEventListener("load", schedule, { once: true });
  }, []);
}

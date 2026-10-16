import { useEffect, useRef, useState } from "react";
import { useLang, storage, type Lang } from "./ui";
import mark from "./assets/brand/MyPixelGuard-Mark-Dark.svg";

type Phase = "closed" | "opening" | "open" | "leaving";

/** Asks English or বাংলা right after the page loads — once. `?choose-language` shows it again; `?lang=bn` skips it. */
export function LangGate() {
  const { setLang } = useLang();
  const [phase, setPhase] = useState<Phase>("closed");
  const [guess, setGuess] = useState<Lang>("en");
  const refs = useRef<Record<Lang, HTMLButtonElement | null>>({ en: null, bn: null });
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const forced = params.get("lang");
    if (forced === "en" || forced === "bn") { storage.set("mpg-lang", forced); storage.set("mpg-lang-chosen", "1"); return; }
    if (storage.get("mpg-lang-chosen") && !params.has("choose-language")) return;
    setGuess((navigator.language || "").toLowerCase().startsWith("bn") ? "bn" : "en");

    let t1: number, t2: number;
    const show = () => {
      t1 = window.setTimeout(() => {
        opener.current = document.activeElement;
        setPhase("opening");
        t2 = window.setTimeout(() => setPhase("open"), 20);
      }, 500);
    };
    if (document.readyState === "complete") show(); else window.addEventListener("load", show, { once: true });
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.removeEventListener("load", show); };
  }, []);

  const visible = phase !== "closed";
  useEffect(() => {
    document.body.classList.toggle("lang-open", phase === "opening" || phase === "open");
    if (phase === "opening") refs.current[guess]?.focus({ preventScroll: true });
  }, [phase, guess]);

  const close = (chosen: boolean) => {
    if (chosen) storage.set("mpg-lang-chosen", "1");
    setPhase("leaving");
    window.setTimeout(() => {
      setPhase("closed");
      (opener.current as HTMLElement | null)?.focus?.({ preventScroll: true });
    }, 380);
  };
  const pick = (l: Lang) => { setLang(l); close(true); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { close(false); return; }   // keeps the automatic choice, asks again next visit
    if (e.key === "Tab") {
      const first = refs.current.en, last = refs.current.bn;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  };

  if (!visible) return null;
  return (
    <div className={`lang-gate${phase === "open" ? " show" : ""}${phase === "leaving" ? " leaving" : ""}`} id="lang-gate"
      role="dialog" aria-modal="true" aria-labelledby="lg-title" aria-describedby="lg-note" onKeyDown={onKeyDown}>
      <div className="lang-card">
        <img src={mark} alt="" width={60} height={60} />
        <h2 id="lg-title">Choose your language<span className="lg-bn" lang="bn">আপনার ভাষা বেছে নিন</span></h2>
        <p id="lg-note">You can switch any time from the top of the page.<span className="lg-bn" lang="bn">পরে যেকোনো সময় ওপরের বাটন থেকে বদলে নিতে পারবেন।</span></p>
        <div className="lang-options">
          <button type="button" ref={(el) => { refs.current.en = el; }} className={`lang-opt${guess === "en" ? " suggested" : ""}`} lang="en" onClick={() => pick("en")}>
            <span className="lo-name">English</span><span className="lo-sub">Continue in English</span>
          </button>
          <button type="button" ref={(el) => { refs.current.bn = el; }} className={`lang-opt${guess === "bn" ? " suggested" : ""}`} lang="bn" onClick={() => pick("bn")}>
            <span className="lo-name">বাংলা</span><span className="lo-sub">বাংলায় দেখুন</span>
          </button>
        </div>
      </div>
    </div>
  );
}

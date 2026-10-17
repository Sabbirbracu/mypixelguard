import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type AnchorHTMLAttributes, type ImgHTMLAttributes, type ReactNode } from "react";
import { DOWNLOAD_PAGES, STATUS, TITLE } from "./config";

export type Lang = "en" | "bn";

// ── Language state ───────────────────────────────────────────────────────────
// The server always renders English; the browser applies the saved or preferred language right after hydration.
interface LangState { lang: Lang; setLang: (l: Lang) => void }
const LangContext = createContext<LangState>({ lang: "en", setLang: () => {} });
export const useLang = () => useContext(LangContext);

export const storage = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

export function LangProvider({ children, title = TITLE }: { children: ReactNode; title?: { en: string; bn: string } }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const forced = new URLSearchParams(location.search).get("lang");
    const saved = storage.get("mpg-lang");
    const guess: Lang = (navigator.language || "").toLowerCase().startsWith("bn") ? "bn" : "en";
    const initial: Lang = forced === "en" || forced === "bn" ? forced : saved === "en" || saved === "bn" ? saved : guess;
    setLangState(initial);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = title[lang];
    // The page is now in the right language: lift the "hold first paint" guard used for returning Bangla visitors,
    // but not before the Bengali font is ready (max ~1.2 s), so the text never visibly swaps fonts.
    const lift = () => document.documentElement.classList.remove("bn-pending");
    if (lang === "bn" && "fonts" in document) {
      Promise.race([document.fonts.load('1em "Noto Sans Bengali"', "আ"), new Promise((r) => setTimeout(r, 1200))]).then(lift, lift);
    } else lift();
  }, [lang, title]);

  const setLang = useCallback((l: Lang) => { setLangState(l); storage.set("mpg-lang", l); }, []);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

/** An element whose content is a (trusted, build-time) HTML string in two languages. */
export function L({ as = "span", en, bn, ...rest }: { as?: string; en: string; bn: string } & Record<string, unknown>) {
  const { lang } = useLang();
  return createElement(as, { ...rest, dangerouslySetInnerHTML: { __html: lang === "bn" ? bn : en } });
}

/** Image with a language-aware alt text. */
export function Pic({ alt, altBn, ...rest }: { alt: string; altBn: string } & ImgHTMLAttributes<HTMLImageElement>) {
  const { lang } = useLang();
  return <img decoding="async" {...rest} alt={lang === "bn" ? altBn : alt} />;
}

/** Download button: opens that platform's download page (guide + automatic download); a "coming soon" badge when it isn't ready. */
export function Dl({ platform, className = "", en, bn, children, ...rest }: {
  platform: "mac" | "windows"; en?: string; bn?: string; children?: ReactNode;
} & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const soon = STATUS[platform] === "soon";
  const props = soon
    ? { className: `${className} is-soon`, "aria-disabled": true as const }
    : { className, href: DOWNLOAD_PAGES[platform] };
  if (en !== undefined && bn !== undefined) return <L as="a" {...props} {...(rest as Record<string, unknown>)} en={en} bn={bn} />;
  return <a {...rest} {...props}>{children}</a>;
}

export function LangSwitch() {
  const { lang, setLang } = useLang();
  return (
    <div className="lang" role="group" aria-label="Language">
      <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
      <button type="button" aria-pressed={lang === "bn"} onClick={() => setLang("bn")}>বাংলা</button>
    </div>
  );
}

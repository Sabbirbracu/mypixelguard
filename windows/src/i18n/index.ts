import en from "./en.json";
import bn from "./bn.json";
import type { CoreError, Note } from "../types";

export type Lang = "en" | "bn";
export const LANGUAGES: { code: Lang; nativeName: string }[] = [
  { code: "en", nativeName: "English" },
  { code: "bn", nativeName: "বাংলা (Bangla)" },
];
const tables: Record<Lang, Record<string, string>> = { en, bn };

function stored(): Lang {
  try {
    const saved = localStorage.getItem("appLanguage");
    if (saved === "en" || saved === "bn") return saved;
  } catch { /* storage unavailable */ }
  return navigator.language?.toLowerCase().startsWith("bn") ? "bn" : "en";
}

let current: Lang = stored();
export const currentLanguage = () => current;
export function setLanguage(l: Lang) {
  current = l;
  try { localStorage.setItem("appLanguage", l); } catch { /* ignore */ }
  document.documentElement.lang = l;
}

/** Fills %@, %d, %1$d … placeholders (the same format the macOS app's tables use). */
function fill(format: string, args: (string | number)[]): string {
  let next = 0;
  return format.replace(/%(?:(\d+)\$)?([@d%])/g, (_m, pos: string | undefined, kind: string) => {
    if (kind === "%") return "%";
    const i = pos ? Number(pos) - 1 : next++;
    return String(args[i] ?? "");
  });
}

export function t(key: string, ...args: (string | number)[]): string {
  const format = tables[current][key] ?? tables.en[key] ?? key;
  return args.length ? fill(format, args) : format;
}

/** Args starting with "t:" are themselves translation keys (e.g. field names inside a note). */
const arg = (a: string) => (a.startsWith("t:") ? t(a.slice(2)) : a);
export const noteText = (n: Note) => t(n.key, ...n.args.map(arg));

export function errorText(e: unknown): string {
  if (e && typeof e === "object" && "key" in e) {
    const c = e as CoreError;
    if (!c.key) return (c.args ?? []).join(" ");
    return t(c.key, ...(c.args ?? []).map(arg));
  }
  return typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
}

export const runTitle = (base: string, count: number) => t(count === 1 ? `${base}.one` : `${base}.many`, count);
document.documentElement.lang = current;

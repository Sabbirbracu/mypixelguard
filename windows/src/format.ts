import type { RGB } from "./types";

/** Decimal units, like Finder and File Explorer's "size" column. */
export function byteString(n: number): string {
  if (n < 1000) return `${n} bytes`;
  if (n < 1e6) return `${Math.round(n / 1e3)} KB`;
  const trim = (v: number, unit: string) => `${v.toFixed(1).replace(/\.0$/, "")} ${unit}`;
  return n < 1e9 ? trim(n / 1e6, "MB") : trim(n / 1e9, "GB");
}

export const percentSaved = (before: number, after: number) => (before > 0 ? Math.round(((before - after) / before) * 100) : 0);

export const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;
export const dirName = (p: string) => p.slice(0, Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/")));
export const joinPath = (dir: string, name: string) => (dir.endsWith("/") || dir.endsWith("\\") ? dir + name : `${dir}${dir.includes("\\") ? "\\" : "/"}${name}`);

export const hexOf = ([r, g, b]: RGB) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
export function rgbOf(hex: string): RGB {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
}

export const extFor = (f: string | null | undefined, fallback = "jpg") => (f === "jpeg" ? "jpg" : f ?? fallback);
export const sanitizedSuffix = (s: string) => s.replace(/[\\/:*?"<>|\0]/g, "");
export const exampleName = (base: string, suffix: string, ext: string) => `${base}${sanitizedSuffix(suffix)}.${ext}`;
export const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

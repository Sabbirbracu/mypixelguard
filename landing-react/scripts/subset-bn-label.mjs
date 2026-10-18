// Makes a tiny font that only contains the Bengali text an ENGLISH visitor can see before choosing Bengali: the "বাংলা" button
// and the language pop-up. That way they never download the full 105 KB Bengali font.  node scripts/subset-bn-label.mjs
// If you change the Bengali words in LangGate.tsx or LangSwitch, add them to TEXT below and run this again.
import wawoff2 from "wawoff2";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const TEXT = "বাংলা বাংলায় দেখুন আপনার ভাষা বেছে নিন পরে যেকোনো সময় ওপরের বাটন থেকে বদলে নিতে পারবেন।";
const woff2 = readFileSync(new URL("../src/assets/fonts/NotoSansBengali-Variable-bengali.woff2", import.meta.url));
const ttf = await wawoff2.decompress(woff2);
const dir = mkdtempSync(join(tmpdir(), "bnlabel-"));
const src = join(dir, "full.ttf");
writeFileSync(src, ttf);
const out = new URL("../src/assets/fonts/NotoSansBengali-label.woff", import.meta.url).pathname.replace(/%20/g, " ");
execFileSync("python3", ["-m", "fontTools.subset", src, `--text=${TEXT}`, "--layout-features=*", "--flavor=woff", `--output-file=${out}`]);
console.log("wrote", out, readFileSync(out).length, "bytes");

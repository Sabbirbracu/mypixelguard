// Makes a ~3 KB font that only contains the word "বাংলা" (the language button), so English visitors don't
// download the full 105 KB Bengali font just to draw that button.  node scripts/subset-bn-label.mjs
import wawoff2 from "wawoff2";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const woff2 = readFileSync(new URL("../src/assets/fonts/NotoSansBengali-Variable-bengali.woff2", import.meta.url));
const ttf = await wawoff2.decompress(woff2);
const dir = mkdtempSync(join(tmpdir(), "bnlabel-"));
const src = join(dir, "full.ttf");
writeFileSync(src, ttf);
const out = new URL("../src/assets/fonts/NotoSansBengali-label.woff", import.meta.url).pathname.replace(/%20/g, " ");
execFileSync("python3", ["-m", "fontTools.subset", src, "--text=বাংলা", "--layout-features=*", "--flavor=woff", `--output-file=${out}`]);
console.log("wrote", out, readFileSync(out).length, "bytes");

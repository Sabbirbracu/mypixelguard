import sharp from "sharp";
import { readdirSync, mkdirSync, statSync } from "node:fs";
import { join, parse } from "node:path";
const from = "../landing/assets/img", to = "src/assets/img";
mkdirSync(to, { recursive: true });
let before = 0, after = 0;
for (const f of readdirSync(from)) {
  if (!/\.(png|jpg)$/i.test(f)) continue;
  const out = join(to, parse(f).name + ".webp");
  // Screenshots are UI (sharp text edges): high quality, no chroma smoothing that blurs small text.
  await sharp(join(from, f)).webp({ quality: 84, effort: 6, smartSubsample: false, alphaQuality: 90 }).toFile(out);
  const b = statSync(join(from, f)).size, a = statSync(out).size; before += b; after += a;
  console.log(f.padEnd(22), (b / 1024).toFixed(0).padStart(5), "KB →", (a / 1024).toFixed(0).padStart(4), "KB");
}
// app icon shown at 92px: a 256px source is plenty for 2x screens
await sharp("../landing/assets/brand/app-icon-512.png").resize(256).webp({ quality: 90 }).toFile("src/assets/brand/app-icon.webp");
console.log("total", (before / 1024).toFixed(0), "KB →", (after / 1024).toFixed(0), "KB");

// One-time converter: ../landing/index.html  →  src/sections/*.tsx
// Keeps the markup 1:1 (so the existing CSS keeps working) and turns it into React components.
//   • elements with data-bn  →  <L en=… bn=…/>   (language-aware, HTML-safe content)
//   • img with data-bn-alt   →  <Pic/>          (language-aware alt text)
//   • a[data-download]       →  <Dl/>           (download link / "coming soon" state)
//   • tab buttons / panels   →  state from useTabs()
//   • before/after slider    →  state from useState()
// Run:  node scripts/convert-html.mjs   (only needed if ../landing/index.html changes)
import { parse, serialize } from "parse5";
if (!process.argv.includes("--force")) {
  console.error("src/sections/*.tsx are now maintained by hand (visitor counter, hero backdrop …). Re-running this converter would overwrite them.\nUse --force only if you really want to regenerate from ../landing/index.html.");
  process.exit(1);
}
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const html = readFileSync(new URL("../../landing/index.html", import.meta.url), "utf8");
const doc = parse(html);

const find = (node, pred) => {
  if (pred(node)) return node;
  for (const c of node.childNodes ?? []) { const r = find(c, pred); if (r) return r; }
  return null;
};
const attr = (n, name) => n.attrs?.find((a) => a.name === name)?.value;
const hasClass = (n, c) => (attr(n, "class") ?? "").split(/\s+/).includes(c);
const kids = (n) => (n.childNodes ?? []).filter((c) => c.nodeName !== "#comment");

const body = find(doc, (n) => n.nodeName === "body");
const VOID = new Set(["img", "input", "br", "hr", "meta", "link", "source", "use", "path", "circle", "rect", "line", "stop"]);
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const SPECIAL_ATTR = { class: "className", for: "htmlFor", tabindex: "tabIndex", viewbox: "viewBox", "xlink:href": "xlinkHref", crossorigin: "crossOrigin", readonly: "readOnly" };
const js = (s) => JSON.stringify(s);

function styleObject(css) {
  const entries = css.split(";").map((d) => d.trim()).filter(Boolean).map((d) => {
    const i = d.indexOf(":");
    return `${camel(d.slice(0, i).trim())}: ${js(d.slice(i + 1).trim())}`;
  });
  return `{{ ${entries.join(", ")} }}`;
}

// ---- image imports -------------------------------------------------------------------------
function assetFor(src) {
  const m = /^assets\/(img|brand)\/(.+)$/.exec(src);
  if (!m) return null;
  let file = m[2];
  if (m[1] === "img") file = file.replace(/\.(png|jpg)$/i, ".webp");
  if (file === "app-icon-512.png") file = "app-icon.webp";
  return { path: `../assets/${m[1]}/${file}`, ident: "img_" + file.replace(/[^a-zA-Z0-9]/g, "_") };
}

// ---- conversion ----------------------------------------------------------------------------
function attrsToJsx(node, ctx, skip = new Set()) {
  const out = [];
  for (const { name, value } of node.attrs ?? []) {
    if (skip.has(name) || name === "data-bn" || name === "data-bn-alt" || name === "data-download") continue;
    if (name === "style") { out.push(`style=${styleObject(value)}`); continue; }
    if (name === "src" && node.nodeName === "img") {
      const a = assetFor(value);
      if (a) { ctx.imports.set(a.ident, a.path); out.push(`src={${a.ident}}`); continue; }
    }
    if (name === "hidden") continue; // panels are handled by state
    if (name === "aria-selected" && node.nodeName === "button" && (attr(node, "class") ?? "").split(/\s+/).includes("tab")) continue; // set from state below
    let key = SPECIAL_ATTR[name] ?? (name.startsWith("data-") || name.startsWith("aria-") ? name : camel(name));
    if (name === "fetchpriority") key = "fetchPriority";
    if (name === "loading" || name === "decoding") key = name;
    const numeric = /^(width|height)$/.test(name) && /^\d+$/.test(value);
    out.push(numeric ? `${key}={${value}}` : `${key}=${js(value)}`);
  }
  return out;
}

const textSafe = (t) => !/[{}<>&]/.test(t);

function children(node, ctx, depth) {
  const parts = [];
  for (const c of kids(node)) {
    if (c.nodeName === "#text") {
      if (!c.value.trim()) { if (!c.value.includes("\n") && c.value.length) parts.push(`{" "}`); continue; }
      const v = c.value.replace(/\s+/g, " ");
      parts.push(textSafe(v) ? v : `{${js(v)}}`);
    } else parts.push(element(c, ctx, depth + 1));
  }
  return parts;
}

function element(node, ctx, depth = 0) {
  const tag = node.nodeName;
  const pad = "  ".repeat(depth + 2);
  const bn = attr(node, "data-bn");
  const dl = attr(node, "data-download");

  // language switch (header)
  if (hasClass(node, "lang") && attr(node, "role") === "group") return `${pad}<LangSwitch />`;

  // translatable element
  if (bn !== undefined) {
    if (find({ childNodes: node.childNodes }, (n) => n !== node && n.attrs && attr(n, "data-bn") !== undefined)) throw new Error("nested data-bn in " + tag);
    const en = serialize(node);
    const props = attrsToJsx(node, ctx);
    if (dl) return `${pad}<Dl platform=${js(dl)} ${props.join(" ")} en={${js(en)}} bn={${js(bn)}} />`;
    return `${pad}<L as=${js(tag)} ${props.join(" ")} en={${js(en)}} bn={${js(bn)}} />`;
  }

  // download anchors with their own children
  if (dl) {
    const props = attrsToJsx(node, ctx, new Set(["href"]));
    return `${pad}<Dl platform=${js(dl)} ${props.join(" ")}>\n${children(node, ctx, depth).join("\n")}\n${pad}</Dl>`;
  }

  // images with translatable alt
  if (tag === "img") {
    const props = attrsToJsx(node, ctx);
    if (ctx.hero) props.push(`fetchPriority="high"`);   // the hero screenshot is the largest contentful paint
    const altBn = attr(node, "data-bn-alt");
    if (altBn !== undefined) {
      const i = props.findIndex((p) => p.startsWith("alt="));
      if (i >= 0) props.splice(i, 1);
      return `${pad}<Pic ${props.join(" ")} alt={${js(attr(node, "alt"))}} altBn={${js(altBn)}} />`;
    }
    return `${pad}<img ${props.join(" ")} />`;
  }

  const props = attrsToJsx(node, ctx);
  // tabs / panels
  if (tag === "button" && hasClass(node, "tab")) {
    const id = attr(node, "id").slice(2);
    ctx.tabs.push(id);
    const i = ctx.tabs.length - 1;
    props.push(`aria-selected={tab === ${js(id)}}`, `onClick={() => setTab(${js(id)})}`, `onKeyDown={(e) => onKey(e, ${i})}`);
  }
  if (hasClass(node, "panel") && attr(node, "role") === "tabpanel") {
    props.push(`hidden={tab !== ${js(attr(node, "id").slice(2))}}`);
  }
  // before / after slider
  if (hasClass(node, "compare")) { ctx.compare = true; props.push(`style={{ "--pos": pos + "%" } as React.CSSProperties}`); }
  if (tag === "input" && attr(node, "type") === "range") {
    return `${pad}<input ${props.filter((p) => !p.startsWith("value=")).join(" ")} value={pos} onChange={(e) => setPos(Number(e.target.value))} />`;
  }

  if (VOID.has(tag) && !node.childNodes?.length) return `${pad}<${tag} ${props.join(" ")} />`;
  const inner = children(node, ctx, depth);
  const inline = inner.length && inner.every((p) => !p.includes("<") && !p.includes("\n"));
  const open = `<${tag}${props.length ? " " + props.join(" ") : ""}>`;
  return inline ? `${pad}${open}${inner.join("")}</${tag}>` : `${pad}${open}\n${inner.join("\n")}\n${pad}</${tag}>`;
}

// ---- split the page into section files -----------------------------------------------------
const main = find(body, (n) => n.nodeName === "main");
const footer = find(body, (n) => n.nodeName === "footer");
const header = find(body, (n) => n.nodeName === "header");

const blocks = [["Header", header]];
for (const c of kids(main)) {
  if (c.nodeName !== "section" && c.nodeName !== "div") continue;
  const id = attr(c, "id");
  const name = hasClass(c, "hero") ? "Hero" : hasClass(c, "trust") ? "Trust" : id ? id[0].toUpperCase() + id.slice(1) : null;
  if (name) blocks.push([name === "Download" ? "Cta" : name, c]);
}
blocks.push(["Footer", footer]);

mkdirSync(new URL("../src/sections/", import.meta.url), { recursive: true });
const names = [];
for (const [name, node] of blocks) {
  const ctx = { imports: new Map(), tabs: [], compare: false, hero: name === "Hero" };
  let jsx = element(node, ctx, 0);
  if (name === "Hero") jsx = jsx.replace(/(<section[^>]*>)/, "$1\n      <HeroBackdrop />");
  const hooks = [];
  if (ctx.tabs.length) hooks.push(`  const { tab, setTab, onKey } = useTabs(${js(ctx.tabs)});`);
  if (ctx.compare) hooks.push(`  const [pos, setPos] = useState(26);`);
  const uses = ["L", "Pic", "Dl", "LangSwitch"].filter((u) => new RegExp(`<${u}[ />]`).test(jsx));
  const lines = [
    `// Generated by scripts/convert-html.mjs from ../landing/index.html — edit freely, it is plain React now.`,
    ctx.compare ? `import { useState } from "react";` : null,
    ctx.tabs.length ? `import { useTabs } from "../hooks";` : null,
    `import { ${uses.join(", ")} } from "../ui";`,
    name === "Hero" ? `import { HeroBackdrop } from "../HeroBackdrop";` : null,
    ...[...ctx.imports].map(([id, p]) => `import ${id} from ${js(p)};`),
    ``,
    `export default function ${name}() {`,
    ...hooks,
    `  return (`,
    jsx,
    `  );`,
    `}`,
    ``,
  ].filter((l) => l !== null);
  writeFileSync(new URL(`../src/sections/${name}.tsx`, import.meta.url), lines.join("\n"));
  names.push(name);
  console.log(name.padEnd(10), `${jsx.split("\n").length} lines`, ctx.tabs.length ? `tabs:${ctx.tabs.length}` : "", ctx.compare ? "compare" : "");
}
writeFileSync(new URL("../src/sections/index.ts", import.meta.url), names.map((n) => `export { default as ${n} } from "./${n}";`).join("\n") + "\n");

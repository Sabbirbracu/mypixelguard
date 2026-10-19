// Pieces shared by Inspect and Clean: severity colours, privacy topics and their detail dialog,
// the metadata list, translated indicator text, and the "cleaned" result card.
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Camera, CheckCircle2, Copy, Download, FolderSearch, MapPin, Navigation, RotateCw, Ruler, Search, ShieldCheck, Smartphone, Trash2, UserRound, X, XCircle, type LucideIcon } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { save } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { byteString, fileName } from "../format";
import { errorText, t } from "../i18n";
import { useApp, type FileItem } from "../store";
import { Button, Card, Modal, toneColor, type Tone } from "../components/ui";
import type { Analysis, CleanReport, CoreError, Indicator, MetaCategory, PrivacyFact, PrivacyFactKind, PrivateField, Severity } from "../types";

// MARK: Severity

export const severityTone = (s: Severity | null | undefined): Tone => (s === "high" ? "orange" : s === "medium" ? "warning" : s === "info" ? "info" : "success");
export const severityColor = (s: Severity | null | undefined) => toneColor[severityTone(s)];

export const FACT_ICON: Record<PrivacyFactKind, LucideIcon> = {
  location: Navigation, device: Camera, captured: CalendarClock, author: UserRound, software: Smartphone, orientation: RotateCw, dimensions: Ruler,
};

export const bytesIn = (a: Analysis, c: MetaCategory) => a.pieces.filter((p) => p.category === c).reduce((n, p) => n + (p.end - p.start), 0);

/** Facts that identify a person, place or device. Size and orientation are only information. */
export const identifyingFacts = (a: Analysis) => a.privacy_facts.filter((f) => f.kind !== "dimensions" && f.kind !== "orientation");
export const aiMarkers = (a: Analysis) => a.indicators.filter((i) => i.severity !== "info");
export const reviewCount = (a: Analysis) => identifyingFacts(a).length + aiMarkers(a).length;
export const factValue = (f: PrivacyFact) => (f.value_key ? t(f.value_key) : f.value);

// MARK: Indicator text (the analyzer stores it in English; the Mac translates it for display the same way)

function between(text: string, prefix: string, suffix = ""): string | null {
  if (!text.startsWith(prefix) || !text.endsWith(suffix) || text.length < prefix.length + suffix.length) return null;
  return text.slice(prefix.length, text.length - suffix.length);
}

export function indicatorTitle(i: Indicator): string {
  let v: string | null;
  if ((v = between(i.title, "C2PA Content Credentials found")) != null) return t("ind.c2pa.title", v);
  if ((v = between(i.title, "Tagged as AI-generated (DigitalSourceType: ", ")")) != null) return t("ind.aiTag.title", v);
  if ((v = between(i.title, "DigitalSourceType: ")) != null) return t("ind.sourceType.title", v);
  if ((v = between(i.title, "Mentions “", "”")) != null) return t("ind.mentions.title", v);
  if (i.title === "Stable Diffusion generation settings") return t("ind.sd.title");
  if (i.title === "ComfyUI workflow") return t("ind.comfy.title");
  return i.title;
}

export function indicatorDetail(i: Indicator): string {
  const fixed: Record<string, string> = {
    "Signed provenance manifest embedded in the file.": "ind.c2pa.file",
    "Facebook reads this IPTC tag to show an “AI info” label.": "ind.aiTag.detail",
    "Declares how the image was made. Not an AI value.": "ind.sourceType.detail",
    "AI tools and editors leave their name in the file’s metadata.": "ind.mentions.detail",
    "Prompt, seed, model and sampler are stored in this file.": "ind.sd.detail",
    "The full generation graph is stored in this file.": "ind.comfy.detail",
  };
  if (fixed[i.detail]) return t(fixed[i.detail]);
  const base = "Signed provenance manifest. Facebook and Instagram read it to decide on an “AI info” label.";
  if (i.detail.startsWith(base)) {
    const rest = i.detail.slice(base.length);
    const at = rest.indexOf(" Actions: ");
    return t("ind.c2pa.detail") + (at >= 0 ? t("ind.c2pa.actions", rest.slice(at + 10).replace(/\.$/, "")) : "");
  }
  return i.detail;
}

export const indicatorSource = (i: Indicator) => (i.source === "C2PA manifest" ? t("ind.source.c2pa") : i.source === "File" ? t("ind.source.file") : i.source);

// MARK: Privacy topics

export type Topic = "location" | "identity" | "device" | "captured" | "software";
const TOPIC_FIELD: Record<Topic, PrivateField> = { location: "location", identity: "author", device: "device", captured: "dates", software: "software" };
const TOPIC_ICON: Record<Topic, LucideIcon> = { location: MapPin, identity: UserRound, device: Camera, captured: CalendarClock, software: Smartphone };
export const topicForFact = (k: PrivacyFactKind): Topic | null =>
  k === "location" ? "location" : k === "author" ? "identity" : k === "device" ? "device" : k === "captured" ? "captured" : k === "software" ? "software" : null;

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
// Mirrors the selective cleaner's key rules in core/src/tiff.rs.
const FIELD_TOKENS: Record<PrivateField, string[]> = {
  location: ["gps", "location", "latitude", "longitude", "city", "country", "provincestate", "sublocation"],
  device: ["make", "model", "lensmake", "lensmodel", "lensinfo", "cameramodelname", "serialnumber"],
  dates: ["date", "time"],
  author: ["artist", "author", "creator", "owner", "copyright", "writer", "byline", "credit"],
  software: ["software", "processingsoftware", "hostcomputer", "creatortool"],
};
function fieldMatches(field: PrivateField, key: string): boolean {
  if (field === "author" && key.includes("creatortool")) return false;
  return FIELD_TOKENS[field].some((tok) => key.includes(tok));
}

function topicRows(topic: Topic, a: Analysis) {
  const rows: { key: string; value: string }[] = [];
  for (const g of a.groups) {
    const isGps = g.title.toLowerCase().includes("gps");
    for (const it of g.items) {
      if (!it.value.trim()) continue;
      const key = norm(it.key);
      const belongs = topic === "location" ? isGps || fieldMatches("location", key) : !isGps && fieldMatches(TOPIC_FIELD[topic], key);
      if (belongs) rows.push({ key: it.key, value: it.value });
    }
  }
  return rows;
}

export const copyText = (text: string) => void navigator.clipboard?.writeText(text);

export function PrivacyDetailDialog({ topic, item, a, onClose }: { topic: Topic; item: FileItem; a: Analysis; onClose: () => void }) {
  const startBatch = useApp((s) => s.startBatch);
  const running = useApp((s) => s.isBatchRunning());
  const rows = topicRows(topic, a);
  const Icon = TOPIC_ICON[topic];
  const tint = topic === "location" || topic === "identity" ? "var(--accent-text)" : "var(--warning)";
  return (
    <Modal onClose={onClose}>
      <div className="stack" style={{ gap: 0 }}>
        <div className="row top" style={{ gap: 14, padding: "24px 24px 16px" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, display: "grid", placeItems: "center", background: `color-mix(in srgb, ${tint} 14%, transparent)`, color: tint, flex: "none" }}><Icon size={20} /></div>
          <div className="stack" style={{ gap: 4 }}>
            <div style={{ fontSize: 19, fontWeight: 700 }}>{t(`topic.${topic}.title`)}</div>
            <div className="muted">{t(`topic.${topic}.about`)}</div>
          </div>
        </div>
        <div style={{ margin: "0 24px", maxHeight: 280, overflow: "auto", borderRadius: 12, background: "var(--canvas)", border: "1px solid var(--border)" }}>
          {rows.length === 0 && <div className="muted" style={{ padding: 20 }}>{t("topic.empty")}</div>}
          {rows.map((r, i) => (
            <div key={i} style={{ padding: "10px 16px", borderTop: i ? "1px solid var(--border)" : undefined }}>
              <div className="caption" style={{ fontWeight: 600 }}>{r.key}</div>
              <div className="selectable" style={{ fontWeight: 500, overflowWrap: "anywhere" }}>{r.value}</div>
            </div>
          ))}
        </div>
        <div className="caption" style={{ padding: "12px 24px 0" }}>{t("topic.note")}</div>
        <hr className="divider" style={{ marginTop: 18 }} />
        <div className="row" style={{ padding: "16px 24px" }}>
          <Button variant="secondary" icon={Copy} disabled={!rows.length} onClick={() => copyText(rows.map((r) => `${r.key}: ${r.value}`).join("\n"))}>{t("topic.copy")}</Button>
          <div className="spacer" />
          <Button variant="secondary" onClick={onClose}>{t("common.close")}</Button>
          <Button icon={Trash2} disabled={running} onClick={() => { onClose(); setTimeout(() => void startBatch("clean", {}, { targets: [item], extra: { fields: [TOPIC_FIELD[topic]] } }), 0); }}>
            {t("topic.remove", t(`topic.${topic}.word`))}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// MARK: Metadata list

export function plainText(item: FileItem, a: Analysis): string {
  let s = `${item.name}\n${a.kind} · ${a.width}×${a.height} · ${byteString(a.file_size)}\n`;
  if (a.indicators.length) s += `\n${t("export.indicators")}\n` + a.indicators.map((i) => `  - ${i.title} (${i.source})\n`).join("");
  for (const g of a.groups) s += `\n[${g.title}]\n` + g.items.map((i) => `  ${i.key}: ${i.value}\n`).join("");
  if (a.raw_xmp) s += `\n[Raw XMP]\n${a.raw_xmp}\n`;
  return s;
}

export function MetadataTab({ item, a }: { item: FileItem; a: Analysis }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    if (!q) return a.groups;
    return a.groups.map((g) => ({ ...g, items: g.items.filter((i) => i.key.toLowerCase().includes(q) || i.value.toLowerCase().includes(q)) })).filter((g) => g.items.length);
  }, [a.groups, q]);
  const saveText = async () => {
    const dest = await save({ defaultPath: item.name.replace(/\.[^.]+$/, "") + "_metadata.txt", filters: [{ name: "Text", extensions: ["txt"] }] });
    if (dest) await api.writeTextFile(dest, plainText(item, a));
  };
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row">
        <div className="search">
          <Search size={15} color="var(--secondary)" />
          <input type="text" value={query} placeholder={t("metadata.search")} onChange={(e) => setQuery(e.target.value)} />
          {query && <button type="button" className="icon-btn bare" aria-label={t("common.clear")} onClick={() => setQuery("")}><X size={15} /></button>}
        </div>
        <Button variant="secondary" icon={Copy} onClick={() => copyText(plainText(item, a))}>{t("metadata.copyAll")}</Button>
        <Button variant="secondary" icon={Download} onClick={() => void saveText()}>{t("metadata.saveText")}</Button>
      </div>
      {groups.length === 0 && <Card><span className="muted">{query ? t("metadata.noMatch", query) : t("metadata.none")}</span></Card>}
      {groups.map((g) => (
        <Card key={g.title}>
          <div className="stack" style={{ gap: 8 }}>
            <div className="h-sub">{g.title}</div>
            <hr className="divider" />
            {g.items.map((r, i) => (
              <div className="meta-row" key={i} title={t("metadata.copyRow")} onDoubleClick={() => copyText(`${r.key}: ${r.value}`)}>
                <div className="k">{r.key}</div>
                <div className="v">{r.value || "—"}</div>
              </div>
            ))}
          </div>
        </Card>
      ))}
      {a.raw_xmp && !query && (
        <details className="card"><summary>{t("metadata.rawXMP")}</summary><pre className="xmp">{a.raw_xmp}</pre></details>
      )}
    </div>
  );
}

// MARK: After cleaning

export function CleanResultCard({ item, a }: { item: FileItem; a: Analysis }) {
  if (item.status.kind === "failed") return <FailedCard error={item.status.error} />;
  if (item.status.kind !== "cleaned") return null;
  const r: CleanReport = item.status.report;
  const Check = ({ ok, text }: { ok: boolean; text: string }) => (
    <div className="row top" style={{ gap: 8 }}>{ok ? <CheckCircle2 size={16} color="var(--success)" style={{ flex: "none", marginTop: 2 }} /> : <AlertTriangle size={16} color="var(--accent-text)" style={{ flex: "none", marginTop: 2 }} />}<span>{text}</span></div>
  );
  const dir = r.output.slice(0, Math.max(r.output.lastIndexOf("\\"), r.output.lastIndexOf("/")));
  return (
    <Card style={{ borderColor: "color-mix(in srgb, var(--success) 50%, transparent)", borderWidth: 1.5 }}>
      <div className="stack">
        <div className="row top" style={{ gap: 14 }}>
          <ShieldCheck size={30} color="var(--success)" style={{ flex: "none" }} />
          <div className="grow stack" style={{ gap: 4 }}>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{t("cleaned.title")}</div>
            <div className="mono selectable">{fileName(r.output)}</div>
            <div className="caption truncate" style={{ direction: "rtl", textAlign: "left" }}>{dir}</div>
          </div>
          <Button variant="secondary" icon={FolderSearch} onClick={() => void revealItemInDir(r.output)}>{t("action.showInFinder")}</Button>
        </div>
        <hr className="divider" />
        <div className="stack" style={{ gap: 5 }}>
          {r.reencoded ? <Check ok text={t("cleaned.reencoded")} />
            : r.removed.length ? <Check ok text={t("cleaned.removed", r.removed.map((x) => t(`cat.${x.category}.short`)).join(", "), byteString(r.before_bytes), byteString(r.after_bytes))} />
            : <Check ok text={t("cleaned.nothing")} />}
          {r.remaining_indicators.length === 0 ? <Check ok text={t("cleaned.noneLeft")} /> : <Check ok={false} text={t("cleaned.someLeft", r.remaining_indicators.length) + r.remaining_indicators.map(indicatorTitle).join("; ")} />}
          {r.kept_orientation != null && <Check ok text={t("cleaned.orientation", r.kept_orientation)} />}
          <Check ok={r.decodes} text={r.decodes ? t("cleaned.opens") : t("cleaned.cannotOpen")} />
          {!r.removed.some((x) => x.category === "icc") && bytesIn(a, "icc") > 0 && <Check ok text={t("cleaned.iccKept")} />}
        </div>
      </div>
    </Card>
  );
}

export function FailedCard({ error }: { error: CoreError }) {
  return (
    <Card><div className="row" style={{ gap: 12 }}><XCircle size={30} color="var(--danger)" /><div><div className="h-sub">{t("failed.title")}</div><div className="muted">{errorText(error)}</div></div></div></Card>
  );
}

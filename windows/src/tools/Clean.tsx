import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  AlertTriangle, BadgeCheck, Calendar, Camera, CheckCircle2, Copy, Download, FileText, FolderSearch, Hand, Info, Layers, ListChecks, MapPin, MessageSquareText,
  MinusCircle, Palette, RotateCw, Ruler, Scan, ScanEye, Search, ShieldCheck, SlidersHorizontal, Smartphone, Sparkles, Target, Trash2, UserRound, X, XCircle,
  type LucideIcon,
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { save } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { byteString, fileName } from "../format";
import { errorText, runTitle, t } from "../i18n";
import { useApp, type FileItem } from "../store";
import { BatchView, ExportSection, Page, ScopeRow } from "../components/shell";
import { ActionFooter, Button, Callout, Card, CardHeader, Chip, Modal, SectionTitle, Segmented, Spinner, Switch, ToolHeader, toneColor, type Tone } from "../components/ui";
import {
  DEFAULT_REMOVAL, META_CATEGORIES, PRIVATE_FIELDS,
  type Analysis, type CleanReport, type CoreError, type Indicator, type MetaCategory, type PrivacyFactKind, type PrivateField, type Severity, type VisualReport,
} from "../types";

// MARK: Helpers shared with the selective cleaner's key rules (mirror core/src/tiff.rs)

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
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

export const severityTone = (s: Severity | null | undefined): Tone => (s === "high" ? "orange" : s === "medium" ? "warning" : s === "info" ? "info" : "success");
const severityColor = (s: Severity | null | undefined) => toneColor[severityTone(s)];

const CATEGORY_ICON: Record<MetaCategory, LucideIcon> = { c2pa: BadgeCheck, xmp: FileText, iptc: MessageSquareText, exif: Camera, other: Layers, icc: Palette };
const FIELD_ICON: Record<PrivateField, LucideIcon> = { location: MapPin, device: Camera, dates: Calendar, author: UserRound, software: Smartphone };
const FACT_ICON: Record<PrivacyFactKind, LucideIcon> = { location: MapPin, device: Camera, captured: Calendar, author: UserRound, software: Smartphone, orientation: RotateCw, dimensions: Ruler };

type Topic = "location" | "identity" | "device" | "captured" | "software";
const TOPICS: Topic[] = ["location", "identity", "device", "captured", "software"];
const TOPIC_FACT: Record<Topic, PrivacyFactKind> = { location: "location", identity: "author", device: "device", captured: "captured", software: "software" };
const TOPIC_FIELD: Record<Topic, PrivateField> = { location: "location", identity: "author", device: "device", captured: "dates", software: "software" };
const TOPIC_ICON: Record<Topic, LucideIcon> = { location: MapPin, identity: UserRound, device: Camera, captured: Calendar, software: Smartphone };

const topicsPresent = (a: Analysis, severities: Severity[]) => TOPICS.filter((tp) => a.privacy_facts.some((f) => f.kind === TOPIC_FACT[tp] && severities.includes(f.severity)));

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

const suggestedName = (name: string, kind: Analysis["kind"], alpha: boolean) => {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = kind === "Other" ? (alpha ? "png" : "jpg") : dot > 0 ? name.slice(dot + 1) : "jpg";
  return `${base}_AI-label-cleaned.${ext}`;
};

const copy = (text: string) => void navigator.clipboard?.writeText(text);

function plainText(item: FileItem, a: Analysis): string {
  let s = `${item.name}\n${a.kind} · ${a.width}×${a.height} · ${byteString(a.file_size)}\n`;
  if (a.indicators.length) s += `\n${t("export.indicators")}\n` + a.indicators.map((i) => `  - ${i.title} (${i.source})\n`).join("");
  for (const g of a.groups) s += `\n[${g.title}]\n` + g.items.map((i) => `  ${i.key}: ${i.value}\n`).join("");
  if (a.raw_xmp) s += `\n[Raw XMP]\n${a.raw_xmp}\n`;
  return s;
}

// MARK: Entry

export default function CleanView({ mode }: { mode: "inspect" | "clean" }) {
  const item = useApp((s) => s.selected());
  if (!item) return <div className="muted" style={{ flex: 1, display: "grid", placeItems: "center" }}>{t("detail.selectImage")}</div>;
  return <ItemDetail key={`${item.id}-${mode}`} item={item} mode={mode} />;
}

function ItemDetail({ item, mode }: { item: FileItem; mode: "inspect" | "clean" }) {
  const [tab, setTab] = useState<"findings" | "metadata">("findings");
  const batch = useApp((s) => s.batch);
  const a = item.analysis;
  const scanning = item.status.kind === "scanning";
  return (
    <>
      <Page>
        <ToolHeader title={t(`${mode}.title`)} subtitle={t(`${mode}.subtitle`)} />
        <Card tight>
          <div className="row" style={{ gap: 16 }}>
            <div className="thumb" style={{ width: 76, height: 76, borderRadius: 10 }}>{item.thumb && <img src={item.thumb} alt="" style={{ objectFit: "contain" }} />}</div>
            <div className="grow stack" style={{ gap: 6 }}>
              <div className="truncate selectable" style={{ fontSize: 14, fontWeight: 600 }}>{item.name}</div>
              {a && <div className="row" style={{ gap: 6 }}><Chip text={a.kind} /><Chip text={`${a.width} × ${a.height}`} /><Chip text={byteString(a.file_size)} /></div>}
              <Button variant="link" onClick={() => void revealItemInDir(item.path)}>{t("action.showInFinder")}</Button>
            </div>
          </div>
        </Card>

        {scanning ? (
          <div className="row" style={{ justifyContent: "center", padding: 48, gap: 10 }}><Spinner />{t("detail.reading")}</div>
        ) : a ? (
          <>
            <StatusBanner item={item} a={a} />
            {mode === "inspect" ? (
              <>
                <Segmented value={tab} options={[{ value: "findings", label: t("tab.findings") }, { value: "metadata", label: t("tab.metadata") }]} onChange={setTab} />
                {tab === "findings" ? <FindingsTab item={item} a={a} /> : <MetadataTab item={item} a={a} />}
              </>
            ) : (
              <>
                {batch?.tool === "clean" && <BatchView batch={batch} />}
                <RemovalPreview a={a} />
                <OptionsTab a={a} />
              </>
            )}
            <div className="caption" style={{ paddingTop: 4 }}>{t("footnote.limits")}</div>
          </>
        ) : item.status.kind === "failed" ? (
          <Card><div className="row" style={{ color: "var(--danger)" }}><XCircle size={18} />{errorText(item.status.error)}</div></Card>
        ) : item.analysisError ? (
          <Card><div className="row muted"><Info size={16} />{errorText(item.analysisError)}</div></Card>
        ) : null}
      </Page>
      {mode === "clean" && a && !scanning && <ActionBar item={item} a={a} />}
    </>
  );
}

// MARK: Status banner

function StatusBanner({ item, a }: { item: FileItem; a: Analysis }) {
  const [topic, setTopic] = useState<Topic | null>(null);
  if (item.status.kind === "cleaned") return <CleanedBanner report={item.status.report} a={a} />;
  if (item.status.kind === "failed") {
    return (
      <Card><div className="row" style={{ gap: 12 }}><XCircle size={30} color="var(--danger)" /><div><div className="h-sub">{t("failed.title")}</div><div className="muted">{errorText(item.status.error)}</div></div></div></Card>
    );
  }

  const risk = a.risk;
  const aiHigh = a.ai_risk === "high";
  const aiMed = a.ai_risk === "medium";
  const sentence = (() => {
    if (aiHigh || aiMed) return null;
    const sev: Severity | null = a.privacy_risk === "high" ? "high" : a.privacy_risk === "medium" ? "medium" : null;
    if (!sev) return null;
    const topics = topicsPresent(a, [sev]);
    return topics.length ? { key: sev === "high" ? "banner.privacy.high.sentence" : "banner.privacy.medium.sentence", topics } : null;
  })();

  let title: string, text: string, Icon: LucideIcon;
  if (aiHigh) [title, text, Icon] = [t("banner.high.title"), t("banner.high.text"), AlertTriangle];
  else if (aiMed) [title, text, Icon] = [t("banner.medium.title"), t("banner.medium.text"), AlertTriangle];
  else if (a.privacy_risk === "high") [title, text, Icon] = [t("banner.privacy.high.title"), t("banner.privacy.high.text"), Hand];
  else if (a.privacy_risk === "medium") [title, text, Icon] = [t("banner.privacy.medium.title"), t("banner.privacy.medium.text"), Info];
  else if (a.pieces.some((p) => p.category && p.category !== "icc")) [title, text, Icon] = [t("banner.noAI.title"), t("banner.noAI.text"), ShieldCheck];
  else [title, text, Icon] = [t("banner.none.title"), t("banner.none.text"), ShieldCheck];

  const top = a.indicators.filter((i) => i.severity !== "info").slice(0, 4);
  const shortTitle = (i: Indicator) => (i.title.startsWith("C2PA") ? "C2PA Content Credentials" : i.title.startsWith("Tagged as AI") ? t("chip.aiSource") : i.title.startsWith("Mentions ") ? i.title.replace("Mentions ", "") : i.title);

  const linked = (key: string, topics: Topic[]) => {
    const [before, after] = t(key).split("%@");
    return (
      <span className="muted">
        {before}
        {topics.map((tp, i) => (
          <span key={tp}>
            <button type="button" className="btn link" style={{ fontWeight: 700 }} onClick={() => setTopic(tp)}>{t(`topic.${tp}.word`)}</button>
            {i < topics.length - 2 ? t("topic.join.comma") : i === topics.length - 2 ? t(topics.length === 2 ? "topic.join.two" : "topic.join.last") : ""}
          </span>
        ))}
        {after}
      </span>
    );
  };

  return (
    <>
      <Card style={{ borderColor: `color-mix(in srgb, ${severityColor(risk)} 50%, transparent)`, borderWidth: 1.5 }}>
        <div className="row top" style={{ gap: 14 }}>
          <Icon size={30} color={severityColor(risk)} style={{ flex: "none" }} />
          <div className="grow stack" style={{ gap: 6 }}>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{title}</div>
            {sentence ? (
              <>
                {linked(sentence.key, sentence.topics)}
                <div className="caption row" style={{ gap: 6 }}><Hand size={12} />{t("banner.privacy.hint")}</div>
              </>
            ) : <div className="muted">{text}</div>}
            {top.length > 0 && <div className="row" style={{ gap: 6, flexWrap: "wrap", paddingTop: 2 }}>{top.map((i, n) => <Chip key={n} text={shortTitle(i)} tone={severityTone(i.severity)} />)}</div>}
          </div>
        </div>
      </Card>
      {topic && <PrivacyDetailDialog topic={topic} item={item} a={a} onClose={() => setTopic(null)} />}
    </>
  );
}

function CleanedBanner({ report: r, a }: { report: CleanReport; a: Analysis }) {
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
          {r.remaining_indicators.length === 0 ? <Check ok text={t("cleaned.noneLeft")} /> : <Check ok={false} text={t("cleaned.someLeft", r.remaining_indicators.length) + r.remaining_indicators.map((i) => i.title).join("; ")} />}
          {r.kept_orientation != null && <Check ok text={t("cleaned.orientation", r.kept_orientation)} />}
          <Check ok={r.decodes} text={r.decodes ? t("cleaned.opens") : t("cleaned.cannotOpen")} />
          {!r.removed.some((x) => x.category === "icc") && a.pieces.some((p) => p.category === "icc") && <Check ok text={t("cleaned.iccKept")} />}
        </div>
      </div>
    </Card>
  );
}

// MARK: Privacy topic dialog

function PrivacyDetailDialog({ topic, item, a, onClose }: { topic: Topic; item: FileItem; a: Analysis; onClose: () => void }) {
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
          <Button variant="secondary" icon={Copy} disabled={!rows.length} onClick={() => copy(rows.map((r) => `${r.key}: ${r.value}`).join("\n"))}>{t("topic.copy")}</Button>
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

// MARK: Findings tab

function FindingsTab({ item, a }: { item: FileItem; a: Analysis }) {
  const rows = META_CATEGORIES.map((c) => [c, a.pieces.filter((p) => p.category === c).reduce((n, p) => n + (p.end - p.start), 0)] as const).filter(([, n]) => n > 0);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <Card>
        <div className="stack" style={{ gap: 14 }}>
          <div className="row top" style={{ gap: 12 }}>
            {a.privacy_risk === "high" ? <Hand size={26} color="var(--warning)" /> : <ShieldCheck size={26} color="var(--success)" />}
            <div className="stack" style={{ gap: 3 }}>
              <div className="h-sub" style={{ fontSize: 16 }}>{t("privacy.report.title")}</div>
              <div className="muted">{t(a.privacy_risk === "high" ? "privacy.report.review" : a.privacy_risk === "medium" ? "privacy.report.caution" : "privacy.report.clear")}</div>
            </div>
          </div>
          <div className="facts">
            {a.privacy_facts.map((f, i) => {
              const Icon = FACT_ICON[f.kind];
              return (
                <div className="fact" key={i} style={{ ["--c" as string]: severityColor(f.severity) }}>
                  <div className="dot"><Icon size={12} /></div>
                  <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                    <div className="caption" style={{ fontWeight: 600 }}>{t(`privacy.fact.${f.kind}`)}</div>
                    <div className="selectable" style={{ fontWeight: 500, overflowWrap: "anywhere" }}>{f.value_key ? t(f.value_key) : f.value}</div>
                    <div className="caption">{f.source}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="caption">{t("privacy.report.disclaimer")}</div>
        </div>
      </Card>

      <VisualScanCard item={item} />

      <Card>
        <div className="stack">
          <SectionTitle text={t("findings.ai.title")} />
          <div className="caption">{t("findings.ai.caveat")}</div>
          {a.indicators.length === 0 ? (
            <div className="row" style={{ color: "var(--success)", gap: 8 }}><CheckCircle2 size={16} />{t("findings.none")}</div>
          ) : a.indicators.map((i, n) => (
            <div key={n} className="row top" style={{ gap: 10 }}>
              <div className="sev-dot" style={{ background: severityColor(i.severity) }} />
              <div className="stack" style={{ gap: 2 }}>
                <div style={{ fontWeight: 500 }}>{i.title}</div>
                <div className="caption">{i.detail}</div>
                <div className="caption">{t("findings.foundIn", i.source)}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="stack">
          <SectionTitle text={t("findings.hidden.title")} />
          {rows.length === 0 ? <div className="muted">{t("findings.hidden.none")}</div> : rows.map(([c, n], i) => (
            <div key={c} className="stack" style={{ gap: 10 }}>
              {i > 0 && <hr className="divider" />}
              <div className="row top">
                <div className="grow"><div style={{ fontWeight: 500 }}>{t(`cat.${c}.title`)}</div><div className="caption">{t(`cat.${c}.detail`)}</div></div>
                <Chip text={byteString(n)} tone={c === "icc" ? "secondary" : "orange"} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function VisualScanCard({ item }: { item: FileItem }) {
  const [report, setReport] = useState<VisualReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<CoreError | string | null>(null);
  const run = async () => {
    setScanning(true); setError(null); setReport(null);
    try { setReport(await api.redactScan(item.path)); } catch (e) { setError(errorText(e)); }
    setScanning(false);
  };
  const faces = report?.regions.filter((r) => r.kind === "face").length ?? 0;
  const text = report?.regions.filter((r) => r.kind !== "face" && r.kind !== "manual").length ?? 0;
  return (
    <Card>
      <div className="stack">
        <div className="row">
          <div className="grow"><SectionTitle text={t("visual.scan.title")} /><div className="caption">{t("visual.scan.subtitle")}</div></div>
          <Button variant="secondary" icon={scanning ? undefined : Scan} disabled={scanning} onClick={() => void run()}>
            {scanning ? <><Spinner small />{t("visual.scan.scanning")}</> : report ? t("visual.scan.again") : t("visual.scan.run")}
          </Button>
        </div>
        {report && (report.regions.length === 0 ? (
          <div className="row" style={{ color: "var(--success)", gap: 8 }}><CheckCircle2 size={16} />{t("visual.scan.none")}</div>
        ) : (
          <>
            <div className="row" style={{ gap: 8 }}>{faces > 0 && <Chip text={t("visual.scan.faces", faces)} tone="warning" />}{text > 0 && <Chip text={t("visual.scan.text", text)} tone="warning" />}</div>
            {report.regions.slice(0, 12).map((r) => (
              <div key={r.id} className="row" style={{ gap: 9 }}>
                <ScanEye size={16} color="var(--warning)" />
                <div className="grow"><div style={{ fontWeight: 500 }}>{t(`visual.kind.${r.kind}`)}</div>{r.label.startsWith("t:") ? null : r.label !== t(`visual.kind.${r.kind}`) && <div className="caption selectable">{r.label}</div>}</div>
                <span className="caption">{Math.round(r.confidence * 100)}%</span>
              </div>
            ))}
            <div className="caption">{t("visual.scan.review")}</div>
          </>
        ))}
        {report && !report.textAvailable && <div className="caption row" style={{ gap: 6 }}><Info size={12} />{t("visual.noOCR")}</div>}
        {report && !report.facesAvailable && <div className="caption row" style={{ gap: 6 }}><Info size={12} />{t("visual.noFaces")}</div>}
        {error && <div className="row" style={{ color: "var(--danger)", gap: 8 }}><AlertTriangle size={15} />{String(error)}</div>}
        <div className="caption row" style={{ gap: 6 }}><Info size={12} />{t("visual.scan.local")}</div>
      </div>
    </Card>
  );
}

// MARK: Metadata tab

function MetadataTab({ item, a }: { item: FileItem; a: Analysis }) {
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
        <Button variant="secondary" icon={Copy} onClick={() => copy(plainText(item, a))}>{t("metadata.copyAll")}</Button>
        <Button variant="secondary" icon={Download} onClick={() => void saveText()}>{t("metadata.saveText")}</Button>
      </div>
      {groups.length === 0 && <Card><span className="muted">{query ? t("metadata.noMatch", query) : t("metadata.none")}</span></Card>}
      {groups.map((g) => (
        <Card key={g.title}>
          <div className="stack" style={{ gap: 8 }}>
            <div className="h-sub">{g.title}</div>
            <hr className="divider" />
            {g.items.map((r, i) => (
              <div className="meta-row" key={i} title={t("metadata.copyRow")} onDoubleClick={() => copy(`${r.key}: ${r.value}`)}>
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

// MARK: Removal preview + options

function RemovalPreview({ a }: { a: Analysis }) {
  const remove = useApp((s) => s.remove);
  const bytes = (c: MetaCategory) => a.pieces.filter((p) => p.category === c).reduce((n, p) => n + (p.end - p.start), 0);
  const present = META_CATEGORIES.filter((c) => bytes(c) > 0);
  const removing = present.filter((c) => remove.includes(c));
  const keeping = present.filter((c) => !remove.includes(c));
  const panel = (title: string, Icon: LucideIcon, tone: Tone, items: MetaCategory[]) => (
    <div className="panel" style={{ ["--c" as string]: toneColor[tone] }}>
      <div className="row"><Icon size={16} color={toneColor[tone]} /><b className="grow">{title}</b><Chip text={String(items.length)} tone={tone} /></div>
      <hr className="divider" />
      {items.length === 0 ? <div className="muted">{t("preview.none")}</div> : items.map((c) => {
        const CIcon = CATEGORY_ICON[c];
        return <div key={c} className="row" style={{ gap: 9 }}><CIcon size={16} color={toneColor[tone]} /><span className="grow">{t(`cat.${c}.short`)}</span><span className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>{byteString(bytes(c))}</span></div>;
      })}
    </div>
  );
  return (
    <Card>
      <div className="stack" style={{ gap: 14 }}>
        <CardHeader icon={ListChecks} title={t("preview.title")} subtitle={t("preview.subtitle")} />
        {present.length === 0 ? <div className="muted">{t("preview.nothing")}</div> : (
          <>
            <div className="two-col">{panel(t("preview.willRemove"), MinusCircle, "orange", removing)}{panel(t("preview.willKeep"), CheckCircle2, "success", keeping)}</div>
            {removing.includes("c2pa") && a.has_provenance && <Callout text={t("preview.provenanceWarning")} />}
          </>
        )}
      </div>
    </Card>
  );
}

function OptionsTab({ a }: { a: Analysis }) {
  const { remove, setRemove, selectiveFields, setSelectiveFields, startBatch } = useApp();
  const targets = useApp(useShallow((s) => s.toolTargets()));
  const bytes = (c: MetaCategory) => a.pieces.filter((p) => p.category === c).reduce((n, p) => n + (p.end - p.start), 0);
  const isDefault = remove.length === DEFAULT_REMOVAL.length && DEFAULT_REMOVAL.every((c) => remove.includes(c));
  const toggle = (c: MetaCategory, on: boolean) => setRemove(on ? [...remove, c] : remove.filter((x) => x !== c));
  const toggleField = (f: PrivateField) => setSelectiveFields(selectiveFields.includes(f) ? selectiveFields.filter((x) => x !== f) : [...selectiveFields, f]);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <Card className="opt-table">
        <div style={{ padding: 18 }}>
          <CardHeader icon={SlidersHorizontal} title={t("options.title")} subtitle={t("options.text")}>
            <Button variant="secondary" disabled={isDefault} onClick={() => setRemove([...DEFAULT_REMOVAL])}>{t("options.reset")}</Button>
          </CardHeader>
        </div>
        <div className="opt-head"><div className="grow">{t("options.col.type")}</div><div className="col-found">{t("options.col.found")}</div><div className="col-toggle">{t("options.col.remove")}</div></div>
        {META_CATEGORIES.map((c) => {
          const size = bytes(c);
          const present = size > 0;
          const on = remove.includes(c);
          const warns = c === "c2pa" && present && on;
          const Icon = CATEGORY_ICON[c];
          const color = warns ? "var(--warning)" : present ? "var(--accent-text)" : "var(--secondary)";
          return (
            <div key={c} className={`opt-row ${on && present ? "on" : ""}`} style={{ opacity: present || on ? 1 : 0.7 }}>
              <div className="opt-ico" style={{ ["--c" as string]: color }}><Icon size={15} /></div>
              <div className="grow">
                <div className="row" style={{ gap: 8 }}>
                  <b>{t(`cat.${c}.title`)}</b>
                  {DEFAULT_REMOVAL.includes(c) && <Chip text={t("options.recommended")} tone="success" />}
                </div>
                <div className="caption">{t(`cat.${c}.detail`)}</div>
              </div>
              <div className="col-found">{present ? <Chip text={t("options.inPhoto", byteString(size))} tone="orange" /> : <span className="caption">{t("options.notInPhoto")}</span>}</div>
              <div className="col-toggle"><Switch checked={on} onChange={(v) => toggle(c, v)} label={t(`cat.${c}.title`)} /></div>
            </div>
          );
        })}
      </Card>

      <Card>
        <div className="stack" style={{ gap: 14 }}>
          <CardHeader icon={Target} title={t("selective.title")} subtitle={t("selective.text")} />
          <div className="row">
            <Button variant="secondary" onClick={() => setSelectiveFields(["location"])}>{t("selective.locationOnly")}</Button>
            <Button variant="secondary" onClick={() => setSelectiveFields([...PRIVATE_FIELDS])}>{t("selective.everything")}</Button>
          </div>
          <div className="field-chips">
            {PRIVATE_FIELDS.map((f) => {
              const on = selectiveFields.includes(f);
              const Icon = FIELD_ICON[f];
              return (
                <button key={f} type="button" className="field-chip" aria-pressed={on} onClick={() => toggleField(f)}>
                  {on ? <CheckCircle2 size={16} color="var(--accent-text)" /> : <span style={{ width: 16, height: 16, borderRadius: "50%", border: "1.5px solid var(--secondary)" }} />}
                  <Icon size={15} />{t(`privacy.field.${f}`)}
                </button>
              );
            })}
          </div>
          <ScopeRow />
          <ExportSection tool="clean" prominent={false} showsBatch={false} title={runTitle("selective.run", targets.length)}
            onRun={() => void startBatch("clean", {}, { extra: { fields: selectiveFields } })} />
        </div>
      </Card>
      {a.kind === "Other" && <div className="caption row" style={{ gap: 6 }}><Info size={13} />{t("options.reencodeNote")}</div>}
    </div>
  );
}

// MARK: Action bar

function ActionBar({ item, a }: { item: FileItem; a: Analysis }) {
  const { remove, files, isCleaning, cleanSelected, cleanAll, cancelCleaning } = useApp();
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !isCleaning) { e.preventDefault(); void cleanSelected(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isCleaning, cleanSelected]);
  const ready = files.filter((f) => f.analysis).length;
  const bytes = (c: MetaCategory) => a.pieces.filter((p) => p.category === c).reduce((n, p) => n + (p.end - p.start), 0);
  const removing = META_CATEGORIES.filter((c) => remove.includes(c) && bytes(c) > 0);
  const total = removing.reduce((n, c) => n + bytes(c), 0);
  const summary = removing.length ? t("clean.summary", byteString(total)) : t("clean.summary.none");
  return (
    <ActionFooter summary={summary} hint={t("clean.saveHint", suggestedName(item.name, a.kind, a.has_alpha))}>
      {isCleaning && <><Spinner small /><Button variant="secondary" onClick={cancelCleaning}>{t("common.cancel")}</Button></>}
      {ready > 1 && <Button variant="secondary" icon={Layers} disabled={isCleaning} onClick={() => void cleanAll()}>{t("clean.all", ready)}</Button>}
      <Button variant="large" icon={Sparkles} disabled={isCleaning} onClick={() => void cleanSelected()}>{item.status.kind === "cleaned" ? t("clean.again") : t("clean.run")}</Button>
    </ActionFooter>
  );
}


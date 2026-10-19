// Inspect: an overview of what the file reveals (preview, privacy findings, visible-content scan, AI markers)
// plus the full metadata list. Mirrors InspectViews.swift.
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArrowRight, ArrowUpRight, CheckCircle2, ChevronRight, File, FileText, Info, Layers, Lock, Maximize2, Minus, MoveDiagonal, Plus,
  RotateCw, ScanLine, XCircle,
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { api } from "../api";
import { byteString } from "../format";
import { errorText, t } from "../i18n";
import { useApp, type FileItem } from "../store";
import { Button, Card, Chip, MenuButton, Modal, Spinner, ToolFooter, useRunShortcut } from "../components/ui";
import { META_CATEGORIES, type Analysis, type PrivacyFact, type VisualReport } from "../types";
import {
  FACT_ICON, MetadataTab, PrivacyDetailDialog, aiMarkers, bytesIn, factValue, identifyingFacts, indicatorDetail, indicatorSource, indicatorTitle, reviewCount,
  severityColor, topicForFact, type Topic,
} from "./privacy";

export default function InspectView() {
  const item = useApp((s) => s.selected());
  if (!item) return <div className="muted" style={{ flex: 1, display: "grid", placeItems: "center" }}>{t("detail.selectImage")}</div>;
  return <InspectItem key={item.id} item={item} />;
}

function InspectItem({ item }: { item: FileItem }) {
  const [tab, setTab] = useState<"overview" | "metadata">("overview");
  const setTool = useApp((s) => s.setTool);
  const a = item.analysis;
  const scanning = item.status.kind === "scanning";
  useRunShortcut(() => setTool("clean"), !!a && !scanning);
  return (
    <>
      <div className="scroll">
        <div className="inspect-page">
          {scanning ? (
            <div className="row" style={{ justifyContent: "center", padding: 48, gap: 10 }}><Spinner />{t("detail.reading")}</div>
          ) : a ? (
            <>
              <TabBar tab={tab} setTab={setTab} count={reviewCount(a)} />
              {tab === "overview" ? <Overview item={item} a={a} /> : <MetadataTab item={item} a={a} />}
            </>
          ) : item.status.kind === "failed" ? (
            <Card style={{ marginTop: 28 }}><div className="row" style={{ color: "var(--danger)" }}><XCircle size={18} />{errorText(item.status.error)}</div></Card>
          ) : item.analysisError ? (
            <Card style={{ marginTop: 28 }}><div className="row muted"><Info size={16} />{errorText(item.analysisError)}</div></Card>
          ) : null}
        </div>
      </div>
      {a && !scanning && (
        <ToolFooter wide untouched={t("inspect.footer.untouched")}>
          <span className="muted">{t("inspect.footer.next")}</span>
          <Button onClick={() => setTool("clean")}>{t("inspect.footer.review")}<ArrowRight size={15} /></Button>
        </ToolFooter>
      )}
    </>
  );
}

function TabBar({ tab, setTab, count }: { tab: "overview" | "metadata"; setTab: (t: "overview" | "metadata") => void; count: number }) {
  return (
    <div className="tabbar" role="tablist">
      {(["overview", "metadata"] as const).map((id) => (
        <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{t(`tab.${id}`)}</button>
      ))}
      {count > 0 ? (
        <span className="review" style={{ ["--pill" as string]: "var(--warning)" }}><AlertTriangle size={15} />{t(count === 1 ? "inspect.review.one" : "inspect.review.many", count)}</span>
      ) : (
        <span className="review" style={{ ["--pill" as string]: "var(--success)" }}><CheckCircle2 size={15} />{t("inspect.review.none")}</span>
      )}
    </div>
  );
}

function Overview({ item, a }: { item: FileItem; a: Analysis }) {
  return (
    <div className="inspect-grid">
      <PreviewCard item={item} a={a} />
      <div className="inspect-right">
        <FindingsCard item={item} a={a} />
        <div className="inspect-pair">
          <VisualScanCard item={item} />
          <ProvenanceCard a={a} />
        </div>
      </div>
    </div>
  );
}

// MARK: Image preview

function IconTile({ icon: Icon, tint }: { icon: typeof File; tint?: string }) {
  return <div className="icon-tile" style={tint ? { ["--tint" as string]: tint } : undefined}><Icon size={15} /></div>;
}

function PreviewCard({ item, a }: { item: FileItem; a: Analysis }) {
  const [image, setImage] = useState<string | null>(item.thumb);
  const [zoom, setZoom] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ w: 360, h: 250 });
  useEffect(() => {
    let dead = false;
    api.previewImage(item.path, 2400).then((src) => !dead && setImage(src)).catch(() => undefined);
    return () => { dead = true; };
  }, [item.path]);
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setView({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pw = Math.max(a.width, 1), ph = Math.max(a.height, 1);
  const fit = Math.min(view.w / pw, view.h / ph);
  const scale = zoom ?? fit;
  const orientation = a.privacy_facts.find((f) => f.kind === "orientation");
  const present = META_CATEGORIES.filter((c) => bytesIn(a, c) > 0).slice(0, 3);
  return (
    <Card>
      <div className="stack" style={{ gap: 14 }}>
        <div className="row">
          <div className="headline grow">{t("inspect.preview.title")}</div>
          <button type="button" className="icon-btn" style={{ width: 30, height: 30, background: "none", borderColor: "var(--elevated-border)" }} title={t("inspect.expand")} aria-label={t("inspect.expand")} onClick={() => setExpanded(true)}><Maximize2 size={13} /></button>
        </div>
        <div ref={viewRef} className={`viewport ${zoom != null ? "zoomed" : ""}`}>
          <div className="inner">
            {image ? <img src={image} alt="" style={{ width: pw * scale, height: ph * scale, display: "block" }} /> : <Spinner small />}
          </div>
        </div>
        <div className="row">
          <MenuButton label={zoom == null ? t("inspect.zoom.fitShort") : t("inspect.zoom.custom")}
            items={[{ label: t("inspect.zoom.fit"), onSelect: () => setZoom(null) }, ...[0.5, 1, 2].map((v) => ({ label: `${v * 100}%`, onSelect: () => setZoom(v) }))]} />
          <div className="spacer" />
          <div className="zoom-pill">
            <button type="button" aria-label="−" onClick={() => setZoom(Math.max(0.05, scale / 1.25))}><Minus size={12} strokeWidth={3} /></button>
            <span>{Math.round(scale * 100)}%</span>
            <button type="button" aria-label="+" onClick={() => setZoom(Math.min(8, scale * 1.25))}><Plus size={12} strokeWidth={3} /></button>
          </div>
        </div>
        <hr className="divider" />
        <div className="info-grid">
          <InfoCell icon={FileText} label={t("inspect.info.format")} value={a.kind} />
          <InfoCell icon={MoveDiagonal} label={t("inspect.info.dimensions")} value={`${a.width} × ${a.height} px`} />
          <InfoCell icon={File} label={t("inspect.info.size")} value={byteString(a.file_size)} />
          <InfoCell icon={RotateCw} label={t("inspect.info.orientation")} value={orientation ? factValue(orientation) : "—"} />
        </div>
        <hr className="divider" />
        <div className="row" style={{ gap: 12 }}>
          <IconTile icon={Layers} />
          <span className="grow" style={{ minWidth: 70 }}>{t("inspect.embedded")}</span>
          {present.length === 0 ? <span className="muted">{t("inspect.none")}</span> : (
            <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-end", rowGap: 4, columnGap: 12, minWidth: 0 }}>
              {present.map((c) => (
                <span key={c} className="row" style={{ gap: 6, whiteSpace: "nowrap" }}>
                  <span className="caption">{t(`cat.${c}.short`)}</span><b style={{ fontWeight: 500 }}>{byteString(bytesIn(a, c))}</b>
                </span>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="link-btn" onClick={() => void revealItemInDir(item.path)}>{t("action.showInFinder")}<ArrowUpRight size={13} strokeWidth={2.5} /></button>
      </div>
      {expanded && (
        <Modal onClose={() => setExpanded(false)} width={900}>
          <div className="row" style={{ padding: 16 }}>
            <div className="headline grow truncate">{item.name}</div>
            <Button variant="secondary" onClick={() => setExpanded(false)}>{t("common.close")}</Button>
          </div>
          <hr className="divider" />
          <div style={{ background: "var(--canvas)", padding: 16, height: "70vh", display: "grid", placeItems: "center" }}>
            {image && <img src={image} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />}
          </div>
        </Modal>
      )}
    </Card>
  );
}

function InfoCell({ icon, label, value }: { icon: typeof File; label: string; value: string }) {
  return (
    <div className="info-cell">
      <IconTile icon={icon} />
      <div style={{ minWidth: 0 }}>
        <div className="caption">{label}</div>
        <div className="truncate" style={{ fontWeight: 600 }}>{value}</div>
      </div>
    </div>
  );
}

// MARK: Privacy findings

function FindingsCard({ item, a }: { item: FileItem; a: Analysis }) {
  const [topic, setTopic] = useState<Topic | null>(null);
  const facts = identifyingFacts(a);
  return (
    <Card>
      <div className="stack" style={{ gap: 14 }}>
        <div className="stack" style={{ gap: 6 }}>
          <div className="row" style={{ gap: 10 }}>
            <h2 className="title3" style={{ fontSize: 18 }}>{t("inspect.findings.title")}</h2>
            {facts.length > 0 && <span className="count-badge">{facts.length}</span>}
          </div>
          <div className="muted">{t(facts.length ? "inspect.findings.text" : "inspect.findings.none")}</div>
        </div>
        {facts.length > 0 && (
          <>
            <div className="stack" style={{ gap: 10 }}>
              {facts.map((f, i) => <FindingRow key={i} fact={f} onOpen={() => setTopic(topicForFact(f.kind))} />)}
            </div>
            <hr className="divider" />
            <div className="row muted" style={{ gap: 8 }}><Info size={14} />{t("inspect.findings.review")}</div>
          </>
        )}
      </div>
      {topic && <PrivacyDetailDialog topic={topic} item={item} a={a} onClose={() => setTopic(null)} />}
    </Card>
  );
}

function FindingRow({ fact, onOpen }: { fact: PrivacyFact; onOpen: () => void }) {
  const Icon = FACT_ICON[fact.kind];
  return (
    <button type="button" className="finding-row" style={{ ["--c" as string]: severityColor(fact.severity) }} onClick={onOpen}>
      <span className="circle"><Icon size={19} /></span>
      <span className="grow stack" style={{ gap: 2 }}>
        <span className="muted">{t(`privacy.fact.${fact.kind}`)}</span>
        <span className="val selectable">{factValue(fact)}</span>
        <span className="caption">{fact.source.replace(/ \/ /g, " • ")}</span>
      </span>
      <ChevronRight size={17} color="var(--secondary)" style={{ flex: "none" }} />
    </button>
  );
}

// MARK: Visible privacy scan

function VisualScanCard({ item }: { item: FileItem }) {
  const [report, setReport] = useState<VisualReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setScanning(true); setError(null); setReport(null);
    try { setReport(await api.redactScan(item.path)); } catch (e) { setError(errorText(e)); }
    setScanning(false);
  };
  const pill = error ? { text: error, c: "var(--danger)", icon: AlertTriangle }
    : report ? (report.regions.length === 0 ? { text: t("inspect.scan.clear"), c: "var(--success)", icon: CheckCircle2 } : { text: t("inspect.scan.found", report.regions.length), c: "var(--warning)", icon: AlertTriangle })
    : null;
  return (
    <Card>
      <div className="stack" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 12 }}><IconTile icon={ScanLine} /><div className="headline">{t("visual.scan.title")}</div></div>
        {pill ? <span className="pill" style={{ ["--pill" as string]: pill.c }}><pill.icon size={14} />{pill.text}</span> : <span className="pill neutral">{t("inspect.scan.notScanned")}</span>}
        <div className="muted">{report ? t("visual.scan.review") : t("inspect.scan.text")}</div>
        {report && report.regions.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            {report.regions.slice(0, 5).map((r) => <div key={r.id} className="caption row" style={{ gap: 6, color: "var(--ink)" }}><ScanLine size={12} />{t(`visual.kind.${r.kind}`)}</div>)}
            {report.regions.length > 5 && <div className="caption">+{report.regions.length - 5}</div>}
          </div>
        )}
        {report && !report.textAvailable && <div className="caption">{t("visual.noOCR")}</div>}
        {report && !report.facesAvailable && <div className="caption">{t("visual.noFaces")}</div>}
        <Button variant="secondary" disabled={scanning} style={{ width: "100%" }} onClick={() => void run()}>
          {scanning ? <><Spinner small />{t("visual.scan.scanning")}</> : <><ScanLine size={15} />{report ? t("visual.scan.again") : t("visual.scan.run")}</>}
        </Button>
        <div className="caption row" style={{ gap: 6 }}><Lock size={12} />{t("inspect.scan.local")}</div>
      </div>
    </Card>
  );
}

// MARK: AI & provenance

function ProvenanceCard({ a }: { a: Analysis }) {
  const [details, setDetails] = useState(false);
  const markers = aiMarkers(a);
  const c = markers.length === 0 ? "var(--success)" : severityColor(a.ai_risk);
  const rows = META_CATEGORIES.map((cat) => [cat, bytesIn(a, cat)] as const).filter(([, n]) => n > 0);
  return (
    <Card>
      <div className="stack" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 12 }}><IconTile icon={FileText} /><div className="headline">{t("inspect.ai.title")}</div></div>
        <span className="pill" style={{ ["--pill" as string]: c }}>
          {markers.length === 0 ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {markers.length === 0 ? t("inspect.ai.none") : t("inspect.ai.found", markers.length)}
        </span>
        <div className="muted">{t("inspect.ai.caveat")}</div>
        <button type="button" className="link-btn" onClick={() => setDetails(true)}>{t("inspect.ai.details")}<ArrowRight size={13} strokeWidth={2.5} /></button>
      </div>
      {details && (
        <Modal onClose={() => setDetails(false)} width={520}>
          <div style={{ padding: "24px 24px 14px" }}>
            <div style={{ fontSize: 19, fontWeight: 700 }}>{t("findings.ai.title")}</div>
            <div className="muted" style={{ marginTop: 4 }}>{t("findings.ai.caveat")}</div>
          </div>
          <div className="stack" style={{ gap: 18, padding: "0 24px", maxHeight: 380, overflow: "auto" }}>
            {a.indicators.length === 0 ? <div className="row" style={{ color: "var(--success)", gap: 8 }}><CheckCircle2 size={16} />{t("findings.none")}</div>
              : a.indicators.map((ind, n) => (
                <div key={n} className="row top" style={{ gap: 10 }}>
                  <div className="sev-dot" style={{ background: severityColor(ind.severity) }} />
                  <div className="stack" style={{ gap: 2 }}>
                    <div style={{ fontWeight: 500 }}>{indicatorTitle(ind)}</div>
                    <div className="caption">{indicatorDetail(ind)}</div>
                    <div className="caption">{t("findings.foundIn", indicatorSource(ind))}</div>
                  </div>
                </div>
              ))}
            <hr className="divider" />
            <div className="headline">{t("findings.hidden.title")}</div>
            {rows.length === 0 ? <div className="muted">{t("findings.hidden.none")}</div> : rows.map(([cat, n]) => (
              <div key={cat} className="row top">
                <div className="grow"><div style={{ fontWeight: 500 }}>{t(`cat.${cat}.title`)}</div><div className="caption">{t(`cat.${cat}.detail`)}</div></div>
                <Chip text={byteString(n)} tone={cat === "icc" ? "secondary" : "orange"} />
              </div>
            ))}
          </div>
          <hr className="divider" style={{ marginTop: 14 }} />
          <div className="row" style={{ padding: "16px 24px", justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setDetails(false)}>{t("common.close")}</Button>
          </div>
        </Modal>
      )}
    </Card>
  );
}

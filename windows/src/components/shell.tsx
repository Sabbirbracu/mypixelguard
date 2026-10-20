import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRightLeft, CheckCircle2, ChevronLeft, ChevronRight, Crop, Eraser, EyeOff, Folder, FolderPlus, Images, Layers, Lock, MoreHorizontal,
  Plus, Scissors, Search, Settings as SettingsIcon, ShieldCheck, Trash2, WandSparkles, XCircle, Minimize2, MinusCircle, FolderSearch, AlertTriangle, ImageIcon, ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { LANGUAGES, noteText, errorText, runTitle, t } from "../i18n";
import { byteString, percentSaved } from "../format";
import { useApp, type BatchState, type FileItem } from "../store";
import { TOOLS, type BatchResult, type Tool } from "../types";
import { Button, Callout, Card, Chip, Modal, NoticeCard, ProgressBar, Segmented, Spinner, Switch, toneColor } from "./ui";
import { UpdateBanner } from "./services";
import { useServices } from "../services";
import markLight from "../assets/brand/MyPixelGuard-Mark-Light.svg";
import markDark from "../assets/brand/MyPixelGuard-Mark-Dark.svg";

export const TOOL_ICONS: Record<Tool, LucideIcon> = {
  inspect: Search, clean: Eraser, redact: EyeOff, convert: ArrowRightLeft, resize: Crop, compress: Minimize2,
  background: Scissors, studio: Layers, enhance: WandSparkles,
};

export function BrandMark({ size = 48 }: { size?: number }) {
  return (
    <>
      <img className="mark-light" src={markLight} width={size} height={size} alt="" />
      <img className="mark-dark" src={markDark} width={size} height={size} alt="" />
    </>
  );
}

export function BrandLogo({ height = 40 }: { height?: number }) {
  return (
    <div className="logo" role="img" aria-label="MyPixelGuard">
      <BrandMark size={height} />
      <span className="logo-text" style={{ fontSize: height * 0.43 }}>MyPixel<b>Guard</b></span>
    </div>
  );
}

/** Scrolling page used by every tool. */
export function Page({ children }: { children: ReactNode }) {
  return <div className="scroll"><div className="page">{children}</div></div>;
}

// MARK: Sidebar

export function Sidebar({ onSettings }: { onSettings: () => void }) {
  const tool = useApp((s) => s.tool);
  const setTool = useApp((s) => s.setTool);
  return (
    <aside className="sidebar">
      <div style={{ padding: "26px 18px 30px" }}><BrandLogo height={31} /></div>
      <div className="nav-title">{t("nav.tools")}</div>
      <nav className="nav">
        {TOOLS.map((id, i) => {
          const Icon = TOOL_ICONS[id];
          return (
            <button key={id} type="button" className={`nav-row ${tool === id ? "active" : ""}`} aria-current={tool === id} title={`${t(`tool.${id}`)}  Ctrl+${i + 1}`} onClick={() => setTool(id)}>
              <span className="ico"><Icon size={14} /></span>
              <span className="truncate">{t(`tool.${id}`)}</span>
            </button>
          );
        })}
      </nav>
      <div className="spacer" />
      <UpdateBanner />
      <div className="privacy-badge">
        <Lock size={15} color="var(--success)" style={{ flex: "none", marginTop: 2 }} />
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 600 }}>{t("privacy.local.title")}</div>
          <div className="caption">{t("privacy.badge")}</div>
        </div>
      </div>
      <div style={{ padding: "0 12px 12px" }}>
        <Button variant="secondary" icon={SettingsIcon} onClick={onSettings} style={{ width: "100%", justifyContent: "flex-start" }}>{t("nav.settings")}</Button>
      </div>
    </aside>
  );
}

// MARK: Workspace bar

function useClickAway(ref: React.RefObject<HTMLElement | null>, onAway: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onAway();
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [ref, onAway, active]);
}

export function WorkspaceBar() {
  const { files, selection, select, tool, chooseImages, chooseFolder, removeFile, clearAll } = useApp();
  const [list, setList] = useState(false);
  const [more, setMore] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  useClickAway(listRef, () => setList(false), list);
  useClickAway(moreRef, () => setMore(false), more);
  const index = files.findIndex((f) => f.id === selection);
  const current = files[index];
  const flagged = files.filter((f) => (f.analysis?.risk === "medium" || f.analysis?.risk === "high") && f.status.kind !== "cleaned").length;
  const move = (d: number) => files[index + d] && select(files[index + d].id);

  return (
    <div className="workspace">
      <div className="file-pill" ref={listRef}>
        <div className="thumb">{current?.thumb ? <img src={current.thumb} alt="" /> : <ImageIcon size={18} color="var(--secondary)" />}</div>
        <div className="grow">
          <div className="truncate" style={{ fontWeight: 600 }}>{current?.name ?? t("detail.selectImage")}</div>
          <div className="caption">{t(files.length === 1 ? "files.count.one" : "files.count.many", files.length)}</div>
        </div>
        <button type="button" className="icon-btn bare" aria-label={t("files.section")} onClick={() => setList((v) => !v)}><Images size={17} /></button>
        {list && (
          <div className="menu" style={{ top: 52, left: 0, right: 0 }}>
            {files.map((f) => (
              <button key={f.id} type="button" onClick={() => { select(f.id); setList(false); }}>
                {f.id === selection ? <CheckCircle2 size={15} color="var(--accent-text)" /> : <ImageIcon size={15} />}
                <span className="truncate">{f.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="row" style={{ gap: 4 }}>
        <button type="button" className="icon-btn" aria-label={t("action.previousImage")} title={t("action.previousImage")} disabled={index <= 0} onClick={() => move(-1)}><ChevronLeft size={16} /></button>
        <button type="button" className="icon-btn" aria-label={t("action.nextImage")} title={t("action.nextImage")} disabled={index < 0 || index >= files.length - 1} onClick={() => move(1)}><ChevronRight size={16} /></button>
      </div>
      <div className="spacer" />
      {(tool === "clean" || tool === "inspect") && flagged > 0 && <Chip text={t("files.needCleaning", flagged)} tone="warning" />}
      <Button variant="secondary" icon={Plus} aria-label={t("action.addImages")} title={t("help.addImages")} onClick={() => void chooseImages()} />
      <div ref={moreRef} style={{ position: "relative" }}>
        <button type="button" className="icon-btn" style={{ width: 32, height: 32 }} aria-label={t("workspace.more")} title={t("workspace.more")} onClick={() => setMore((v) => !v)}><MoreHorizontal size={17} /></button>
        {more && (
          <div className="menu" style={{ top: 38, right: 0 }}>
            <button type="button" onClick={() => { setMore(false); void chooseFolder(); }}><FolderPlus size={15} />{t("action.addFolder")}</button>
            {selection && <button type="button" onClick={() => { setMore(false); removeFile(selection); }}><MinusCircle size={15} />{t("action.removeFromList")}</button>}
            <button type="button" style={{ color: "var(--danger)" }} onClick={() => { setMore(false); clearAll(); }}><Trash2 size={15} />{t("action.clearList")}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// MARK: Empty state

export function EmptyState() {
  const chooseImages = useApp((s) => s.chooseImages);
  const step = (n: number, title: string, text: string) => (
    <div className="step" key={n}>
      <div className="n">{n}</div>
      <div className="h-sub">{title}</div>
      <div className="caption">{text}</div>
    </div>
  );
  return (
    <div className="empty">
      <div className="stack" style={{ alignItems: "center", gap: 9 }}>
        <BrandMark size={68} />
        <h1 className="h-title" style={{ fontSize: 29 }}>{t("empty.title")}</h1>
        <div className="muted" style={{ maxWidth: 560, fontSize: 14 }}>{t("empty.subtitle")}</div>
      </div>
      <div className="dropzone">
        <div className="big"><Images size={28} /></div>
        <div className="h-sub">{t("empty.drop")}</div>
        <div className="muted">{t("empty.browse")}</div>
        <Button icon={Folder} onClick={() => void chooseImages()}>{t("action.chooseImages")}</Button>
      </div>
      <div className="steps">
        {step(1, t("step.add.title"), t("step.add.text"))}
        {step(2, t("step.choose.title"), t("step.choose.text"))}
        {step(3, t("step.export.title"), t("step.export.text"))}
      </div>
    </div>
  );
}

// MARK: Shared tool pieces

export function SelectedImageCard({ item, extra }: { item: FileItem; extra?: string | null }) {
  return (
    <Card tight>
      <div className="row" style={{ gap: 14 }}>
        <div className="thumb" style={{ width: 84, height: 84, borderRadius: 10 }}>{item.thumb ? <img src={item.thumb} alt="" style={{ objectFit: "contain" }} /> : null}</div>
        <div className="grow stack" style={{ gap: 6 }}>
          <div className="truncate selectable" style={{ fontSize: 14, fontWeight: 600 }}>{item.name}</div>
          {item.info && (
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <Chip text={item.info.format?.toUpperCase() ?? item.name.split(".").pop()?.toUpperCase() ?? ""} />
              <Chip text={`${item.info.width} × ${item.info.height}`} />
              <Chip text={byteString(item.info.file_size)} />
              {item.info.has_alpha && <Chip text={t("chip.transparency")} tone="warning" />}
            </div>
          )}
          {extra && <div className="muted" style={{ fontSize: 13 }}>{extra}</div>}
        </div>
      </div>
    </Card>
  );
}

/** Lets the user run the tool on every image or only the selected one. */
export function ScopeRow() {
  const files = useApp((s) => s.files);
  const applyToAll = useApp((s) => s.applyToAll);
  const setApplyToAll = useApp((s) => s.setApplyToAll);
  const readable = files.filter((f) => f.info).length;
  const skipped = files.length - readable;
  return (
    <div className="stack" style={{ gap: 4 }}>
      {readable > 1 && (
        <label className="row" style={{ gap: 10 }}>
          <Switch checked={applyToAll} onChange={setApplyToAll} label={t("scope.all", readable)} />
          <span>{t("scope.all", readable)}</span>
        </label>
      )}
      {skipped > 0 && <div className="caption row" style={{ color: "var(--warning)", gap: 6 }}><AlertTriangle size={13} />{t("scope.skipped", skipped)}</div>}
    </div>
  );
}

/** Shown when any selected image carries Content Credentials, because a new file will not. */
export function ProvenanceNotice() {
  const n = useApp((s) => s.toolTargets().filter((f) => f.analysis?.has_provenance).length);
  return n > 0 ? <NoticeCard text={t("notice.provenance", n)} icon={AlertTriangle} tone="warning" /> : null;
}

/** Primary export button plus live progress and the result summary. */
export function ExportSection({ tool, title, onRun, prominent = true, showsBatch = true }: {
  tool: Tool; title: string; onRun: () => void; prominent?: boolean; showsBatch?: boolean;
}) {
  const targets = useApp((s) => s.toolTargets().length);
  const running = useApp((s) => s.isBatchRunning());
  const batch = useApp((s) => s.batch);
  const Icon = TOOL_ICONS[tool];
  const disabled = targets === 0 || running;
  useEffect(() => {
    if (!prominent) return;
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !disabled) { e.preventDefault(); onRun(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [prominent, disabled, onRun]);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        <Button variant={prominent ? "primary" : "secondary"} icon={prominent ? Icon : undefined} disabled={disabled} onClick={onRun}>{title}</Button>
      </div>
      <div className="caption row" style={{ gap: 6 }}><ShieldCheck size={13} />{t("export.hint")}</div>
      {showsBatch && batch && batch.tool === tool && <BatchView batch={batch} />}
    </div>
  );
}

export function BatchView({ batch }: { batch: BatchState }) {
  const cancel = useApp((s) => s.cancelBatch);
  const dismiss = useApp((s) => s.dismissBatch);
  const ok = batch.results.filter((r) => r.output && !r.error);
  const failed = batch.results.filter((r) => !r.output || r.error);
  const clean = failed.length === 0 && !batch.cancelled;
  const firstOut = ok[0]?.output;
  return (
    <Card>
      <div className="stack">
        {!batch.finished ? (
          <>
            <ProgressBar value={batch.results.length} total={batch.total} />
            <div className="row">
              <span className="truncate grow">{t("batch.progress", Math.min(batch.results.length + 1, batch.total), batch.total, batch.current)}</span>
              <Button variant="secondary" onClick={cancel}>{t("common.cancel")}</Button>
            </div>
          </>
        ) : (
          <>
            <div className="stack" style={{ gap: 4 }}>
              <div className="row h-sub" style={{ color: clean ? "var(--success)" : "var(--warning)", gap: 8 }}>
                {clean ? <ShieldCheck size={18} /> : <AlertTriangle size={18} />}
                {batch.cancelled ? t("batch.cancelled", ok.length, batch.total) : t("batch.done", ok.length, batch.total)}
              </div>
              {ok.length > 0 && batch.tool === "compress" && (() => {
                const before = ok.reduce((a, r) => a + r.before_bytes, 0);
                const after = ok.reduce((a, r) => a + r.after_bytes, 0);
                return <div className="muted">{t("batch.savedTotal", byteString(before), byteString(after), percentSaved(before, after))}</div>;
              })()}
              {failed.length > 0 && <div style={{ color: "var(--danger)" }}>{t("batch.failedCount", failed.length)}</div>}
            </div>
            {batch.results.map((r, i) => <ResultRow key={i} r={r} />)}
            <div className="row">
              {firstOut && <Button variant="secondary" icon={Folder} onClick={() => void revealItemInDir(firstOut)}>{t("action.openFolder")}</Button>}
              <Button variant="secondary" onClick={dismiss}>{t("common.done")}</Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function ResultRow({ r }: { r: BatchResult }) {
  const okRow = !!r.output && !r.error;
  const outName = r.output?.split(/[\\/]/).pop();
  return (
    <div className="stack" style={{ gap: 2 }}>
      <div className="row" style={{ gap: 8 }}>
        {okRow ? <CheckCircle2 size={16} color="var(--success)" /> : <XCircle size={16} color="var(--danger)" />}
        <span className="truncate grow selectable">{okRow ? outName : r.input_name}</span>
        {okRow && (
          <>
            <span className="caption">{`${r.format_name} · ${r.width}×${r.height} · ${byteString(r.before_bytes)} → ${byteString(r.after_bytes)}`}</span>
            <button type="button" className="icon-btn bare" title={t("action.showInFinder")} aria-label={t("action.showInFinder")} onClick={() => r.output && void revealItemInDir(r.output)}><FolderSearch size={15} /></button>
          </>
        )}
      </div>
      {okRow && r.verified && (
        <div className="row caption" style={{ gap: 12, paddingLeft: 24, color: "var(--success)" }}>
          <span className="row" style={{ gap: 4 }}><ShieldCheck size={12} />{t("verify.opens")}</span>
          {r.metadata_clean !== null && (
            <span className="row" style={{ gap: 4, color: r.metadata_clean ? "var(--success)" : "var(--warning)" }}>
              {r.metadata_clean ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
              {t(r.metadata_clean ? "verify.metadata.clean" : "verify.metadata.found")}
            </span>
          )}
        </div>
      )}
      {r.error && <div className="caption" style={{ color: "var(--danger)", paddingLeft: 24 }}>{errorText(r.error)}</div>}
      {r.notes.map((n, i) => <div key={i} className="caption" style={{ color: "var(--warning)", paddingLeft: 24 }}>{noteText(n)}</div>)}
    </div>
  );
}

// MARK: Settings

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { lang, setLang, appearance, setAppearance, caps } = useApp();
  const openFeedback = useServices((st) => st.openFeedback);
  return (
    <Modal onClose={onClose} width={560}>
      <div className="pad stack" style={{ gap: 18 }}>
        <div className="row"><h2 className="h-title" style={{ fontSize: 20 }}>{t("nav.settings")}</h2><div className="spacer" /><Button variant="secondary" onClick={onClose}>{t("common.close")}</Button></div>
        <div className="stack">
          <div className="h-sub">{t("settings.language")}</div>
          <Segmented value={lang} options={LANGUAGES.map((l) => ({ value: l.code, label: l.nativeName }))} onChange={setLang} />
          <div className="caption">{t("settings.language.note")}</div>
        </div>
        <hr className="divider" />
        <div className="stack">
          <div className="h-sub">{t("settings.appearance")}</div>
          <Segmented value={appearance} options={(["system", "light", "dark"] as const).map((a) => ({ value: a, label: t(`appearance.${a}`) }))} onChange={setAppearance} />
        </div>
        <hr className="divider" />
        <div className="stack">
          <BrandLogo height={44} />
          <div className="caption">{t("brand.tagline")}</div>
          <div className="h-sub">{t("settings.privacy.title")}</div>
          <div className="muted">{t("settings.privacy.body")}</div>
        </div>
        <hr className="divider" />
        <ServiceSettings />
        <div className="row">
          <div className="caption grow">{t("settings.version", caps?.version ?? "dev")}</div>
          <Button variant="secondary" onClick={() => { onClose(); openFeedback(); }}>{t("settings.feedback")}</Button>
        </div>
      </div>
    </Modal>
  );
}

function ServiceSettings() {
  const { checkUpdates, setCheckUpdates, shareUsage, setShareUsage, pending } = useServices();
  // The next weekly report, in words — so people can see exactly what would be sent.
  const tools = Object.entries(pending).filter(([k]) => k.startsWith("tool.")).sort((a, b) => b[1] - a[1])
    .filter(([k]) => (TOOLS as string[]).includes(k.slice(5))).map(([k, v]) => `${t(`tool.${k.slice(5)}`)} ${v}`);
  const pendingText = [t("settings.usage.opens", pending.opens ?? 0), t("settings.usage.saved", pending.saved ?? 0), ...tools].join(" · ");
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="stack" style={{ gap: 4 }}>
        <label className="settings-toggle"><span className="grow" style={{ fontWeight: 500 }}>{t("settings.updates.toggle")}</span><Switch checked={checkUpdates} onChange={setCheckUpdates} label={t("settings.updates.toggle")} /></label>
        <div className="caption">{t("settings.updates.note")}</div>
      </div>
      <div className="stack" style={{ gap: 4 }}>
        <label className="settings-toggle"><span className="grow" style={{ fontWeight: 500 }}>{t("settings.usage.toggle")}</span><Switch checked={shareUsage} onChange={setShareUsage} label={t("settings.usage.toggle")} /></label>
        <div className="caption">{t("settings.usage.note")}</div>
        {shareUsage && <div className="caption">{t("settings.usage.pending", pendingText)}</div>}
      </div>
    </div>
  );
}

export { runTitle, Spinner, toneColor, Callout };

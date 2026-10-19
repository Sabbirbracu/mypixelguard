// Redact & Share Safely: the image on the left, everything you can change on the right.
// Faces and sensitive text are found automatically; you review them, pick a style, then export. Mirrors RedactView.swift.
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Eye, EyeOff, Grid3x3, Info, Layers, Lightbulb, MoreHorizontal, ScanLine, ShieldCheck, SquareDashed, Trash2, Minus, Plus } from "lucide-react";
import { api } from "../api";
import { errorText, t } from "../i18n";
import { useApp } from "../store";
import { BatchView } from "../components/shell";
import { Button, Disclosure, FormatSelect, MenuButton, Slider, Spinner, SuffixField, Switch, Tip, ToolFooter, isLossy, useRunShortcut } from "../components/ui";
import type { OutputFormat, SensitiveRegion } from "../types";

const STRENGTH: [number, number] = [8, 60];
const level = (v: number) => (v < 20 ? "light" : v < 34 ? "medium" : v < 48 ? "strong" : "maximum");
const labelOf = (r: SensitiveRegion) => (r.label.startsWith("t:") ? t(r.label.slice(2)) : r.label);

export default function RedactView() {
  const item = useApp((s) => s.selected());
  if (!item) return <div className="muted" style={{ flex: 1, display: "grid", placeItems: "center" }}>{t("detail.selectImage")}</div>;
  return <RedactBody key={item.id} />;
}

function RedactBody() {
  const item = useApp((s) => s.selected())!;
  const settings = useApp((s) => s.redact);
  const patch = useApp((s) => s.patch);
  const caps = useApp((s) => s.caps);
  const batch = useApp((s) => s.batch);
  const running = useApp((s) => s.isBatchRunning());
  const startBatch = useApp((s) => s.startBatch);

  const [regions, setRegions] = useState<SensitiveRegion[]>([]);
  const [focused, setFocused] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [notes, setNotes] = useState<{ ocr: boolean; faces: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [base, setBase] = useState<{ image: string; width: number; height: number } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [more, setMore] = useState(false);
  const [drawMode, setDrawMode] = useState(true);
  const [outlines, setOutlines] = useState(true);
  const [zoom, setZoom] = useState<number | null>(null);
  const selectedCount = regions.filter((r) => r.isSelected).length;
  const path = item.path;

  const scan = async () => {
    setScanning(true); setError(null);
    try {
      const report = await api.redactScan(path);
      // Keep anything the user drew by hand.
      setRegions((cur) => {
        const next = [...cur.filter((r) => r.kind === "manual"), ...report.regions];
        setFocused(next[0]?.id ?? null);
        return next;
      });
      setNotes({ ocr: report.textAvailable, faces: report.facesAvailable });
      setShowOriginal(false);
    } catch (e) { setError(errorText(e)); }
    setHasScanned(true); setScanning(false);
  };

  // Load a screen-sized copy, then look for faces and text straight away.
  useEffect(() => {
    let dead = false;
    api.redactBase(path).then((b) => { if (!dead) { setBase(b); void scan(); } }).catch((e) => !dead && setError(errorText(e)));
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // Re-draw the live preview with the exact style and strength used for export.
  const key = useMemo(() => JSON.stringify([regions, settings.style, settings.strength]), [regions, settings.style, settings.strength]);
  useEffect(() => {
    let dead = false;
    if (!base || selectedCount === 0) { setPreview(null); setRendering(false); return; }
    const timer = window.setTimeout(async () => {
      setRendering(true);
      try {
        const img = await api.redactPreview(path, regions, settings);
        if (!dead) setPreview(img);
      } catch { /* keep the last preview */ }
      if (!dead) setRendering(false);
    }, 80);
    return () => { dead = true; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, path, base]);

  // MARK: Canvas geometry
  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const iw = base?.width ?? 4, ih = base?.height ?? 3;
  const fit = Math.max(Math.min(box.w / iw, box.h / ih), 0.0001);
  const unit = (item.analysis?.width ?? iw) / iw; // original pixels per preview pixel
  const scale = zoom != null ? (unit * zoom) / 100 : fit;
  const content = { w: Math.max(iw * scale, box.w), h: Math.max(ih * scale, box.h) };
  const fitted = { x: (content.w - iw * scale) / 2, y: (content.h - ih * scale) / 2, w: iw * scale, h: ih * scale };
  const percent = zoom ?? (fit / unit) * 100;

  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const local = (e: React.PointerEvent) => {
    const r = contentRef.current!.getBoundingClientRect();
    return { x: Math.min(Math.max(e.clientX - r.left, fitted.x), fitted.x + fitted.w), y: Math.min(Math.max(e.clientY - r.top, fitted.y), fitted.y + fitted.h) };
  };
  const onDown = (e: React.PointerEvent) => { if (!drawMode || e.button !== 0) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const p = local(e); setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); };
  const onMove = (e: React.PointerEvent) => { if (drag) { const p = local(e); setDrag({ ...drag, x1: p.x, y1: p.y }); } };
  const onUp = () => {
    if (drag) {
      const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1), w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0);
      if (w > 8 && h > 8) {
        const id = `manual-${Date.now()}`;
        setRegions((r) => [...r, { id, kind: "manual", rect: { x: (x - fitted.x) / fitted.w, y: (y - fitted.y) / fitted.h, w: w / fitted.w, h: h / fitted.h }, label: "t:visual.kind.manual", confidence: 1, isSelected: true }]);
        setFocused(id);
        setShowOriginal(false);
      }
    }
    setDrag(null);
  };
  const toggle = (id: string) => setRegions((rs) => rs.map((r) => (r.id === id ? { ...r, isSelected: !r.isSelected } : r)));
  const removeRegion = (id: string) => { setRegions((rs) => rs.filter((r) => r.id !== id)); if (focused === id) setFocused(null); };

  const canCompare = selectedCount > 0 && preview != null;
  const showingOriginal = showOriginal || !canCompare;
  const shown = showingOriginal ? base?.image ?? item.thumb : preview;
  const lvl = level(settings.strength);
  const hasText = regions.some((r) => r.isSelected && r.kind !== "face" && r.kind !== "manual");
  const detail = settings.style === "solid" ? t("redact.cover.solid") : `${t(`redact.style.${settings.style}`)} · ${t(`redact.strength.${lvl}`)}`;
  const summary = selectedCount === 0 ? t("redact.summary.none") : `${t(selectedCount === 1 ? "redact.summary.region.one" : "redact.summary.region.many", selectedCount)} · ${detail}`;
  const format: OutputFormat = settings.format ?? item.info?.format ?? "jpeg";
  const formats = (["jpeg", "png", "tiff", "webp"] as OutputFormat[]).filter((f) => caps?.formats.includes(f) ?? true);
  const run = () => void startBatch("redact", settings, { targets: [item], extra: { regions } });
  useRunShortcut(run, selectedCount > 0 && !running);

  return (
    <>
      <div className="tool-split">
        <div className="redact-col">
          <div className="row" style={{ gap: 10 }}>
            <div className="view-toggle">
              <button type="button" aria-pressed={showingOriginal} onClick={() => setShowOriginal(true)}><Eye size={15} />{t("redact.view.original")}</button>
              <button type="button" aria-pressed={!showingOriginal} disabled={!canCompare} onClick={() => setShowOriginal(false)}><EyeOff size={15} />{t("redact.view.preview")}</button>
            </div>
            <div className="spacer" />
            {rendering && <span className="caption row" style={{ gap: 6 }}><Spinner small />{t("redact.preview.updating")}</span>}
            <button type="button" className="tb-btn" aria-pressed={drawMode} title={t("redact.draw.help")} onClick={() => setDrawMode((v) => !v)}><SquareDashed size={15} />{t("redact.draw")}</button>
            <button type="button" className="tb-btn icon" aria-pressed={outlines} title={t("redact.outlines")} aria-label={t("redact.outlines")} onClick={() => setOutlines((v) => !v)}><Layers size={15} /></button>
          </div>

          <div className={`redact-canvas ${zoom != null ? "zoomed" : ""}`} ref={boxRef}>
            <div ref={contentRef} className={`content ${drawMode ? "draw" : ""}`} style={{ width: content.w, height: content.h }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}>
              {shown ? <img className="shot" src={shown} alt="" draggable={false} style={{ left: fitted.x, top: fitted.y, width: fitted.w, height: fitted.h }} />
                : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><Spinner /></div>}
              {outlines && regions.map((r, i) => {
                const accent = r.isSelected && (focused === r.id || showingOriginal);
                return (
                  <div key={r.id} className={`rbox ${r.isSelected ? "" : "off"} ${accent ? "accent" : ""} ${focused === r.id ? "focused" : ""} ${r.isSelected && showingOriginal ? "fill" : ""}`}
                    title={t("redact.box.review")}
                    style={{ left: fitted.x + r.rect.x * fitted.w, top: fitted.y + r.rect.y * fitted.h, width: r.rect.w * fitted.w, height: r.rect.h * fitted.h }}
                    onPointerDown={(e) => e.stopPropagation()} onClick={() => setFocused(r.id)}>
                    <span className="n">{i + 1}</span>
                  </div>
                );
              })}
              {drag && <div className="drag-rect" style={{ left: Math.min(drag.x0, drag.x1), top: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) }} />}
            </div>
          </div>

          <div className="canvas-bar">
            <Info size={15} color="var(--secondary)" style={{ flex: "none" }} />
            <span className="muted grow">{drawMode ? t("redact.canvas.hint.draw") : t("redact.canvas.hint.select")}</span>
            <MenuButton label={zoom == null ? t("inspect.zoom.fitShort") : t("inspect.zoom.custom")}
              items={[{ label: t("inspect.zoom.fit"), onSelect: () => setZoom(null) }, ...[25, 50, 100, 200].map((v) => ({ label: `${v}%`, onSelect: () => setZoom(v) }))]} />
            <div className="zoom-pill">
              <button type="button" aria-label="−" onClick={() => setZoom(Math.max(5, percent / 1.25))}><Minus size={12} strokeWidth={3} /></button>
              <span>{Math.round(percent)}%</span>
              <button type="button" aria-label="+" onClick={() => setZoom(Math.min(800, percent * 1.25))}><Plus size={12} strokeWidth={3} /></button>
            </div>
          </div>
        </div>

        <aside className="side-panel">
          {batch?.tool === "redact" && <BatchView batch={batch} />}

          <div className="row top" style={{ gap: 12 }}>
            <div className="grow stack" style={{ gap: 6 }}>
              <h3 className="title3">{t("redact.detection.title")}</h3>
              {error ? <div className="row" style={{ gap: 6, color: "var(--danger)" }}><AlertTriangle size={14} />{error}</div> : (
                <div className="row muted" style={{ gap: 7 }}><span className="status-dot" style={{ background: scanning ? "var(--warning)" : "var(--success)" }} />{scanning ? t("redact.detection.scanning") : t("redact.detection.status")}</div>
              )}
              {notes && !notes.ocr && <div className="caption">{t("visual.noOCR")}</div>}
              {notes && !notes.faces && <div className="caption">{t("visual.noFaces")}</div>}
            </div>
            <Button variant="secondary" disabled={scanning || !base} onClick={() => void scan()}>{scanning ? <Spinner small /> : <ScanLine size={15} />}{t("redact.rescan")}</Button>
          </div>
          <hr className="divider" />

          <div className="section" style={{ gap: 12 }}>
            <div className="row" style={{ gap: 8 }}>
              <h3 className="title3">{t("redact.regions.title")}</h3>
              <span className="tag" style={{ ["--tag" as string]: "var(--ink)" }}>{regions.length}</span>
              <div className="spacer" />
              <span className="muted">{t("redact.regions.included", selectedCount, regions.length)}</span>
            </div>
            {regions.length === 0 ? (
              <div className="stack" style={{ gap: 8, padding: 14, borderRadius: 12, background: "var(--canvas)", border: "1px solid var(--border)" }}>
                {hasScanned ? <ShieldCheck size={22} color="var(--success)" /> : <SquareDashed size={22} color="var(--secondary)" />}
                <span className="muted">{hasScanned ? t("redact.regions.none") : t("redact.regions.empty")}</span>
              </div>
            ) : (
              <>
                <div className="row" style={{ gap: 14, justifyContent: "flex-end" }}>
                  <button type="button" className="link-btn" disabled={selectedCount === regions.length} onClick={() => setRegions((rs) => rs.map((r) => ({ ...r, isSelected: true })))}>{t("redact.selectAll")}</button>
                  <button type="button" className="link-btn" disabled={selectedCount === 0} onClick={() => setRegions((rs) => rs.map((r) => ({ ...r, isSelected: false })))}>{t("redact.skipAll")}</button>
                  <RegionMenu onRemoveAll={() => { setRegions([]); setFocused(null); }} />
                </div>
                <div className="stack" style={{ gap: 8 }}>
                  {regions.map((r, i) => {
                    const kindTitle = t(`visual.kind.${r.kind}`);
                    const isFocused = focused === r.id;
                    const subtitle = r.kind === "manual" ? t("redact.region.drawn") : labelOf(r) !== kindTitle ? labelOf(r) : t("redact.region.detected");
                    return (
                      <div key={r.id} className={`region-card ${isFocused ? "focused" : ""} ${r.isSelected ? "" : "skipped"}`} onClick={() => setFocused(r.id)}>
                        <button type="button" role="checkbox" className="check-box" aria-checked={r.isSelected} aria-label={kindTitle} title={r.isSelected ? t("redact.box.skip") : t("redact.box.include")}
                          onClick={(e) => { e.stopPropagation(); toggle(r.id); }}>{r.isSelected && <Check size={13} strokeWidth={4} />}</button>
                        <span className={`num-circle ${isFocused && r.isSelected ? "on" : ""}`}>{i + 1}</span>
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className="truncate" style={{ fontWeight: 600 }}>{kindTitle}</div>
                          <div className="caption truncate">{subtitle}</div>
                        </div>
                        <button type="button" className="icon-btn bare" title={t("redact.region.delete")} aria-label={t("redact.region.delete")} onClick={(e) => { e.stopPropagation(); removeRegion(r.id); }}><Trash2 size={15} /></button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <hr className="divider" />

          <div className="section" style={{ gap: 12 }}>
            <h3 className="title3">{t("redact.style.title")}</h3>
            <div className="seg-box">
              {(["blur", "pixelate", "solid"] as const).map((st) => <button key={st} type="button" aria-pressed={settings.style === st} onClick={() => patch("redact", { style: st })}>{t(`redact.style.${st}`)}</button>)}
            </div>
            <div><div>{t(`redact.style.${settings.style}.about`)}</div><div className="caption">{t("redact.applies")}</div></div>
            {settings.style !== "solid" && (
              <>
                <div className="stack" style={{ gap: 6 }}>
                  <div className="row"><b className="grow" style={{ fontWeight: 600 }}>{t("redact.strength")}</b><b style={{ color: "var(--accent-text)" }}>{t(`redact.strength.${lvl}`)}</b></div>
                  <Slider value={settings.strength} min={STRENGTH[0]} max={STRENGTH[1]} step={1} onChange={(strength) => patch("redact", { strength })} label={t("redact.strength")} />
                  <div className="range-labels"><span>{t("redact.strength.light")}</span><span>{t("redact.strength.maximum")}</span></div>
                </div>
                {lvl === "light" ? <Tip text={t("redact.tip.weak")} icon={AlertTriangle} tone="var(--warning)" /> : hasText ? <Tip text={t("redact.tip.solid")} icon={Lightbulb} tone="var(--info)" /> : null}
              </>
            )}
          </div>
          <hr className="divider" />

          <div className="section" style={{ gap: 14 }}>
            <h3 className="title3">{t("redact.export.title")}</h3>
            <div className="toggle-row">
              <div className="grow"><div style={{ fontWeight: 600 }}>{t("redact.metadata.title")}</div><div className="caption">{t("redact.metadata.hint")}</div></div>
              <Switch checked={settings.cleanMetadata} onChange={(cleanMetadata) => patch("redact", { cleanMetadata })} label={t("redact.metadata.title")} />
            </div>
            <Disclosure title={t("redact.moreOptions")} open={more} onToggle={() => setMore((v) => !v)} />
            {more && (
              <div className="stack" style={{ gap: 14 }}>
                <div className="stack" style={{ gap: 5 }}><span className="field-label">{t("setting.outputFormat")}</span><FormatSelect value={settings.format} formats={formats} onChange={(f) => patch("redact", { format: f })} /></div>
                <div className="stack" style={{ gap: 5 }}>
                  <span className="field-label">{t("setting.quality")}</span>
                  <div className="row"><Slider value={settings.quality} min={0.05} max={1} disabled={!isLossy(format)} onChange={(quality) => patch("redact", { quality })} label={t("setting.quality")} /><span className="tnum" style={{ width: 40, textAlign: "right", color: isLossy(format) ? undefined : "var(--secondary)" }}>{Math.round(settings.quality * 100)}%</span></div>
                  {!isLossy(format) && <span className="caption">{t("setting.quality.lossless")}</span>}
                </div>
                <div className="stack" style={{ gap: 5 }}><span className="field-label">{t("setting.suffix")}</span><SuffixField suffix={settings.suffix} onChange={(suffix) => patch("redact", { suffix })} example={`photo${settings.suffix}.jpg`} /></div>
              </div>
            )}
          </div>
          <div className="muted row top" style={{ gap: 8 }}><Info size={14} style={{ flex: "none", marginTop: 3 }} />{t("redact.detectionNote")}</div>
        </aside>
      </div>
      <ToolFooter untouched={t("inspect.footer.untouched")} summaryIcon={Grid3x3} summary={summary} busy={running}>
        <Button icon={EyeOff} disabled={selectedCount === 0 || running} onClick={run}>{t("redact.run")}</Button>
      </ToolFooter>
    </>
  );
}

function RegionMenu({ onRemoveAll }: { onRemoveAll: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button type="button" className="icon-btn bare" aria-label={t("workspace.more")} onClick={() => setOpen((v) => !v)}><MoreHorizontal size={16} /></button>
      {open && (
        <div className="menu" style={{ top: 24, right: 0 }} onMouseLeave={() => setOpen(false)}>
          <button type="button" style={{ color: "var(--danger)" }} onClick={() => { setOpen(false); onRemoveAll(); }}><Trash2 size={15} />{t("redact.removeAll")}</button>
        </div>
      )}
    </div>
  );
}

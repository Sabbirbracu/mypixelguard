import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, EyeOff, Grid3x3, Hand, Lightbulb, ListOrdered, Info, Lock, Droplet, Square, Brush, Scan, Send, Trash2, UserCheck, type LucideIcon } from "lucide-react";
import { api } from "../api";
import { errorText, t } from "../i18n";
import { useApp } from "../store";
import { ActionFooter, Button, Card, CardHeader, Chip, NoticeCard, QualityRow, Select, SettingRow, Slider, Spinner, Switch, SuffixField, ToolHeader } from "../components/ui";
import { BatchView, Page } from "../components/shell";
import type { OutputFormat, RegionKind, SensitiveRegion } from "../types";

const KIND_ICON: Record<RegionKind, LucideIcon> = { face: UserCheck, email: Send, phone: Send, address: Info, identifier: Info, licensePlate: Info, manual: Square };
const STRENGTH: [number, number] = [8, 60];
const level = (v: number) => (v < 20 ? "light" : v < 34 ? "medium" : v < 48 ? "strong" : "maximum");
const labelOf = (r: SensitiveRegion) => (r.label.startsWith("t:") ? t(r.label.slice(2)) : r.label);

export default function RedactView() {
  const item = useApp((s) => s.selected());
  const settings = useApp((s) => s.redact);
  const patch = useApp((s) => s.patch);
  const caps = useApp((s) => s.caps);
  const batch = useApp((s) => s.batch);
  const running = useApp((s) => s.isBatchRunning());
  const startBatch = useApp((s) => s.startBatch);

  const [regions, setRegions] = useState<SensitiveRegion[]>([]);
  const [scanning, setScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [notes, setNotes] = useState<{ ocr: boolean; faces: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [base, setBase] = useState<{ image: string; width: number; height: number } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [more, setMore] = useState(false);
  const selectedCount = regions.filter((r) => r.isSelected).length;
  const path = item?.path;

  // Load a screen-sized copy whenever the image changes.
  useEffect(() => {
    let dead = false;
    setRegions([]); setError(null); setHasScanned(false); setPreview(null); setBase(null); setShowOriginal(false); setNotes(null);
    if (path) api.redactBase(path).then((b) => !dead && setBase(b)).catch((e) => !dead && setError(errorText(e)));
    return () => { dead = true; };
  }, [path]);

  // Re-draw the live preview with the exact style and strength used for export.
  const key = useMemo(() => JSON.stringify([regions, settings.style, settings.strength]), [regions, settings.style, settings.strength]);
  useEffect(() => {
    let dead = false;
    if (!path || !base || selectedCount === 0) { setPreview(null); setRendering(false); return; }
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

  const scan = async () => {
    if (!path) return;
    setScanning(true); setError(null);
    try {
      const report = await api.redactScan(path);
      setRegions((cur) => [...cur.filter((r) => r.kind === "manual"), ...report.regions]);
      setNotes({ ocr: report.textAvailable, faces: report.facesAvailable });
      setShowOriginal(false);
    } catch (e) { setError(errorText(e)); }
    setHasScanned(true); setScanning(false);
  };

  // MARK: canvas geometry
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [base]);
  const ratio = base ? base.width / base.height : 4 / 3;
  const fit = box.w / Math.max(box.h, 1) > ratio ? { h: box.h, w: box.h * ratio } : { w: box.w, h: box.w / ratio };
  const fitted = { x: (box.w - fit.w) / 2, y: (box.h - fit.h) / 2, w: fit.w, h: fit.h };

  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const local = (e: React.PointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: Math.min(Math.max(e.clientX - r.left, fitted.x), fitted.x + fitted.w), y: Math.min(Math.max(e.clientY - r.top, fitted.y), fitted.y + fitted.h) };
  };
  const onDown = (e: React.PointerEvent) => { if (e.button !== 0) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const p = local(e); setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); };
  const onMove = (e: React.PointerEvent) => { if (drag) { const p = local(e); setDrag({ ...drag, x1: p.x, y1: p.y }); } };
  const onUp = () => {
    if (drag) {
      const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1), w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0);
      if (w > 8 && h > 8) {
        setRegions((r) => [...r, { id: `manual-${Date.now()}`, kind: "manual", rect: { x: (x - fitted.x) / fitted.w, y: (y - fitted.y) / fitted.h, w: w / fitted.w, h: h / fitted.h }, label: `t:visual.kind.manual`, confidence: 1, isSelected: true }]);
        setShowOriginal(false);
      }
    }
    setDrag(null);
  };
  const toggle = (id: string) => setRegions((rs) => rs.map((r) => (r.id === id ? { ...r, isSelected: !r.isSelected } : r)));

  if (!item) return <div className="muted" style={{ flex: 1, display: "grid", placeItems: "center" }}>{t("detail.selectImage")}</div>;

  const canCompare = selectedCount > 0 && preview != null;
  const shown = !showOriginal && canCompare ? preview : base?.image ?? item.thumb;
  const showsFill = showOriginal || preview == null;
  const faces = regions.filter((r) => r.kind === "face").length;
  const text = regions.filter((r) => r.kind !== "face" && r.kind !== "manual").length;
  const manual = regions.filter((r) => r.kind === "manual").length;
  const lvl = level(settings.strength);
  const hasText = regions.some((r) => r.isSelected && r.kind !== "face" && r.kind !== "manual");
  const styleName = settings.style === "solid" ? t("redact.style.solid") : `${t(`redact.style.${settings.style}`)} · ${t(`redact.strength.${lvl}`)}`;
  const summary = selectedCount === 0 ? t("redact.summary.none") : `${t(selectedCount === 1 ? "redact.summary.one" : "redact.summary.many", selectedCount)} · ${styleName}`;
  const format = settings.format ?? item.info?.format ?? "jpeg";
  const styleTile = (style: "blur" | "pixelate" | "solid", Icon: LucideIcon) => (
    <button key={style} type="button" className="style-tile" aria-pressed={settings.style === style} onClick={() => patch("redact", { style })}>
      <div className="row">
        <div className="opt-ico" style={{ ["--c" as string]: settings.style === style ? "var(--accent-text)" : "var(--secondary)" }}><Icon size={16} /></div>
        <div className="spacer" />
        {settings.style === style ? <CheckCircle2 size={18} color="var(--accent-text)" /> : <span style={{ width: 18, height: 18, borderRadius: "50%", border: "1.5px solid var(--secondary)", opacity: 0.6 }} />}
      </div>
      <div><div style={{ fontWeight: 600 }}>{t(`redact.style.${style}`)}</div><div className="caption">{t(`redact.style.${style}.about`)}</div></div>
    </button>
  );

  return (
    <>
      <Page>
        <ToolHeader title={t("redact.title")} subtitle={t("redact.subtitle")} />
        {batch?.tool === "redact" && <BatchView batch={batch} />}

        <Card>
          <div className="stack" style={{ gap: 14 }}>
            <CardHeader icon={Scan} title={t("redact.step.find")} subtitle={t("redact.step.find.sub")}>
              <Button disabled={scanning} onClick={() => void scan()}>{scanning ? <><Spinner small />{t("visual.scan.scanning")}</> : hasScanned ? t("visual.scan.again") : t("redact.scan")}</Button>
            </CardHeader>
            {hasScanned && regions.length === 0 && !error && <div className="row" style={{ color: "var(--success)", gap: 8 }}><CheckCircle2 size={16} />{t("visual.scan.none")}</div>}
            {regions.length > 0 && (
              <div className="row" style={{ gap: 8 }}>
                {faces > 0 && <Chip text={t("visual.scan.faces", faces)} tone="warning" />}
                {text > 0 && <Chip text={t("visual.scan.text", text)} tone="warning" />}
                {manual > 0 && <Chip text={t("redact.manualCount", manual)} tone="info" />}
              </div>
            )}
            {notes && !notes.ocr && <div className="caption row" style={{ gap: 6 }}><Info size={12} />{t("visual.noOCR")}</div>}
            {notes && !notes.faces && <div className="caption row" style={{ gap: 6 }}><Info size={12} />{t("visual.noFaces")}</div>}
            {error && <div className="row" style={{ color: "var(--danger)", gap: 8 }}><AlertTriangle size={15} />{error}</div>}
            <div className="caption row" style={{ gap: 6 }}><Lock size={12} />{t("visual.scan.local")}</div>
          </div>
        </Card>

        <Card>
          <div className="stack" style={{ gap: 12 }}>
            <div className="row">
              <div className="segmented">
                <button type="button" aria-pressed={!showOriginal} disabled={!canCompare} onClick={() => setShowOriginal(false)}>{t("redact.view.preview")}</button>
                <button type="button" aria-pressed={showOriginal} disabled={!canCompare} onClick={() => setShowOriginal(true)}>{t("redact.view.original")}</button>
              </div>
              <div className="spacer" />
              {rendering && <div className="caption row" style={{ gap: 6 }}><Spinner small />{t("redact.preview.updating")}</div>}
            </div>
            <div className="canvas" ref={boxRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}>
              {shown && <div className="img-box" style={{ left: fitted.x, top: fitted.y, width: fitted.w, height: fitted.h }}><img src={shown} alt="" draggable={false} /></div>}
              {regions.map((r, i) => (
                <div key={r.id} className={`region ${r.isSelected ? (showsFill ? "fill" : "") : "off"}`} title={r.isSelected ? t("redact.box.skip") : t("redact.box.include")}
                  style={{ left: fitted.x + r.rect.x * fitted.w, top: fitted.y + r.rect.y * fitted.h, width: r.rect.w * fitted.w, height: r.rect.h * fitted.h }}
                  onPointerDown={(e) => e.stopPropagation()} onClick={() => toggle(r.id)}>
                  <span className="num">{i + 1}</span>
                </div>
              ))}
              {drag && <div className="drag-rect" style={{ left: Math.min(drag.x0, drag.x1), top: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) }} />}
            </div>
            <div className="caption row" style={{ gap: 6 }}><Hand size={12} />{regions.length === 0 ? t("redact.canvas.empty") : t("redact.canvas.hint")}</div>
          </div>
        </Card>

        {regions.length > 0 && (
          <Card>
            <div className="stack" style={{ gap: 12 }}>
              <CardHeader icon={ListOrdered} title={t("redact.regions.title")} subtitle={t("redact.regions.count", selectedCount, regions.length)}>
                <Button variant="secondary" disabled={selectedCount === regions.length} onClick={() => setRegions((rs) => rs.map((r) => ({ ...r, isSelected: true })))}>{t("redact.selectAll")}</Button>
                <Button variant="secondary" disabled={selectedCount === 0} onClick={() => setRegions((rs) => rs.map((r) => ({ ...r, isSelected: false })))}>{t("redact.skipAll")}</Button>
                <Button variant="secondary" onClick={() => setRegions([])}>{t("redact.removeAll")}</Button>
              </CardHeader>
              <div style={{ borderRadius: 12, background: "var(--canvas)", border: "1px solid var(--border)" }}>
                {regions.map((r, i) => {
                  const Icon = KIND_ICON[r.kind];
                  const kindTitle = t(`visual.kind.${r.kind}`);
                  return (
                    <div key={r.id} className="region-row" style={{ opacity: r.isSelected ? 1 : 0.65 }}>
                      <div className="num-badge" style={{ background: r.isSelected ? "var(--orange)" : "color-mix(in srgb, var(--secondary) 18%, transparent)", color: r.isSelected ? "var(--on-accent)" : "var(--secondary)" }}>{i + 1}</div>
                      <Icon size={17} color={r.isSelected ? "var(--accent-text)" : "var(--secondary)"} />
                      <div className="grow">
                        <div style={{ fontWeight: 600 }}>{kindTitle}</div>
                        <div className="caption truncate">
                          {r.kind === "manual" ? t("redact.region.manual") : <>{labelOf(r) !== kindTitle && <>{labelOf(r)} · </>}{t("redact.region.match", Math.round(r.confidence * 100))}</>}
                        </div>
                      </div>
                      {r.kind === "manual" && <button type="button" className="icon-btn bare" title={t("redact.region.delete")} aria-label={t("redact.region.delete")} onClick={() => setRegions((rs) => rs.filter((x) => x.id !== r.id))}><Trash2 size={15} /></button>}
                      <Switch checked={r.isSelected} onChange={() => toggle(r.id)} label={kindTitle} />
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        )}

        <Card>
          <div className="stack" style={{ gap: 16 }}>
            <CardHeader icon={Brush} title={t("redact.step.style")} subtitle={t("redact.step.style.sub")} />
            <div className="row" style={{ gap: 12, alignItems: "stretch" }}>{styleTile("blur", Droplet)}{styleTile("pixelate", Grid3x3)}{styleTile("solid", Square)}</div>
            {settings.style !== "solid" && (
              <>
                <div className="stack" style={{ gap: 8 }}>
                  <div className="row"><b className="grow">{t("redact.strength")}</b><b style={{ color: "var(--accent-text)" }}>{t(`redact.strength.${lvl}`)}</b><span className="muted" style={{ width: 44, textAlign: "right" }}>{Math.round(((settings.strength - STRENGTH[0]) / (STRENGTH[1] - STRENGTH[0])) * 100)}%</span></div>
                  <Slider value={settings.strength} min={STRENGTH[0]} max={STRENGTH[1]} step={1} onChange={(strength) => patch("redact", { strength })} label={t("redact.strength")} />
                  <div className="row caption"><span>{t("redact.strength.light")}</span><div className="spacer" /><span>{t("redact.strength.maximum")}</span></div>
                  <div className="caption row" style={{ gap: 6 }}><Info size={12} />{t("redact.strength.hint")}</div>
                </div>
                {lvl === "light" ? <NoticeCard text={t("redact.tip.weak")} icon={AlertTriangle} tone="warning" /> : hasText ? <NoticeCard text={t("redact.tip.solid")} icon={Lightbulb} tone="info" /> : null}
              </>
            )}
          </div>
        </Card>

        <Card>
          <div className="stack" style={{ gap: 14 }}>
            <CardHeader icon={Send} title={t("redact.step.export")} />
            <SettingRow label={t("redact.cleanMetadata")} hint={t("redact.cleanMetadata.hint")}><Switch checked={settings.cleanMetadata} onChange={(cleanMetadata) => patch("redact", { cleanMetadata })} label={t("redact.cleanMetadata")} /></SettingRow>
            <details open={more} onToggle={(e) => setMore((e.target as HTMLDetailsElement).open)}>
              <summary style={{ cursor: "pointer", fontWeight: 500 }}>{t("redact.moreOptions")}</summary>
              <div className="stack" style={{ gap: 14, paddingTop: 12 }}>
                <SettingRow label={t("setting.outputFormat")}>
                  <Select width={240} value={settings.format ?? ""} onChange={(v) => patch("redact", { format: (v || null) as OutputFormat | null })}>
                    <option value="">{t("format.same")}</option>
                    {(["jpeg", "png", "tiff", "webp"] as OutputFormat[]).filter((f) => caps?.formats.includes(f) ?? true).map((f) => <option key={f} value={f}>{f === "webp" ? "WebP" : f.toUpperCase()}</option>)}
                  </Select>
                </SettingRow>
                <QualityRow quality={settings.quality} enabled={format === "jpeg" || format === "webp"} onChange={(quality) => patch("redact", { quality })} />
                <SettingRow label={t("setting.suffix")}><SuffixField suffix={settings.suffix} onChange={(suffix) => patch("redact", { suffix })} example={`photo${settings.suffix}.jpg`} /></SettingRow>
              </div>
            </details>
          </div>
        </Card>
        <NoticeCard text={t("redact.review")} icon={UserCheck} tone="warning" />
      </Page>
      <ActionFooter summary={summary} hint={t("export.hint")}>
        {running && <Spinner small />}
        <Button variant="large" icon={EyeOff} disabled={selectedCount === 0 || running} onClick={() => void startBatch("redact", settings, { targets: [item], extra: { regions } })}>{t("redact.run")}</Button>
      </ActionFooter>
    </>
  );
}

// Resize: the original and the result drawn to the same scale on the left, the choices on the right.
// Mirrors ResizeViews.swift.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { AlertTriangle, ArrowLeftRight, Crop, Download, Hand, Images, Lock, LockOpen, Pipette, Sparkles } from "lucide-react";
import { useBeforeImage } from "../hooks";
import { exampleName, extFor, hexOf, rgbOf } from "../format";
import { runTitle, t } from "../i18n";
import { useApp, type FileItem } from "../store";
import { BatchView, ProvenanceNotice, ScopeRow } from "../components/shell";
import { Button, Card, CardHeader, Chip, ColorField, FormatSelect, Modal, Slider, StagePane, SuffixField, Switch, ToolFooter, isLossy, useRunShortcut } from "../components/ui";
import { UnavailableFormatsNote } from "./Convert";
import { barsFor, borderSamples, planResize, type Bars, type BorderSamples } from "../resizePlan";
import type { OutputFormat, ResizePlan, ResizeSettings, SizePreset } from "../types";

const STAGE_H = 380;

export default function ResizeView() {
  const selected = useApp((st) => st.selected());
  if (!selected) return <div className="muted" style={{ flex: 1, display: "grid", placeItems: "center" }}>{t("detail.selectImage")}</div>;
  if (!selected.info) return <div className="muted" style={{ flex: 1, display: "grid", placeItems: "center" }}>{t("compress.unreadable")}</div>;
  return <ResizeBody item={selected} />;
}

function ResizeBody({ item }: { item: FileItem }) {
  const s = useApp((st) => st.resize);
  const patch = useApp((st) => st.patch);
  const caps = useApp((st) => st.caps);
  const batch = useApp((st) => st.batch);
  const running = useApp((st) => st.isBatchRunning());
  const presets = useApp(useShallow((st) => st.allPresets()));
  const savePreset = useApp((st) => st.savePreset);
  const deletePreset = useApp((st) => st.deletePreset);
  const startBatch = useApp((st) => st.startBatch);
  const targets = useApp(useShallow((st) => st.toolTargets()));
  const [naming, setNaming] = useState(false);
  const [presetName, setPresetName] = useState("");
  const size: [number, number] = [item.info!.width, item.info!.height];
  const plan = planResize(size, s);
  const set = (v: Partial<ResizeSettings>) => patch("resize", v);
  const run = () => void startBatch("resize", s);
  useRunShortcut(run, targets.length > 0 && !running);

  // The preset the user picked, as long as the numbers still match it.
  const activePreset = !s.lockAspect && s.presetID ? presets.find((p) => p.id === s.presetID && p.width === s.width && p.height === s.height) : undefined;

  const setWidth = (v: number) => {
    const next: Partial<ResizeSettings> = { width: Math.max(v, 1), driver: "width", presetID: null };
    if (s.lockAspect) next.height = Math.max(Math.round((Math.max(v, 1) * size[1]) / size[0]), 1);
    set(next);
  };
  const setHeight = (v: number) => {
    const next: Partial<ResizeSettings> = { height: Math.max(v, 1), driver: "height", presetID: null };
    if (s.lockAspect) next.width = Math.max(Math.round((Math.max(v, 1) * size[0]) / size[1]), 1);
    set(next);
  };
  const toggleLock = () => {
    const lockAspect = !s.lockAspect;
    if (!lockAspect) { set({ lockAspect, presetID: null }); return; }
    if (s.driver === "width") set({ lockAspect, presetID: null, height: Math.max(Math.round((s.width * size[1]) / size[0]), 1) });
    else set({ lockAspect, presetID: null, width: Math.max(Math.round((s.height * size[0]) / size[1]), 1) });
  };
  // A preset always means its exact size, so the picture is placed inside it ("Fit") unless the user chose otherwise.
  const applyPreset = (p: SizePreset) => set({ mode: "pixels", width: p.width, height: p.height, lockAspect: false, presetID: p.id });
  const confirmPreset = () => {
    const name = presetName.trim();
    if (!name) return;
    savePreset(name, s.width, s.height);
    const saved = useApp.getState().customPresets.slice(-1)[0];
    if (saved) set({ lockAspect: false, presetID: saved.id });
    setNaming(false);
  };

  const detail = s.mode === "percent" ? `${Math.round(s.percent)}%`
    : s.lockAspect ? t("resize.footer.locked", s.driver === "width" ? s.width : s.height, s.driver === "width" ? t("setting.width") : t("setting.height"))
    : `${s.width} × ${s.height} px`;

  return (
    <>
      <div className="tool-split">
        <div className="tool-main">
          <Stage item={item} plan={plan} s={s} onAnchor={(anchor) => set({ anchor })} />
          <ResultCard size={size} plan={plan} />
          <OutputCard s={s} set={set} formats={(["jpeg", "png", "tiff", "webp"] as OutputFormat[]).filter((f) => caps?.formats.includes(f) ?? true)} anyAlpha={targets.some((f) => f.info?.has_alpha)} />
          <div className="stack" style={{ gap: 10 }}><ProvenanceNotice /><UnavailableFormatsNote /></div>
        </div>

        <aside className="side-panel">
          {batch?.tool === "resize" && <BatchView batch={batch} />}
          <ScopeRow />
          <div className="section">
            <h3 className="title3">{t("setting.resizeBy")}</h3>
            <div className="seg-box">
              {(["pixels", "percent"] as const).map((m) => <button key={m} type="button" aria-pressed={s.mode === m} onClick={() => set({ mode: m })}>{t(`resize.mode.${m}`)}</button>)}
            </div>
          </div>

          {s.mode === "pixels" ? (
            <>
              <div className="popular">
                <div className="row" style={{ gap: 8 }}><Sparkles size={16} color="var(--orange)" /><h3 className="title3">{t("resize.popular")}</h3></div>
                <div className="muted">{t("resize.popular.text")}</div>
                <div className="tile-grid">
                  {presets.map((p) => <PresetTile key={p.id} preset={p} selected={activePreset?.id === p.id} onClick={() => applyPreset(p)} />)}
                </div>
                <div className="row" style={{ gap: 14 }}>
                  <button type="button" className="link-btn" onClick={() => { setPresetName(""); setNaming(true); }}>{t("preset.save")}</button>
                  {activePreset && !activePreset.isBuiltIn && <button type="button" className="link-btn" onClick={() => { deletePreset(activePreset.id); set({ presetID: null }); }}>{t("preset.delete")}</button>}
                </div>
              </div>
              <div className="section">
                <h3 className="title3">{t("setting.dimensions")}</h3>
                <div className="dim-row">
                  <NumberInput value={s.width} onChange={setWidth} label={t("setting.width")} />
                  <button type="button" className="lock-btn" aria-pressed={s.lockAspect} title={t("setting.lock")} aria-label={t("setting.lock")} onClick={toggleLock}>
                    {s.lockAspect ? <Lock size={15} /> : <LockOpen size={15} />}
                  </button>
                  <NumberInput value={s.height} onChange={setHeight} label={t("setting.height")} />
                  <span className="muted">px</span>
                </div>
                {s.lockAspect && <div className="caption">{t("resize.lock.hint")}</div>}
              </div>
              {!s.lockAspect && <FitSection s={s} set={set} />}
            </>
          ) : (
            <div className="section">
              <div className="section-head"><h3 className="title3 grow">{t("setting.percent")}</h3><span className="value-accent">{Math.round(s.percent)}%</span></div>
              <Slider value={s.percent} min={10} max={300} step={1} onChange={(percent) => set({ percent })} label={t("setting.percent")} />
              <div className="choice-row">
                {[25, 50, 75, 150, 200].map((p) => <button key={p} type="button" className="choice" aria-pressed={Math.round(s.percent) === p} onClick={() => set({ percent: p })}>{p}%</button>)}
              </div>
            </div>
          )}

          <hr className="divider" />
          <div className="toggle-row">
            <div className="grow"><div style={{ fontWeight: 600 }}>{t("setting.neverEnlarge")}</div><div className="caption">{t("setting.neverEnlarge.hint")}</div></div>
            <Switch checked={s.neverEnlarge} onChange={(neverEnlarge) => set({ neverEnlarge })} label={t("setting.neverEnlarge")} />
          </div>
        </aside>
      </div>
      <ToolFooter untouched={t("compress.footer.untouched")} summaryIcon={Images} busy={running}
        summary={`${t(targets.length === 1 ? "files.count.one" : "files.count.many", targets.length)} · ${detail}`}>
        <Button icon={Crop} disabled={targets.length === 0 || running} onClick={run}>{runTitle("resize.run", targets.length)}</Button>
      </ToolFooter>
      {naming && (
        <Modal onClose={() => setNaming(false)} width={420}>
          <div className="pad stack">
            <div className="h-sub">{t("preset.save.title")}</div>
            <div className="muted">{t("preset.save.message", s.width, s.height)}</div>
            <input className="field" autoFocus type="text" value={presetName} placeholder={t("preset.save.placeholder")} style={{ width: "100%" }}
              onChange={(e) => setPresetName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmPreset()} />
            <div className="row"><div className="spacer" />
              <Button variant="secondary" onClick={() => setNaming(false)}>{t("common.cancel")}</Button>
              <Button disabled={!presetName.trim()} onClick={confirmPreset}>{t("common.save")}</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function NumberInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return <input className="field num" type="number" min={1} value={value} aria-label={label} placeholder={label} onChange={(e) => onChange(Math.round(Number(e.target.value) || 1))} />;
}

// MARK: Stage

function Stage({ item, plan, s, onAnchor }: { item: FileItem; plan: ResizePlan; s: ResizeSettings; onAnchor: (a: [number, number]) => void }) {
  const src = useBeforeImage(item.path, item.thumb, 1200);
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [samples, setSamples] = useState<Partial<Record<Bars, BorderSamples>>>({});
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    setSamples({});
    if (!src) return;
    const img = new Image();
    img.onload = () => setSamples({ sides: borderSamples(img, "sides") ?? undefined, topBottom: borderSamples(img, "topBottom") ?? undefined });
    img.src = src;
  }, [src]);

  const info = item.info!;
  const [ow, oh] = [info.width, info.height];
  const [cw, ch] = [plan.canvas_width, plan.canvas_height];
  const scale = Math.min((width / 2 - 28) / Math.max(ow, cw), (STAGE_H - 96) / Math.max(oh, ch));
  const out: OutputFormat = s.outputFormat ?? info.format ?? "jpeg";
  const keepsTransparency = info.has_alpha && out !== "jpeg";
  const fill = keepsTransparency ? "color-mix(in srgb, var(--secondary) 18%, transparent)" : hexOf(s.background);
  const bars = s.fit === "pad" && s.borderAuto && !keepsTransparency ? barsFor(plan) : null;
  const panning = s.mode === "pixels" && !s.lockAspect && s.fit === "fill" && !plan.unchanged;

  // Drag the picture inside the frame to choose which part of it "Fill" keeps.
  const drag = useRef<{ x: number; y: number; anchor: [number, number] } | null>(null);
  const onDown = (e: React.PointerEvent) => { if (!panning) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, anchor: s.anchor }; };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const overX = (plan.draw.w - cw) * scale, overY = (plan.draw.h - ch) * scale;
    const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
    // Dragging the picture right reveals more of its left side, so the anchor moves the other way.
    onAnchor([overX > 1 ? clamp(d.anchor[0] - (e.clientX - d.x) / overX) : d.anchor[0], overY > 1 ? clamp(d.anchor[1] - (e.clientY - d.y) / overY) : d.anchor[1]]);
  };
  const picture = (opacity = 1) => src && (
    <img src={src} alt="" draggable={false} style={{ left: plan.draw.x * scale, top: plan.draw.y * scale, width: plan.draw.w * scale, height: plan.draw.h * scale, opacity }} />
  );
  const sample = bars ? samples[bars] : undefined;
  const barStyle = (colors: string[], dir: string) => `linear-gradient(${dir}, ${colors.join(", ")})`;

  return (
    <div className="stage" ref={ref} style={{ height: STAGE_H }}>
      <StagePane label={t("compress.before")}>
        <Frame w={ow * scale} h={oh * scale} fill="var(--canvas)">
          {src && <img src={src} alt="" draggable={false} style={{ left: 0, top: 0, width: ow * scale, height: oh * scale }} />}
        </Frame>
        <span className="caption-pill center">{`${ow} × ${oh} px`}</span>
      </StagePane>
      <div className="split" />
      <StagePane label={t("compress.after")} after>
        <div className={`rz-frame ${panning ? "pannable" : ""}`} style={{ width: Math.max(cw * scale, 1), height: Math.max(ch * scale, 1) }} title={panning ? t("resize.pan.hint") : undefined}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          {panning && picture(0.28)}
          <div className="clip" style={{ background: fill }}>
            {bars === "sides" && sample && (
              <>
                <div style={{ position: "absolute", left: 0, top: 0, width: plan.draw.x * scale + 1, height: "100%", background: barStyle(sample.start, "to bottom") }} />
                <div style={{ position: "absolute", left: (plan.draw.x + plan.draw.w) * scale - 1, top: 0, right: 0, height: "100%", background: barStyle(sample.end, "to bottom") }} />
              </>
            )}
            {bars === "topBottom" && sample && (
              <>
                <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: plan.draw.y * scale + 1, background: barStyle(sample.start, "to right") }} />
                <div style={{ position: "absolute", left: 0, top: (plan.draw.y + plan.draw.h) * scale - 1, bottom: 0, width: "100%", background: barStyle(sample.end, "to right") }} />
              </>
            )}
            {picture()}
          </div>
        </div>
        {panning && <span className="hint-pill"><Hand size={13} />{t("resize.pan.hint")}</span>}
        <span className="caption-pill center">{`${cw} × ${ch} px`}</span>
      </StagePane>
    </div>
  );
}

function Frame({ w, h, fill, children }: { w: number; h: number; fill: string; children: ReactNode }) {
  return <div className="rz-frame" style={{ width: Math.max(w, 1), height: Math.max(h, 1) }}><div className="clip" style={{ background: fill }}>{children}</div></div>;
}

function ResultCard({ size, plan }: { size: [number, number]; plan: ResizePlan }) {
  const percent = Math.round((plan.canvas_width / Math.max(size[0], 1)) * 100);
  const cropped = plan.draw.w > plan.canvas_width + 0.5 || plan.draw.h > plan.canvas_height + 0.5;
  return (
    <Card>
      <div className="stack" style={{ gap: 10 }}>
        <div className="row" style={{ alignItems: "baseline", gap: 12 }}>
          <span className="big-result grow">{plan.unchanged ? `${size[0]} × ${size[1]} px` : `${size[0]} × ${size[1]}  →  ${plan.canvas_width} × ${plan.canvas_height} px`}</span>
          {plan.unchanged ? <Chip text={t("resize.unchanged")} /> : <Chip text={t("resize.scale", percent)} tone={plan.enlarges ? "warning" : "success"} />}
        </div>
        {cropped && <div className="row muted" style={{ gap: 8 }}><Crop size={14} />{t("resize.cropNote")}</div>}
        {plan.enlarges && <div className="row" style={{ gap: 8, color: "var(--warning)" }}><AlertTriangle size={14} />{t("resize.enlargeNote")}</div>}
      </div>
    </Card>
  );
}

function OutputCard({ s, set, formats, anyAlpha }: { s: ResizeSettings; set: (v: Partial<ResizeSettings>) => void; formats: OutputFormat[]; anyAlpha: boolean }) {
  const lossy = s.outputFormat == null || isLossy(s.outputFormat);
  const field = (label: string, children: ReactNode, trailing?: string) => (
    <div className="stack" style={{ gap: 7 }}>
      <div className="row"><b className="grow" style={{ fontWeight: 600 }}>{label}</b>{trailing && <span className="value-accent">{trailing}</span>}</div>
      {children}
    </div>
  );
  return (
    <Card>
      <div className="stack" style={{ gap: 16 }}>
        <CardHeader icon={Download} title={t("resize.output.title")} subtitle={t("resize.output.text")} />
        <div className="out-grid">
          {field(t("setting.outputFormat"), <FormatSelect value={s.outputFormat} formats={formats} onChange={(outputFormat) => set({ outputFormat })} />)}
          {field(t("setting.quality"), lossy ? <Slider value={s.quality} min={0.05} max={1} onChange={(quality) => set({ quality })} label={t("setting.quality")} /> : <span className="muted">{t("setting.quality.lossless")}</span>, lossy ? `${Math.round(s.quality * 100)}%` : undefined)}
          {field(t("setting.suffix"), <SuffixField suffix={s.suffix} onChange={(suffix) => set({ suffix })} example={exampleName("photo", s.suffix, extFor(s.outputFormat ?? "jpeg"))} />)}
          {field(t("setting.keepMetadata"), <div className="toggle-row"><span className="grow caption">{t("setting.keepMetadata.hint")}</span><Switch checked={s.keepMetadata} onChange={(keepMetadata) => set({ keepMetadata })} label={t("setting.keepMetadata")} /></div>)}
          {anyAlpha && s.outputFormat === "jpeg" && field(t("setting.background"), (
            <>
              <div className="row">
                <ColorField value={s.background} onChange={(background) => set({ background })} />
                <Button variant="secondary" onClick={() => set({ background: [255, 255, 255] })}>{t("setting.background.white")}</Button>
                <Button variant="secondary" onClick={() => set({ background: [0, 0, 0] })}>{t("setting.background.black")}</Button>
              </div>
              <span className="caption">{t("setting.background.hint")}</span>
            </>
          ))}
        </div>
      </div>
    </Card>
  );
}

// MARK: Tiles

function PresetTile({ preset, selected, onClick }: { preset: SizePreset; selected: boolean; onClick: () => void }) {
  const ratio = preset.width / Math.max(preset.height, 1);
  const [w, h] = ratio > 30 / 24 ? [30, 30 / ratio] : [24 * ratio, 24];
  return (
    <button type="button" className="preset-tile" aria-pressed={selected} onClick={onClick}>
      <div className="shape"><div style={{ width: w, height: h }} /></div>
      <div>
        <div style={{ fontWeight: 600 }}>{preset.isBuiltIn ? t(`preset.${preset.name}`) : preset.name}</div>
        <div className="caption tnum">{`${preset.width} × ${preset.height}`}</div>
      </div>
    </button>
  );
}

function FitSection({ s, set }: { s: ResizeSettings; set: (v: Partial<ResizeSettings>) => void }) {
  const centred = s.anchor[0] === 0.5 && s.anchor[1] === 0.5;
  return (
    <div className="section">
      <h3 className="title3">{t("resize.fit.title")}</h3>
      <div className="choice-row" style={{ gap: 8 }}>
        {(["pad", "fill", "stretch"] as const).map((f) => (
          <button key={f} type="button" className="fit-tile" aria-pressed={s.fit === f} onClick={() => set({ fit: f })}>
            <span className="fit-icon">
              {f === "pad" ? <div style={{ width: 18, height: 18 }} />
                : <div style={{ position: "absolute", inset: 0 }}>{f === "fill" ? <Crop size={10} strokeWidth={3} /> : <ArrowLeftRight size={10} strokeWidth={3} />}</div>}
            </span>
            <span>{t(`fit.${f}`)}</span>
          </button>
        ))}
      </div>
      <div className="muted">{t(`fit.${s.fit}.hint`)}</div>
      {s.fit === "pad" && <BorderControls s={s} set={set} />}
      {s.fit === "fill" && <button type="button" className="link-btn" disabled={centred} onClick={() => set({ anchor: [0.5, 0.5] })}>{t("resize.pan.center")}</button>}
    </div>
  );
}

/** Border colour: matched to the picture, a plain colour, or anything from the colour picker. */
function BorderControls({ s, set }: { s: ResizeSettings; set: (v: Partial<ResizeSettings>) => void }) {
  const hex = hexOf(s.background);
  const isWhite = !s.borderAuto && hex === "#ffffff";
  const isBlack = !s.borderAuto && hex === "#000000";
  return (
    <div className="stack" style={{ gap: 8 }}>
      <b style={{ fontWeight: 600 }}>{t("resize.borderColor")}</b>
      <div className="choice-row">
        <button type="button" className="choice" aria-pressed={s.borderAuto} onClick={() => set({ borderAuto: true })}><Pipette size={12} />{t("resize.border.auto")}</button>
        <button type="button" className="choice" aria-pressed={isWhite} onClick={() => set({ borderAuto: false, background: [255, 255, 255] })}><span className="swatch" style={{ background: "#fff" }} />{t("setting.background.white")}</button>
        <button type="button" className="choice" aria-pressed={isBlack} onClick={() => set({ borderAuto: false, background: [0, 0, 0] })}><span className="swatch" style={{ background: "#000" }} />{t("setting.background.black")}</button>
        <input type="color" value={hex} title={t("resize.border.custom")} aria-label={t("resize.border.custom")} style={{ flex: "none" }}
          onChange={(e) => set({ background: rgbOf(e.target.value), borderAuto: false })} />
      </div>
      <div className="caption">{t(s.borderAuto ? "resize.border.auto.hint" : "resize.border.hint")}</div>
    </div>
  );
}

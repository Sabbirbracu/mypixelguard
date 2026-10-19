// AI Tools: a live before/after on the left, one tile per tool on the right, one button at the bottom.
// Mirrors AIToolsViews.swift.
import { useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { AlertTriangle, BadgeCheck, ChevronRight, Expand, Images, Info, LaptopMinimalCheck, RectangleHorizontal, RectangleVertical, ScanLine, Scissors, Square, WandSparkles, XCircle, type LucideIcon } from "lucide-react";
import { api } from "../api";
import { useBeforeImage, useDebouncedTask } from "../hooks";
import { exampleName, extFor } from "../format";
import { errorText, runTitle, t } from "../i18n";
import { useApp } from "../store";
import { BatchView, ProvenanceNotice, ScopeRow } from "../components/shell";
import { Button, Card, Chip, Disclosure, FormatSelect, Segmented, Slider, Spinner, StagePane, SuffixField, Switch, ToolFooter, isLossy, useRunShortcut } from "../components/ui";
import type { AiPreview, AiSettings, OutputFormat } from "../types";

const ASPECTS: { id: AiSettings["cropAspect"]; label: string; icon: LucideIcon }[] = [
  { id: "square", label: "1:1", icon: Square }, { id: "portrait", label: "4:5", icon: RectangleVertical }, { id: "landscape", label: "16:9", icon: RectangleHorizontal },
];
const hasTool = (s: AiSettings) => s.enhance || s.upscale || s.smartCrop || s.removeBackground;

export default function AiToolsView() {
  const selected = useApp((st) => st.selected());
  if (!selected) return <div className="muted" style={{ flex: 1, display: "grid", placeItems: "center" }}>{t("detail.selectImage")}</div>;
  if (!selected.info) return <div className="muted" style={{ flex: 1, display: "grid", placeItems: "center" }}>{t("compress.unreadable")}</div>;
  return <AiBody />;
}

function ToolTile({ icon: Icon, title, hint, on, onChange, children }: { icon: LucideIcon; title: string; hint: string; on: boolean; onChange: (v: boolean) => void; children?: ReactNode }) {
  return (
    <div className={`tool-tile ${on ? "on" : ""}`}>
      <div className="row top" style={{ gap: 12 }}>
        <div className="icon-tile"><Icon size={15} /></div>
        <div className="grow"><div style={{ fontWeight: 600 }}>{title}</div><div className="caption">{hint}</div></div>
        <Switch checked={on} onChange={onChange} label={title} />
      </div>
      {on && children}
    </div>
  );
}

function AiBody() {
  const s = useApp((st) => st.ai);
  const patch = useApp((st) => st.patch);
  const caps = useApp((st) => st.caps);
  const batch = useApp((st) => st.batch);
  const running = useApp((st) => st.isBatchRunning());
  const startBatch = useApp((st) => st.startBatch);
  const selected = useApp((st) => st.selected())!;
  const targets = useApp(useShallow((st) => st.toolTargets()));
  const [preview, setPreview] = useState<AiPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [more, setMore] = useState(false);
  const before = useBeforeImage(selected.path, selected.thumb);
  const modelMissing = caps != null && !caps.backgroundModel;
  const formats = (["jpeg", "png", "tiff", "webp"] as OutputFormat[]).filter((f) => caps?.formats.includes(f) ?? true);
  const base: OutputFormat = s.format ?? selected.info?.format ?? "png";
  const outFormat: OutputFormat = s.removeBackground && base === "jpeg" ? "png" : base;
  const active = hasTool(s);
  const run = () => void startBatch("enhance", s);
  useRunShortcut(run, targets.length > 0 && !running && active);

  // Only what changes the pixels; format, quality and file name must not re-run the preview.
  useDebouncedTask(async (cancelled) => {
    setError(null);
    if (!active) { setPreview(null); return; }
    setWorking(true);
    try {
      const p = await api.aiPreview(selected.path, s);
      if (!cancelled()) setPreview(p);
    } catch (e) {
      if (!cancelled()) { setPreview(null); setError(errorText(e)); }
    } finally {
      if (!cancelled()) setWorking(false);
    }
  }, [selected.path, s.enhance, s.upscale, s.upscaleFactor, s.smartCrop, s.cropAspect, s.removeBackground], 350);

  const steps: { title: string; icon: LucideIcon }[] = [];
  if (s.smartCrop) steps.push({ title: t("ai.smartCrop"), icon: ScanLine });
  if (s.enhance) steps.push({ title: t("ai.enhance"), icon: WandSparkles });
  if (s.removeBackground) steps.push({ title: t("ai.background"), icon: Scissors });
  if (s.upscale) steps.push({ title: `${t("ai.upscale")} ${s.upscaleFactor}×`, icon: Expand });
  const info = selected.info!;
  const detail = active ? t("ai.footer.tools", steps.length) : t("ai.footer.none");

  return (
    <>
      <div className="tool-split">
        <div className="tool-main">
          <div className="stage" style={{ height: 340 }}>
            <StagePane label={t("compress.before")} caption={`${info.width} × ${info.height}`}>
              {before && <img className="fit" src={before} alt="" />}
            </StagePane>
            <div className="split" />
            <StagePane label={t("compress.after")} after caption={active && preview ? `${preview.finalWidth} × ${preview.finalHeight}` : null} spinning={working && !!preview}>
              {active && preview ? <img className={`fit ${s.removeBackground ? "checker" : ""}`} src={preview.image} alt="" />
                : !active ? <div className="stage-empty"><WandSparkles size={26} /><span>{t("ai.summary.none")}</span></div>
                : working ? <Spinner /> : null}
            </StagePane>
          </div>

          <Card>
            <div className="stack" style={{ gap: 14 }}>
              {active && preview ? (
                <div className="row" style={{ alignItems: "baseline", gap: 12 }}>
                  <span className="big-result grow">{`${info.width} × ${info.height}  →  ${preview.finalWidth} × ${preview.finalHeight}`}</span>
                  <Chip text={t("ai.footer.tools", steps.length)} tone="success" />
                </div>
              ) : active && error ? (
                <div className="row" style={{ gap: 8, color: "var(--danger)" }}><XCircle size={16} />{error}</div>
              ) : active ? (
                <div className="row muted" style={{ gap: 10 }}><Spinner small />{t("compress.calculating")}</div>
              ) : (
                <div className="row" style={{ gap: 8, color: "var(--info)" }}><Info size={16} />{t("ai.summary.none")}</div>
              )}
              {active && (
                <>
                  <div className="stack" style={{ gap: 8 }}>
                    <span className="field-label">{t("ai.summary.title")}</span>
                    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                      {steps.map((st, i) => (
                        <span key={st.title} className="row" style={{ gap: 6 }}>
                          {i > 0 && <ChevronRight size={12} strokeWidth={3} color="var(--secondary)" />}
                          <span className="step-chip"><st.icon size={13} />{st.title}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  {s.upscale && <div className="caption row top" style={{ gap: 6 }}><Info size={12} style={{ flex: "none", marginTop: 3 }} />{t("ai.preview.note")}</div>}
                  {s.removeBackground && modelMissing && <div className="caption row top" style={{ gap: 6, color: "var(--warning)" }}><AlertTriangle size={12} style={{ flex: "none", marginTop: 3 }} />{t("ai.background.unavailable")}</div>}
                </>
              )}
            </div>
          </Card>
        </div>

        <aside className="side-panel w340">
          {batch?.tool === "enhance" && <BatchView batch={batch} />}
          <ScopeRow />
          <div className="section">
            <h3 className="title3">{t("ai.tools.title")}</h3>
            <ToolTile icon={WandSparkles} title={t("ai.enhance")} hint={t("ai.enhance.hint")} on={s.enhance} onChange={(enhance) => patch("ai", { enhance })} />
            <ToolTile icon={ScanLine} title={t("ai.smartCrop")} hint={t("ai.smartCrop.hint")} on={s.smartCrop} onChange={(smartCrop) => patch("ai", { smartCrop })}>
              <div className="stack" style={{ gap: 8 }}>
                <div className="choice-row" style={{ gap: 8 }}>
                  {ASPECTS.map((a) => (
                    <button key={a.id} type="button" className="aspect-btn" aria-pressed={s.cropAspect === a.id} aria-label={t(`ai.aspect.${a.id}`)} onClick={() => patch("ai", { cropAspect: a.id })}>
                      <a.icon size={16} /><span className="caption" style={{ color: "inherit" }}>{a.label}</span>
                    </button>
                  ))}
                </div>
                <span className="caption">{t(`ai.aspect.${s.cropAspect}`)}</span>
              </div>
            </ToolTile>
            <ToolTile icon={Scissors} title={t("ai.background")} hint={t("ai.background.hint")} on={s.removeBackground} onChange={(removeBackground) => patch("ai", { removeBackground })}>
              {modelMissing && <div className="caption row top" style={{ gap: 6, color: "var(--warning)" }}><AlertTriangle size={12} style={{ flex: "none", marginTop: 3 }} />{t("ai.background.unavailable")}</div>}
            </ToolTile>
            <ToolTile icon={Expand} title={t("ai.upscale")} hint={t("ai.upscale.hint")} on={s.upscale} onChange={(upscale) => patch("ai", { upscale })}>
              <Segmented value={s.upscaleFactor} options={[2, 3, 4].map((v) => ({ value: v, label: `${v}×` }))} onChange={(upscaleFactor) => patch("ai", { upscaleFactor })} />
            </ToolTile>
          </div>
          <hr className="divider" />
          <div className="section">
            <h3 className="title3">{t("setting.outputFormat")}</h3>
            <FormatSelect value={s.format} formats={formats} onChange={(format) => patch("ai", { format })} />
            {s.removeBackground && base === "jpeg" && <div className="caption row top" style={{ gap: 6 }}><Info size={12} style={{ flex: "none", marginTop: 3 }} />{t("ai.format.png")}</div>}
          </div>
          {isLossy(outFormat) ? (
            <div className="section">
              <div className="section-head"><h3 className="title3 grow">{t("setting.quality")}</h3><span className="value-accent">{Math.round(s.quality * 100)}%</span></div>
              <Slider value={s.quality} min={0.05} max={1} onChange={(quality) => patch("ai", { quality })} label={t("setting.quality")} />
              <div className="range-labels"><span>{t("compress.quality.smaller")}</span><span>{t("compress.quality.better")}</span></div>
            </div>
          ) : (
            <div className="row muted" style={{ gap: 8 }}><BadgeCheck size={15} />{t("setting.quality.lossless")}</div>
          )}
          <hr className="divider" />
          <div className="section">
            <h3 className="title3">{t("setting.keepMetadata")}</h3>
            <div className="toggle-row"><div className="grow muted">{t("setting.keepMetadata.hint")}</div><Switch checked={!s.cleanMetadata} onChange={(keep) => patch("ai", { cleanMetadata: !keep })} label={t("setting.keepMetadata")} /></div>
          </div>
          <div className="section" style={{ gap: 12 }}>
            <Disclosure title={t("compress.more")} open={more} onToggle={() => setMore((v) => !v)} />
            {more && (
              <div className="stack" style={{ gap: 5 }}>
                <span className="field-label">{t("setting.suffix")}</span>
                <SuffixField suffix={s.suffix} onChange={(suffix) => patch("ai", { suffix })} example={exampleName("photo", s.suffix, extFor(outFormat))} />
              </div>
            )}
          </div>
          <div className="stack" style={{ gap: 10 }}>
            <ProvenanceNotice />
            <div className="caption row top" style={{ gap: 6 }}><LaptopMinimalCheck size={13} style={{ flex: "none", marginTop: 2 }} />{t("ai.local")}</div>
          </div>
        </aside>
      </div>
      <ToolFooter untouched={t("inspect.footer.untouched")} summaryIcon={Images} busy={running}
        summary={`${t(targets.length === 1 ? "files.count.one" : "files.count.many", targets.length)} · ${detail}`}>
        <Button icon={WandSparkles} disabled={targets.length === 0 || running || !active} onClick={run}>{runTitle("ai.run", targets.length)}</Button>
      </ToolFooter>
    </>
  );
}

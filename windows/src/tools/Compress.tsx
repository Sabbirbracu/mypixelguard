// Compress: a live before/after on the left, a short list of choices on the right, one button at the bottom.
// Mirrors CompressViews.swift.
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { AlertTriangle, BarChart3, Images, Info, Lock, Minimize2, RefreshCw, XCircle } from "lucide-react";
import { api } from "../api";
import { useBeforeImage, useDebouncedTask } from "../hooks";
import { byteString, exampleName, extFor, percentSaved } from "../format";
import { errorText, noteText, runTitle, t } from "../i18n";
import { useApp } from "../store";
import { BatchView, ProvenanceNotice, ScopeRow } from "../components/shell";
import {
  Button, Card, CardHeader, Chip, ColorField, Disclosure, FORMAT_NAMES, FormatSelect, Slider, Spinner, StagePane, SuffixField, Switch, ToggleRow, ToolFooter,
  isLossy, useRunShortcut,
} from "../components/ui";
import { UnavailableFormatsNote } from "./Convert";
import type { CompressPreview, OutputFormat } from "../types";

export default function CompressView() {
  const selected = useApp((st) => st.selected());
  if (!selected) return <div className="muted" style={{ flex: 1, display: "grid", placeItems: "center" }}>{t("detail.selectImage")}</div>;
  if (!selected.info) return <div className="muted" style={{ flex: 1, display: "grid", placeItems: "center" }}>{t("compress.unreadable")}</div>;
  return <CompressBody />;
}

function CompressBody() {
  const s = useApp((st) => st.compress);
  const patch = useApp((st) => st.patch);
  const caps = useApp((st) => st.caps);
  const batch = useApp((st) => st.batch);
  const running = useApp((st) => st.isBatchRunning());
  const startBatch = useApp((st) => st.startBatch);
  const selected = useApp((st) => st.selected())!;
  const targets = useApp(useShallow((st) => st.toolTargets()));
  const [preview, setPreview] = useState<CompressPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [more, setMore] = useState(false);
  const before = useBeforeImage(selected.path, selected.thumb);
  const outFormat: OutputFormat = s.format ?? selected.info?.format ?? "jpeg";
  const lossy = isLossy(outFormat);
  const anyAlpha = targets.some((f) => f.info?.has_alpha);
  const formats = (["jpeg", "png", "tiff", "webp"] as OutputFormat[]).filter((f) => caps?.formats.includes(f) ?? true);
  const run = () => void startBatch("compress", s);
  useRunShortcut(run, targets.length > 0 && !running);

  useDebouncedTask(async (cancelled) => {
    setError(null);
    setWorking(true);
    try {
      const p = await api.compressPreview(selected.path, s);
      if (!cancelled()) setPreview(p);
    } catch (e) {
      if (!cancelled()) { setPreview(null); setError(errorText(e)); }
    } finally {
      if (!cancelled()) setWorking(false);
    }
  }, [selected.path, JSON.stringify(s)], 350);

  const saved = preview ? percentSaved(preview.original_bytes, preview.output_bytes) : 0;
  const percent = Math.round(s.quality * 100);
  const detail = !lossy ? FORMAT_NAMES[outFormat]
    : `${FORMAT_NAMES[outFormat]} · ${s.useTargetSize ? t("compress.footer.target", s.targetKB) : t("compress.footer.quality", percent)}`;
  const alternative: OutputFormat = formats.includes("webp") ? "webp" : "jpeg";
  const preset = (label: string, value: number) => (
    <button type="button" className="choice" aria-pressed={Math.abs(s.quality - value) < 0.005} disabled={s.useTargetSize} onClick={() => patch("compress", { quality: value })}>{label}</button>
  );

  return (
    <>
      <div className="tool-split">
        <div className="tool-main">
          <div className="stage" style={{ height: 330 }}>
            <StagePane label={t("compress.before")} caption={selected.info ? byteString(selected.info.file_size) : null}>
              {before && <img className="fit" src={before} alt="" />}
            </StagePane>
            <div className="split" />
            <StagePane label={t("compress.after")} after caption={preview ? byteString(preview.output_bytes) : null} spinning={working && !!preview}>
              {preview?.image ? <img className="fit" src={preview.image} alt="" /> : working ? <Spinner /> : null}
            </StagePane>
          </div>

          <Card>
            <div className="stack" style={{ gap: 12 }}>
              {preview ? (
                <>
                  <div className="row" style={{ alignItems: "baseline", gap: 12 }}>
                    <span className="big-result grow" style={{ fontSize: 24 }}>{`${byteString(preview.original_bytes)}  →  ${byteString(preview.output_bytes)}`}</span>
                    <Chip text={saved >= 0 ? t("compress.saved", saved) : t("compress.larger", -saved)} tone={saved > 0 ? "success" : "warning"} />
                  </div>
                  <div className="bar-track">
                    <div style={{ width: `${Math.min(Math.max(preview.output_bytes / Math.max(preview.original_bytes, 1), 0.02), 1) * 100}%`, background: saved > 0 ? "var(--success)" : "var(--warning)" }} />
                  </div>
                  {preview.notes.map((n, i) => <div key={i} className="caption row" style={{ gap: 6, color: "var(--warning)" }}><AlertTriangle size={12} />{noteText(n)}</div>)}
                </>
              ) : error ? (
                <div className="row" style={{ gap: 8, color: "var(--danger)" }}><XCircle size={16} />{error}</div>
              ) : (
                <div className="row muted" style={{ gap: 10 }}><Spinner small />{t("compress.calculating")}</div>
              )}
            </div>
          </Card>

          {preview && preview.curve.length > 0 && (() => {
            const max = Math.max(...preview.curve.map((c) => c[1]), preview.original_bytes, 1);
            const nearest = preview.curve.reduce((best, c) => (Math.abs(c[0] - percent) < Math.abs(best[0] - percent) ? c : best))[0];
            return (
              <Card>
                <div className="stack" style={{ gap: 12 }}>
                  <CardHeader icon={BarChart3} title={t("compress.tradeoff")} subtitle={t("compress.tradeoff.note")} />
                  <div className="stack" style={{ gap: 8 }}>
                    {preview.curve.map(([q, bytes]) => {
                      const on = !s.useTargetSize && q === nearest;
                      return (
                        <div key={q} className="curve-row">
                          <span className={`q ${on ? "on" : ""}`}>{q}%</span>
                          <div className="grow" style={{ height: 10 }}><div style={{ height: 10, borderRadius: 4, background: `color-mix(in srgb, var(--orange) ${on ? 100 : 45}%, transparent)`, width: `${(bytes / max) * 100}%` }} /></div>
                          <span className="b">{byteString(bytes)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            );
          })()}
        </div>

        <aside className="side-panel">
          {batch?.tool === "compress" && <BatchView batch={batch} />}
          <ScopeRow />
          <div className="section">
            <h3 className="title3">{t("setting.outputFormat")}</h3>
            <FormatSelect value={s.format} formats={formats} onChange={(format) => patch("compress", { format })} />
          </div>
          <hr className="divider" />
          {lossy ? (
            <>
              <div className="section">
                <div className="section-head"><h3 className="title3 grow">{t("setting.quality")}</h3><span className="value-accent" style={s.useTargetSize ? { color: "var(--secondary)" } : undefined}>{percent}%</span></div>
                <Slider value={s.quality} min={0.05} max={1} disabled={s.useTargetSize} onChange={(quality) => patch("compress", { quality })} label={t("setting.quality")} />
                <div className="range-labels"><span>{t("compress.quality.smaller")}</span><span>{t("compress.quality.better")}</span></div>
                <div className="choice-row">{preset(t("compress.preset.small"), 0.5)}{preset(t("compress.preset.balanced"), 0.75)}{preset(t("compress.preset.high"), 0.9)}</div>
                {s.useTargetSize && <div className="caption row" style={{ gap: 6 }}><Lock size={12} />{t("compress.quality.locked")}</div>}
              </div>
              <hr className="divider" />
              <div className="section">
                <ToggleRow big title={t("setting.targetSize")} hint={t("setting.targetSize.hint")} checked={s.useTargetSize} onChange={(useTargetSize) => patch("compress", { useTargetSize })} />
                {s.useTargetSize && (
                  <div className="row" style={{ gap: 8 }}>
                    <input className="field num" type="number" min={1} style={{ width: 90 }} value={s.targetKB} aria-label={t("setting.targetSize")}
                      onChange={(e) => patch("compress", { targetKB: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
                    <span className="muted">KB</span>
                    <div className="spacer" />
                    {[100, 500, 1000].map((kb) => <Button key={kb} variant="secondary" style={{ fontSize: 11.5, padding: "5px 8px" }} onClick={() => patch("compress", { targetKB: kb })}>{kb === 1000 ? "1 MB" : `${kb} KB`}</Button>)}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="lossless-tile">
              <div className="row" style={{ gap: 10 }}><span className="bang">!</span><b>{t("compress.lossless.title", FORMAT_NAMES[outFormat])}</b></div>
              <div>{t("compress.lossless.short", FORMAT_NAMES[outFormat])}</div>
              <Button icon={RefreshCw} style={{ width: "100%" }} onClick={() => patch("compress", { format: alternative })}>{t("compress.switchTo", FORMAT_NAMES[alternative])}</Button>
            </div>
          )}
          <hr className="divider" />
          <div className="section">
            <h3 className="title3">{t("setting.keepMetadata")}</h3>
            <div className="toggle-row"><div className="grow muted">{t("setting.keepMetadata.hint")}</div><Switch checked={s.keepMetadata} onChange={(keepMetadata) => patch("compress", { keepMetadata })} label={t("setting.keepMetadata")} /></div>
          </div>
          <div className="section" style={{ gap: 12 }}>
            <Disclosure title={t("compress.more")} open={more} onToggle={() => setMore((v) => !v)} />
            {more && (
              <div className="stack" style={{ gap: 14 }}>
                <div className="stack" style={{ gap: 5 }}>
                  <span className="field-label">{t("setting.suffix")}</span>
                  <SuffixField suffix={s.suffix} onChange={(suffix) => patch("compress", { suffix })} example={exampleName("photo", s.suffix, extFor(outFormat))} />
                </div>
                {anyAlpha && outFormat === "jpeg" && (
                  <div className="stack" style={{ gap: 5 }}>
                    <span className="field-label">{t("setting.background")}</span>
                    <div className="row">
                      <ColorField value={s.background} onChange={(background) => patch("compress", { background })} />
                      <Button variant="secondary" onClick={() => patch("compress", { background: [255, 255, 255] })}>{t("setting.background.white")}</Button>
                      <Button variant="secondary" onClick={() => patch("compress", { background: [0, 0, 0] })}>{t("setting.background.black")}</Button>
                    </div>
                    <span className="caption">{t("setting.background.hint")}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="stack" style={{ gap: 10 }}>
            <ProvenanceNotice />
            <div className="caption row top" style={{ gap: 6 }}><Info size={12} style={{ flex: "none", marginTop: 3 }} />{t("compress.reencode.note")}</div>
            <UnavailableFormatsNote />
          </div>
        </aside>
      </div>
      <ToolFooter untouched={t("compress.footer.untouched")} summaryIcon={Images} busy={running}
        summary={`${t(targets.length === 1 ? "files.count.one" : "files.count.many", targets.length)} · ${detail}`}>
        <Button icon={Minimize2} disabled={targets.length === 0 || running} onClick={run}>{runTitle("compress.run", targets.length)}</Button>
      </ToolFooter>
    </>
  );
}

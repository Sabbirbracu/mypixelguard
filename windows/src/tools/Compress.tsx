import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { api } from "../api";
import { useDebouncedTask } from "../hooks";
import { byteString, exampleName, extFor, percentSaved } from "../format";
import { errorText, noteText, runTitle, t } from "../i18n";
import { useApp } from "../store";
import { BackgroundRow, Card, Chip, KeepMetadataRow, NoticeCard, QualityRow, SectionTitle, Select, SettingRow, Spinner, Switch, SuffixField, ToolHeader } from "../components/ui";
import { ExportSection, Page, ProvenanceNotice, ScopeRow } from "../components/shell";
import { UnavailableFormatsNote } from "./Convert";
import type { CompressPreview, OutputFormat } from "../types";

export default function CompressView() {
  const s = useApp((st) => st.compress);
  const patch = useApp((st) => st.patch);
  const caps = useApp((st) => st.caps);
  const startBatch = useApp((st) => st.startBatch);
  const selected = useApp((st) => st.selected());
  const targets = useApp(useShallow((st) => st.toolTargets()));
  const [preview, setPreview] = useState<CompressPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const outFormat: OutputFormat = s.format ?? selected?.info?.format ?? "jpeg";
  const lossy = outFormat === "jpeg" || outFormat === "webp";
  const anyAlpha = targets.some((f) => f.info?.has_alpha);

  useDebouncedTask(async (cancelled) => {
    setError(null);
    if (!selected?.info) { setPreview(null); return; }
    setWorking(true);
    try {
      const p = await api.compressPreview(selected.path, s);
      if (!cancelled()) setPreview(p);
    } catch (e) {
      if (!cancelled()) { setPreview(null); setError(errorText(e)); }
    } finally {
      if (!cancelled()) setWorking(false);
    }
  }, [selected?.path, selected?.info != null, JSON.stringify(s)], 350);

  const pane = (title: string, src: string | null | undefined, bytes?: number, loading = false) => (
    <div className="pane">
      <div className="h-sub">{title}</div>
      <div className="frame">{src ? <img src={src} alt="" /> : loading ? <Spinner /> : null}</div>
      {bytes != null && <div className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>{byteString(bytes)}</div>}
    </div>
  );

  return (
    <Page>
      <ToolHeader title={t("compress.title")} subtitle={t("compress.subtitle")} />
      {selected?.info && (
        <Card>
          <div className="stack" style={{ gap: 14 }}>
            <SectionTitle text={t("compress.preview.title")} />
            <div className="row top" style={{ gap: 16 }}>
              {pane(t("compress.before"), selected.thumb, selected.info.file_size)}
              {pane(t("compress.after"), preview?.image, preview?.output_bytes, working && !preview)}
            </div>
            {preview && (() => {
              const saved = percentSaved(preview.original_bytes, preview.output_bytes);
              const max = Math.max(...preview.curve.map((c) => c[1]), preview.original_bytes, 1);
              return (
                <>
                  <div className="row" style={{ gap: 8 }}>
                    <Chip text={saved >= 0 ? t("compress.saved", saved) : t("compress.larger", -saved)} tone={saved > 0 ? "success" : "warning"} />
                    <span>{`${byteString(preview.original_bytes)} → ${byteString(preview.output_bytes)}`}</span>
                    {working && <Spinner small />}
                  </div>
                  {preview.notes.map((n, i) => <div key={i} className="caption" style={{ color: "var(--warning)" }}>{noteText(n)}</div>)}
                  {preview.curve.length > 0 && (
                    <div className="stack" style={{ gap: 6 }}>
                      <div className="h-sub">{t("compress.tradeoff")}</div>
                      {preview.curve.map(([q, bytes]) => (
                        <div key={q} className="row" style={{ gap: 10 }}>
                          <span className="caption" style={{ width: 40, textAlign: "right" }}>{q}%</span>
                          <div className="grow" style={{ height: 10 }}><div style={{ height: 10, borderRadius: 4, background: "color-mix(in srgb, var(--orange) 75%, transparent)", width: `${(bytes / max) * 100}%` }} /></div>
                          <span className="caption" style={{ width: 74, textAlign: "right" }}>{byteString(bytes)}</span>
                        </div>
                      ))}
                      <div className="caption">{t("compress.tradeoff.note")}</div>
                    </div>
                  )}
                </>
              );
            })()}
            {error && !preview && <div style={{ color: "var(--danger)" }}>{error}</div>}
          </div>
        </Card>
      )}
      <ScopeRow />
      <Card>
        <div className="stack" style={{ gap: 16 }}>
          <SettingRow label={t("setting.outputFormat")}>
            <Select width={220} value={s.format ?? ""} onChange={(v) => patch("compress", { format: (v || null) as OutputFormat | null })}>
              <option value="">{t("format.same")}</option>
              {(["jpeg", "png", "tiff", "webp"] as OutputFormat[]).filter((f) => caps?.formats.includes(f) ?? true).map((f) => <option key={f} value={f}>{f === "webp" ? "WebP" : f.toUpperCase()}</option>)}
            </Select>
          </SettingRow>
          <QualityRow quality={s.quality} enabled={lossy && !s.useTargetSize} onChange={(quality) => patch("compress", { quality })} />
          <SettingRow label={t("setting.targetSize")} hint={t("setting.targetSize.hint")}>
            <Switch checked={s.useTargetSize} disabled={!lossy} onChange={(useTargetSize) => patch("compress", { useTargetSize })} label={t("setting.targetSize")} />
            <input className="field num" type="number" min={1} style={{ width: 84 }} disabled={!s.useTargetSize || !lossy} value={s.targetKB} aria-label={t("setting.targetSize")}
              onChange={(e) => patch("compress", { targetKB: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
            <span className="muted">KB</span>
          </SettingRow>
          {!lossy && <div className="caption">{t("compress.lossless.note", outFormat === "png" ? "PNG" : outFormat.toUpperCase())}</div>}
          {anyAlpha && outFormat === "jpeg" && <BackgroundRow color={s.background} onChange={(background) => patch("compress", { background })} />}
          <KeepMetadataRow keep={s.keepMetadata} onChange={(keepMetadata) => patch("compress", { keepMetadata })} />
          <SettingRow label={t("setting.suffix")}><SuffixField suffix={s.suffix} onChange={(suffix) => patch("compress", { suffix })} example={exampleName("photo", s.suffix, extFor(outFormat))} /></SettingRow>
          <UnavailableFormatsNote />
        </div>
      </Card>
      <NoticeCard text={t("compress.reencode.note")} />
      <ProvenanceNotice />
      <ExportSection tool="compress" title={runTitle("compress.run", targets.length)} onRun={() => void startBatch("compress", s)} />
    </Page>
  );
}

import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { useDebouncedTask } from "../hooks";
import { exampleName, extFor } from "../format";
import { errorText, runTitle, t } from "../i18n";
import { useApp } from "../store";
import { Button, Card, ColorField, KeepMetadataRow, NoticeCard, QualityRow, SectionTitle, Segmented, Select, SettingRow, Slider, Spinner, SuffixField, ToolHeader } from "../components/ui";
import { ExportSection, Page, ProvenanceNotice, ScopeRow } from "../components/shell";
import type { OutputFormat } from "../types";

const NAMES: Record<OutputFormat, string> = { jpeg: "JPEG", png: "PNG", tiff: "TIFF", webp: "WebP" };

export default function BackgroundView() {
  const s = useApp((st) => st.background);
  const patch = useApp((st) => st.patch);
  const caps = useApp((st) => st.caps);
  const startBatch = useApp((st) => st.startBatch);
  const selected = useApp((st) => st.selected());
  const targets = useApp(useShallow((st) => st.toolTargets()));
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const available = (["png", "tiff", "webp", "jpeg"] as OutputFormat[]).filter((f) => (caps?.formats.includes(f) ?? true) && (s.fill === "color" || f !== "jpeg"));
  const format = available.includes(s.format) ? s.format : available[0] ?? "png";
  const lossy = format === "jpeg" || format === "webp";
  const modelMissing = caps != null && !caps.backgroundModel;

  useDebouncedTask(async (cancelled) => {
    setError(null);
    if (!selected?.info || modelMissing) { setPreview(null); return; }
    setWorking(true);
    try {
      const url = await api.backgroundPreview(selected.path, { ...s, format });
      if (!cancelled()) setPreview(url);
    } catch (e) {
      if (!cancelled()) { setPreview(null); setError(errorText(e)); }
    } finally {
      if (!cancelled()) setWorking(false);
    }
  }, [selected?.path, selected?.info != null, modelMissing, s.fill, s.edgeSmoothing, s.color.join(",")], 450);

  const pane = (title: string, src: string | null | undefined, checker: boolean, loading: boolean) => (
    <div className="pane">
      <div className="h-sub">{title}</div>
      <div className={`frame ${checker ? "checker" : ""}`} style={checker ? undefined : { background: undefined }}>
        {src ? <img src={src} alt="" /> : loading ? <Spinner /> : null}
        {loading && src && <div style={{ position: "absolute", top: 8, right: 8 }}><Spinner small /></div>}
      </div>
    </div>
  );

  return (
    <Page>
      <ToolHeader title={t("bg.title")} subtitle={t("bg.subtitle")} />
      {modelMissing && <NoticeCard text={t("bg.unavailable")} icon={AlertTriangle} tone="warning" />}
      {selected?.info && (
        <Card>
          <div className="stack" style={{ gap: 14 }}>
            <SectionTitle text={t("bg.preview.title")} />
            <div className="row top" style={{ gap: 16 }}>
              {pane(t("bg.before"), selected.thumb, false, false)}
              {pane(t("bg.after"), preview, s.fill === "transparent", working && !preview)}
            </div>
            {error && <div style={{ color: "var(--danger)" }}>{error}</div>}
          </div>
        </Card>
      )}
      <ScopeRow />
      <Card>
        <div className="stack" style={{ gap: 16 }}>
          <SettingRow label={t("bg.fill")}>
            <Segmented value={s.fill} options={[{ value: "transparent", label: t("bg.fill.transparent") }, { value: "color", label: t("bg.fill.color") }]} onChange={(fill) => patch("background", { fill })} />
          </SettingRow>
          {s.fill === "color" && (
            <SettingRow label={t("bg.color")}>
              <ColorField value={s.color} onChange={(color) => patch("background", { color })} />
              <Button variant="secondary" onClick={() => patch("background", { color: [255, 255, 255] })}>{t("setting.background.white")}</Button>
              <Button variant="secondary" onClick={() => patch("background", { color: [0, 0, 0] })}>{t("setting.background.black")}</Button>
            </SettingRow>
          )}
          <SettingRow label={t("setting.format")} hint={t("bg.lossy.hint")}>
            <Select width={200} value={format} onChange={(f) => patch("background", { format: f })}>{available.map((f) => <option key={f} value={f}>{NAMES[f]}</option>)}</Select>
          </SettingRow>
          <QualityRow quality={s.quality} enabled={lossy} onChange={(quality) => patch("background", { quality })} />
          <SettingRow label={t("bg.edge")} hint={t("bg.edge.hint")}>
            <div className="row grow">
              <Slider value={s.edgeSmoothing} min={0} max={1} onChange={(edgeSmoothing) => patch("background", { edgeSmoothing })} label={t("bg.edge")} />
              <span style={{ width: 44, textAlign: "right" }}>{Math.round(s.edgeSmoothing * 100)}%</span>
            </div>
          </SettingRow>
          <KeepMetadataRow keep={s.keepMetadata} onChange={(keepMetadata) => patch("background", { keepMetadata })} />
          <SettingRow label={t("setting.suffix")}><SuffixField suffix={s.suffix} onChange={(suffix) => patch("background", { suffix })} example={exampleName("photo", s.suffix, extFor(format))} /></SettingRow>
        </div>
      </Card>
      <NoticeCard text={t("bg.quality.note")} icon={ShieldCheck} tone="success" />
      <ProvenanceNotice />
      <ExportSection tool="background" title={runTitle("bg.run", targets.length)} onRun={() => void startBatch("background", { ...s, format })} />
    </Page>
  );
}

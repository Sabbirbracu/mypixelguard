import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { AlertTriangle } from "lucide-react";
import { api } from "../api";
import { useDebouncedTask } from "../hooks";
import { exampleName, extFor, percentSaved, byteString } from "../format";
import { runTitle, t } from "../i18n";
import { useApp } from "../store";
import { BackgroundRow, Card, KeepMetadataRow, NoticeCard, QualityRow, Segmented, SettingRow, SuffixField, ToolHeader } from "../components/ui";
import { ExportSection, Page, ProvenanceNotice, ScopeRow, SelectedImageCard } from "../components/shell";
import type { OutputFormat } from "../types";

const NAMES: Record<OutputFormat, string> = { jpeg: "JPEG", png: "PNG", tiff: "TIFF", webp: "WebP" };

/** Lists formats this PC can't write, so a missing option never looks like a bug. */
export function UnavailableFormatsNote() {
  const caps = useApp((s) => s.caps);
  const missing = caps ? ["HEIC"].concat((["jpeg", "png", "tiff", "webp"] as OutputFormat[]).filter((f) => !caps.formats.includes(f)).map((f) => NAMES[f])) : [];
  return missing.length ? <div className="caption">{t("format.unavailable", missing.join(", "))}</div> : null;
}

export function formatOptions(available: OutputFormat[]) {
  return (["jpeg", "png", "tiff", "webp"] as OutputFormat[]).filter((f) => available.includes(f)).map((f) => ({ value: f, label: NAMES[f] }));
}

export default function ConvertView() {
  const s = useApp((st) => st.convert);
  const patch = useApp((st) => st.patch);
  const caps = useApp((st) => st.caps);
  const startBatch = useApp((st) => st.startBatch);
  const selected = useApp((st) => st.selected());
  const targets = useApp(useShallow((st) => st.toolTargets()));
  const [estimate, setEstimate] = useState<number | null | undefined>(undefined);
  const anyAlpha = targets.some((f) => f.info?.has_alpha);
  const lossy = s.format === "jpeg" || s.format === "webp";

  useDebouncedTask(async (cancelled) => {
    setEstimate(undefined);
    if (!selected?.info) return;
    const size = await api.convertEstimate(selected.path, s).catch(() => null);
    if (!cancelled()) setEstimate(size);
  }, [selected?.path, selected?.info != null, JSON.stringify(s)], 300);

  const extra = selected?.info
    ? estimate === undefined
      ? t("estimate.calculating")
      : estimate
        ? t("estimate.output", byteString(estimate), (() => { const d = percentSaved(selected.info!.file_size, estimate); return d >= 0 ? `−${d}%` : `+${-d}%`; })())
        : null
    : null;

  return (
    <Page>
      <ToolHeader title={t("convert.title")} subtitle={t("convert.subtitle")} />
      {selected?.info && <SelectedImageCard item={selected} extra={extra} />}
      <ScopeRow />
      <Card>
        <div className="stack" style={{ gap: 16 }}>
          <SettingRow label={t("setting.format")}><Segmented value={s.format} options={formatOptions(caps?.formats ?? ["jpeg", "png", "tiff", "webp"])} onChange={(format) => patch("convert", { format })} /></SettingRow>
          <QualityRow quality={s.quality} enabled={lossy} onChange={(quality) => patch("convert", { quality })} />
          {anyAlpha && s.format === "jpeg" && (
            <>
              <NoticeCard text={t("notice.transparency", "JPEG")} icon={AlertTriangle} tone="warning" />
              <BackgroundRow color={s.background} onChange={(background) => patch("convert", { background })} />
            </>
          )}
          <KeepMetadataRow keep={s.keepMetadata} onChange={(keepMetadata) => patch("convert", { keepMetadata })} />
          <SettingRow label={t("setting.suffix")}><SuffixField suffix={s.suffix} onChange={(suffix) => patch("convert", { suffix })} example={exampleName("photo", s.suffix, extFor(s.format))} /></SettingRow>
          <UnavailableFormatsNote />
        </div>
      </Card>
      <ProvenanceNotice />
      <ExportSection tool="convert" title={runTitle("convert.run", targets.length)} onRun={() => void startBatch("convert", s)} />
    </Page>
  );
}

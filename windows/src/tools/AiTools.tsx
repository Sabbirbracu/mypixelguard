import { AlertTriangle, Expand, Frame, LaptopMinimalCheck, Scissors, WandSparkles, type LucideIcon } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { exampleName, extFor } from "../format";
import { runTitle, t } from "../i18n";
import { useApp } from "../store";
import { Card, NoticeCard, QualityRow, Segmented, Select, SettingRow, Switch, SuffixField, ToolHeader } from "../components/ui";
import { ExportSection, Page, ScopeRow, SelectedImageCard } from "../components/shell";
import type { OutputFormat } from "../types";

function Feature({ title, hint, value, onChange, icon: Icon }: { title: string; hint: string; value: boolean; onChange: (v: boolean) => void; icon: LucideIcon }) {
  return (
    <label className="row top" style={{ gap: 12, cursor: "pointer" }}>
      <Switch checked={value} onChange={onChange} label={title} />
      <Icon size={20} color="var(--orange)" style={{ flex: "none", marginTop: 1 }} />
      <div><div style={{ fontWeight: 600 }}>{title}</div><div className="caption">{hint}</div></div>
    </label>
  );
}

export default function AiToolsView() {
  const s = useApp((st) => st.ai);
  const patch = useApp((st) => st.patch);
  const caps = useApp((st) => st.caps);
  const startBatch = useApp((st) => st.startBatch);
  const selected = useApp((st) => st.selected());
  const targets = useApp(useShallow((st) => st.toolTargets()));
  const modelMissing = caps != null && !caps.backgroundModel;
  const format = s.removeBackground && s.format === "jpeg" ? "png" : s.format;

  return (
    <Page>
      <ToolHeader title={t("ai.title")} subtitle={t("ai.subtitle")} />
      {selected && <SelectedImageCard item={selected} />}
      <ScopeRow />
      <Card>
        <div className="stack" style={{ gap: 16 }}>
          <Feature title={t("ai.enhance")} hint={t("ai.enhance.hint")} value={s.enhance} onChange={(enhance) => patch("ai", { enhance })} icon={WandSparkles} />
          <Feature title={t("ai.upscale")} hint={t("ai.upscale.hint")} value={s.upscale} onChange={(upscale) => patch("ai", { upscale })} icon={Expand} />
          {s.upscale && (
            <SettingRow label={t("ai.scale")}>
              <Segmented value={s.upscaleFactor} options={[2, 3, 4].map((n) => ({ value: n, label: `${n}×` }))} onChange={(upscaleFactor) => patch("ai", { upscaleFactor })} />
            </SettingRow>
          )}
          <Feature title={t("ai.smartCrop")} hint={t("ai.smartCrop.hint")} value={s.smartCrop} onChange={(smartCrop) => patch("ai", { smartCrop })} icon={Frame} />
          {s.smartCrop && (
            <SettingRow label={t("ai.aspect")}>
              <Segmented value={s.cropAspect} options={(["square", "portrait", "landscape"] as const).map((a) => ({ value: a, label: t(`ai.aspect.${a}`) }))} onChange={(cropAspect) => patch("ai", { cropAspect })} />
            </SettingRow>
          )}
          <Feature title={t("ai.background")} hint={t("ai.background.hint")} value={s.removeBackground} onChange={(removeBackground) => patch("ai", { removeBackground })} icon={Scissors} />
          {s.removeBackground && modelMissing && <NoticeCard text={t("ai.background.unavailable")} icon={AlertTriangle} tone="warning" />}
          <hr className="divider" />
          <SettingRow label={t("setting.outputFormat")}>
            <Select width={240} value={format ?? ""} onChange={(v) => patch("ai", { format: (v || null) as OutputFormat | null })}>
              <option value="">{t("format.same")}</option>
              {(["jpeg", "png", "tiff", "webp"] as OutputFormat[]).filter((f) => caps?.formats.includes(f) ?? true).map((f) => <option key={f} value={f}>{f === "webp" ? "WebP" : f.toUpperCase()}</option>)}
            </Select>
          </SettingRow>
          <QualityRow quality={s.quality} onChange={(quality) => patch("ai", { quality })} />
          <SettingRow label={t("studio.cleanMetadata")}><Switch checked={s.cleanMetadata} onChange={(cleanMetadata) => patch("ai", { cleanMetadata })} label={t("studio.cleanMetadata")} /></SettingRow>
          <SettingRow label={t("setting.suffix")}><SuffixField suffix={s.suffix} onChange={(suffix) => patch("ai", { suffix })} example={exampleName("photo", s.suffix, extFor(format ?? "png", "png"))} /></SettingRow>
        </div>
      </Card>
      <NoticeCard text={t("ai.local")} icon={LaptopMinimalCheck} tone="success" />
      <ExportSection tool="enhance" title={runTitle("ai.run", targets.length)} onRun={() => void startBatch("enhance", s)} />
    </Page>
  );
}

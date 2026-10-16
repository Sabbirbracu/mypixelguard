import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { AlertTriangle, Lock, LockOpen } from "lucide-react";
import { api } from "../api";
import { exampleName, extFor } from "../format";
import { runTitle, t } from "../i18n";
import { useApp } from "../store";
import { BackgroundRow, Button, Card, KeepMetadataRow, NoticeCard, NumberField, QualityRow, Segmented, Select, SettingRow, Slider, Switch, SuffixField, ToolHeader, Modal } from "../components/ui";
import { ExportSection, Page, ProvenanceNotice, ScopeRow, SelectedImageCard } from "../components/shell";
import { UnavailableFormatsNote } from "./Convert";
import type { OutputFormat, ResizePlan } from "../types";

const FORMATS: OutputFormat[] = ["jpeg", "png", "tiff", "webp"];

export default function ResizeView() {
  const s = useApp((st) => st.resize);
  const patch = useApp((st) => st.patch);
  const caps = useApp((st) => st.caps);
  const presets = useApp(useShallow((st) => st.allPresets()));
  const savePreset = useApp((st) => st.savePreset);
  const deletePreset = useApp((st) => st.deletePreset);
  const startBatch = useApp((st) => st.startBatch);
  const selected = useApp((st) => st.selected());
  const targets = useApp(useShallow((st) => st.toolTargets()));
  const [plan, setPlan] = useState<ResizePlan | null>(null);
  const [enlarged, setEnlarged] = useState(0);
  const [naming, setNaming] = useState(false);
  const [presetName, setPresetName] = useState("");
  const anyAlpha = targets.some((f) => f.info?.has_alpha);
  const size = selected?.info ? ([selected.info.width, selected.info.height] as [number, number]) : null;
  const key = JSON.stringify(s);

  useEffect(() => {
    let dead = false;
    (async () => {
      setPlan(size ? await api.resizePlan(size, s).catch(() => null) : null);
      const plans = await Promise.all(targets.filter((f) => f.info).map((f) => api.resizePlan([f.info!.width, f.info!.height], s).catch(() => null)));
      if (!dead) setEnlarged(plans.filter((p) => p?.enlarges).length);
    })().then(() => undefined);
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, size?.[0], size?.[1], targets.length]);

  const matching = !s.lockAspect ? presets.find((p) => p.width === s.width && p.height === s.height) : undefined;

  const setWidth = (v: number) => {
    const next: Partial<typeof s> = { width: Math.max(v, 1), driver: "width" };
    if (s.lockAspect && size) next.height = Math.max(Math.round((v * size[1]) / size[0]), 1);
    patch("resize", next);
  };
  const setHeight = (v: number) => {
    const next: Partial<typeof s> = { height: Math.max(v, 1), driver: "height" };
    if (s.lockAspect && size) next.width = Math.max(Math.round((v * size[0]) / size[1]), 1);
    patch("resize", next);
  };
  const toggleLock = () => {
    const lockAspect = !s.lockAspect;
    patch("resize", { lockAspect });
    if (lockAspect) (s.driver === "width" ? setWidth : setHeight)(s.driver === "width" ? s.width : s.height);
  };

  let resultText: string | null = null;
  if (size && plan) {
    if (plan.unchanged) resultText = t("resize.result.unchanged", size[0], size[1]);
    else {
      const cropped = plan.draw.w > plan.canvas_width + 0.5 || plan.draw.h > plan.canvas_height + 0.5;
      resultText = t(cropped ? "resize.result.cropped" : "resize.result", size[0], size[1], plan.canvas_width, plan.canvas_height);
    }
  }
  const out = s.outputFormat;
  const ext = extFor(out ?? "jpeg");

  return (
    <Page>
      <ToolHeader title={t("resize.title")} subtitle={t("resize.subtitle")} />
      {selected?.info && <SelectedImageCard item={selected} extra={resultText} />}
      <ScopeRow />
      <Card>
        <div className="stack" style={{ gap: 16 }}>
          <SettingRow label={t("setting.resizeBy")}>
            <Segmented value={s.mode} options={[{ value: "pixels", label: t("resize.mode.pixels") }, { value: "percent", label: t("resize.mode.percent") }]} onChange={(mode) => patch("resize", { mode })} />
          </SettingRow>

          {s.mode === "pixels" ? (
            <>
              <SettingRow label={t("setting.preset")} hint={t("setting.preset.hint")}>
                <div className="stack" style={{ gap: 8 }}>
                  <Select width={340} value={matching?.id ?? ""} onChange={(id) => { const p = presets.find((x) => x.id === id); if (p) patch("resize", { width: p.width, height: p.height, lockAspect: false }); }}>
                    <option value="">{t("preset.custom")}</option>
                    {presets.map((p) => <option key={p.id} value={p.id}>{`${p.isBuiltIn ? t(`preset.${p.name}`) : p.name} · ${p.width}×${p.height}`}</option>)}
                  </Select>
                  <div className="row">
                    <Button variant="secondary" onClick={() => { setPresetName(""); setNaming(true); }}>{t("preset.save")}</Button>
                    {matching && !matching.isBuiltIn && <Button variant="secondary" onClick={() => deletePreset(matching.id)}>{t("preset.delete")}</Button>}
                  </div>
                </div>
              </SettingRow>
              <SettingRow label={t("setting.dimensions")}>
                <NumberField value={s.width} onChange={setWidth} label={t("setting.width")} />
                <button type="button" className="icon-btn bare" title={t("setting.lock")} aria-label={t("setting.lock")} aria-pressed={s.lockAspect} onClick={toggleLock}>
                  {s.lockAspect ? <Lock size={17} color="var(--accent-text)" /> : <LockOpen size={17} />}
                </button>
                <NumberField value={s.height} onChange={setHeight} label={t("setting.height")} />
                <span className="muted">px</span>
              </SettingRow>
              {!s.lockAspect && (
                <SettingRow label={t("setting.fit")} hint={t(`fit.${s.fit}.hint`)}>
                  <Segmented value={s.fit} options={(["fit", "fill", "stretch"] as const).map((f) => ({ value: f, label: t(`fit.${f}`) }))} onChange={(fit) => patch("resize", { fit })} />
                </SettingRow>
              )}
            </>
          ) : (
            <SettingRow label={t("setting.percent")}>
              <div className="stack grow" style={{ gap: 8 }}>
                <div className="row"><Slider value={s.percent} min={10} max={300} step={1} onChange={(percent) => patch("resize", { percent })} label={t("setting.percent")} /><span style={{ width: 52, textAlign: "right" }}>{Math.round(s.percent)}%</span></div>
                <div className="row" style={{ gap: 6 }}>{[25, 50, 75, 150, 200].map((p) => <Button key={p} variant="secondary" onClick={() => patch("resize", { percent: p })}>{p}%</Button>)}</div>
              </div>
            </SettingRow>
          )}
          <SettingRow label={t("setting.neverEnlarge")} hint={t("setting.neverEnlarge.hint")}><Switch checked={s.neverEnlarge} onChange={(neverEnlarge) => patch("resize", { neverEnlarge })} label={t("setting.neverEnlarge")} /></SettingRow>

          <SettingRow label={t("setting.outputFormat")}>
            <Select width={220} value={out ?? ""} onChange={(v) => patch("resize", { outputFormat: (v || null) as OutputFormat | null })}>
              <option value="">{t("format.same")}</option>
              {FORMATS.filter((f) => caps?.formats.includes(f) ?? true).map((f) => <option key={f} value={f}>{f === "webp" ? "WebP" : f.toUpperCase()}</option>)}
            </Select>
          </SettingRow>
          {(out === null || out === "jpeg" || out === "webp") && <QualityRow quality={s.quality} onChange={(quality) => patch("resize", { quality })} />}
          {anyAlpha && out === "jpeg" && <BackgroundRow color={s.background} onChange={(background) => patch("resize", { background })} />}
          <KeepMetadataRow keep={s.keepMetadata} onChange={(keepMetadata) => patch("resize", { keepMetadata })} />
          <SettingRow label={t("setting.suffix")}><SuffixField suffix={s.suffix} onChange={(suffix) => patch("resize", { suffix })} example={exampleName("photo", s.suffix, ext)} /></SettingRow>
          <UnavailableFormatsNote />
        </div>
      </Card>
      {enlarged > 0 && <NoticeCard text={t("notice.upscale", enlarged)} icon={AlertTriangle} tone="warning" />}
      <ProvenanceNotice />
      <ExportSection tool="resize" title={runTitle("resize.run", targets.length)} onRun={() => void startBatch("resize", s)} />
      {naming && (
        <Modal onClose={() => setNaming(false)} width={420}>
          <div className="pad stack">
            <div className="h-sub">{t("preset.save.title")}</div>
            <div className="muted">{t("preset.save.message", s.width, s.height)}</div>
            <input className="field" autoFocus type="text" value={presetName} placeholder={t("preset.save.placeholder")} style={{ width: "100%" }} onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && presetName.trim()) { savePreset(presetName.trim(), s.width, s.height); setNaming(false); } }} />
            <div className="row"><div className="spacer" />
              <Button variant="secondary" onClick={() => setNaming(false)}>{t("common.cancel")}</Button>
              <Button disabled={!presetName.trim()} onClick={() => { savePreset(presetName.trim(), s.width, s.height); setNaming(false); }}>{t("common.save")}</Button>
            </div>
          </div>
        </Modal>
      )}
    </Page>
  );
}

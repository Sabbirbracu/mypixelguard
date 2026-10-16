import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ListChecks } from "lucide-react";
import { runTitle, t } from "../i18n";
import { useApp } from "../store";
import { Button, Card, KeepMetadataRow, NoticeCard, QualityRow, Select, SettingRow, Modal, Switch, SuffixField, ToolHeader, NumberField } from "../components/ui";
import { ExportSection, Page, ProvenanceNotice, ScopeRow, SelectedImageCard } from "../components/shell";
import { exampleName, extFor } from "../format";
import type { ImageRecipe, OutputFormat } from "../types";

export default function StudioView() {
  const recipes = useApp(useShallow((st) => st.allRecipes()));
  const recipeId = useApp((st) => st.selectedRecipeId);
  const base = useApp((st) => st.selectedRecipe());
  const caps = useApp((st) => st.caps);
  const { selectRecipe, saveRecipe, deleteSelectedRecipe, startBatch } = useApp();
  const selected = useApp((st) => st.selected());
  const targets = useApp(useShallow((st) => st.toolTargets()));
  // Edits are made on a working copy of the chosen recipe and only stored via "Save as new recipe".
  const [draft, setDraft] = useState<{ id: string; r: ImageRecipe } | null>(null);
  const recipe = draft && draft.id === recipeId ? draft.r : base;
  const edit = (change: Partial<ImageRecipe>) => setDraft({ id: recipeId, r: { ...recipe, ...change } });
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const label = (r: ImageRecipe) => (r.isBuiltIn ? t(`recipe.${r.name}`) : r.name);
  const ext = extFor(recipe.format ?? selected?.info?.format ?? "jpeg");

  const commitSave = () => { if (name.trim()) { saveRecipe({ ...recipe, name: name.trim() }); setDraft(null); setNaming(false); } };

  return (
    <Page>
      <ToolHeader title={t("studio.title")} subtitle={t("studio.subtitle")} />
      {selected && <SelectedImageCard item={selected} />}
      <ScopeRow />
      <Card>
        <div className="stack" style={{ gap: 16 }}>
          <SettingRow label={t("studio.recipe")}>
            <Select width={320} value={recipeId} onChange={(id) => { setDraft(null); selectRecipe(id); }}>
              {recipes.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}
            </Select>
          </SettingRow>
          <hr className="divider" />
          <SettingRow label={t("setting.outputFormat")}>
            <Select width={240} value={recipe.format ?? ""} onChange={(v) => edit({ format: (v || null) as OutputFormat | null })}>
              <option value="">{t("format.same")}</option>
              {(["jpeg", "png", "tiff", "webp"] as OutputFormat[]).filter((f) => caps?.formats.includes(f) ?? true).map((f) => <option key={f} value={f}>{f === "webp" ? "WebP" : f.toUpperCase()}</option>)}
            </Select>
          </SettingRow>
          <label className="row" style={{ gap: 10 }}>
            <Switch checked={recipe.width != null} label={t("studio.resize")} onChange={(on) => edit(on ? { width: recipe.width ?? 1600, height: recipe.height ?? 1600 } : { width: null, height: null })} />
            <span>{t("studio.resize")}</span>
          </label>
          {recipe.width != null && (
            <SettingRow label={t("setting.dimensions")}>
              <NumberField value={recipe.width} onChange={(width) => edit({ width })} label={t("setting.width")} />
              <span>×</span>
              <NumberField value={recipe.height ?? recipe.width} onChange={(height) => edit({ height })} label={t("setting.height")} />
            </SettingRow>
          )}
          <label className="row" style={{ gap: 10 }}>
            <Switch checked={recipe.targetKB != null} label={t("studio.target")} onChange={(on) => edit({ targetKB: on ? recipe.targetKB ?? 500 : null })} />
            <span>{t("studio.target")}</span>
          </label>
          {recipe.targetKB != null && (
            <SettingRow label={t("setting.targetSize")}><NumberField value={recipe.targetKB} onChange={(targetKB) => edit({ targetKB })} label="KB" width={110} /><span className="muted">KB</span></SettingRow>
          )}
          <QualityRow quality={recipe.quality} onChange={(quality) => edit({ quality })} />
          <SettingRow label={t("studio.cleanMetadata")}><Switch checked={recipe.cleanMetadata} onChange={(cleanMetadata) => edit({ cleanMetadata })} label={t("studio.cleanMetadata")} /></SettingRow>
          <SettingRow label={t("setting.suffix")}><SuffixField suffix={recipe.suffix} onChange={(suffix) => edit({ suffix })} example={exampleName("photo", recipe.suffix, ext)} /></SettingRow>
          <div className="row">
            <Button variant="secondary" onClick={() => { setName(""); setNaming(true); }}>{t("studio.saveRecipe")}</Button>
            {!base.isBuiltIn && <Button variant="secondary" onClick={() => { setDraft(null); deleteSelectedRecipe(); }}>{t("studio.deleteRecipe")}</Button>}
          </div>
        </div>
      </Card>
      <NoticeCard text={t("studio.workflow")} icon={ListChecks} tone="success" />
      <ProvenanceNotice />
      <ExportSection tool="studio" title={runTitle("studio.run", targets.length)} onRun={() => void startBatch("studio", recipe)} />
      {naming && (
        <Modal onClose={() => setNaming(false)} width={420}>
          <div className="pad stack">
            <div className="h-sub">{t("studio.saveRecipe")}</div>
            <div className="muted">{t("studio.saveMessage")}</div>
            <input className="field" autoFocus type="text" value={name} placeholder={t("studio.name")} style={{ width: "100%" }} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && commitSave()} />
            <div className="row"><div className="spacer" /><Button variant="secondary" onClick={() => setNaming(false)}>{t("common.cancel")}</Button><Button disabled={!name.trim()} onClick={commitSave}>{t("common.save")}</Button></div>
          </div>
        </Modal>
      )}
    </Page>
  );
}
export { KeepMetadataRow };

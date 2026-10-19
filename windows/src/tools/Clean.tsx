// Clean: the file card, grouped switches for what to remove, a preview and a change summary, and a
// "Save to" + "Clean & Save" bar. Mirrors CleanViews.swift.
import {
  ArrowRight, BadgeCheck, Camera, CheckCircle2, ChevronsUpDown, Code2, Eye, FileText, Folder, Info, Layers, List, LockKeyhole, MapPin, MessageSquareText,
  Navigation, Palette, RotateCcw, ShieldCheck, Sparkles, Users, X, XCircle, type LucideIcon,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { byteString, dirName } from "../format";
import { currentLanguage, errorText, t } from "../i18n";
import { CLEAN_DEFAULT_FIELDS, useApp, type FileItem } from "../store";
import { BatchView } from "../components/shell";
import { Button, Card, CardHeader, Chip, Spinner, Switch, useRunShortcut } from "../components/ui";
import { DEFAULT_REMOVAL, type Analysis, type MetaCategory, type PrivateField } from "../types";
import { CleanResultCard, bytesIn } from "./privacy";

// MARK: Choices

type CleanItem = "gps" | "device" | "author" | "c2pa" | "xmp" | "exif" | "comments" | "icc";
type Group = "basic" | "content" | "other";
const ITEMS: CleanItem[] = ["gps", "device", "author", "c2pa", "xmp", "exif", "comments", "icc"];
const GROUPS: Group[] = ["basic", "content", "other"];
const GROUP_OF: Record<CleanItem, Group> = { gps: "basic", device: "basic", author: "basic", c2pa: "content", xmp: "content", exif: "content", comments: "other", icc: "other" };
const GROUP_ICON: Record<Group, LucideIcon> = { basic: LockKeyhole, content: FileText, other: Code2 };
const ITEM_ICON: Record<CleanItem, LucideIcon> = { gps: Navigation, device: Camera, author: Users, c2pa: BadgeCheck, xmp: FileText, exif: Camera, comments: MessageSquareText, icc: Palette };
const FIELD_OF: Partial<Record<CleanItem, PrivateField>> = { gps: "location", device: "device", author: "author" };
const CATEGORIES_OF: Partial<Record<CleanItem, MetaCategory[]>> = { c2pa: ["c2pa"], xmp: ["xmp"], exif: ["exif"], comments: ["iptc", "other"], icc: ["icc"] };

/** True when removing these whole blocks already wipes this field (same rule as `PrivateField::is_covered_by`). */
function covered(field: PrivateField, remove: MetaCategory[]): boolean {
  const has = (c: MetaCategory) => remove.includes(c);
  switch (field) {
    case "location": case "device": return has("exif");
    case "author": return has("exif") && has("xmp") && has("iptc");
    default: return has("exif") && has("xmp");
  }
}

function isPresent(item: CleanItem, a: Analysis): boolean {
  switch (item) {
    case "gps": return a.privacy_facts.some((f) => f.kind === "location");
    case "device": return a.privacy_facts.some((f) => f.kind === "device");
    case "author": return a.privacy_facts.some((f) => f.kind === "author");
    case "c2pa": return a.has_provenance;
    default: return (CATEGORIES_OF[item] ?? []).some((c) => bytesIn(a, c) > 0);
  }
}
const itemBytes = (item: CleanItem, a: Analysis) => (CATEGORIES_OF[item] ?? []).reduce((n, c) => n + bytesIn(a, c), 0);

function useCleanChoices() {
  const remove = useApp((s) => s.remove);
  const fields = useApp((s) => s.cleanFields);
  const setRemove = useApp((s) => s.setRemove);
  const setFields = useApp((s) => s.setCleanFields);
  const isOn = (item: CleanItem) => {
    const f = FIELD_OF[item];
    return f ? fields.includes(f) || covered(f, remove) : (CATEGORIES_OF[item] ?? []).every((c) => remove.includes(c));
  };
  const set = (item: CleanItem, on: boolean) => {
    const f = FIELD_OF[item];
    if (f) setFields(on ? [...new Set([...fields, f])] : fields.filter((x) => x !== f));
    else {
      const cats = CATEGORIES_OF[item] ?? [];
      setRemove(on ? [...new Set([...remove, ...cats])] : remove.filter((c) => !cats.includes(c)));
    }
  };
  const sameSet = <T,>(x: T[], y: T[]) => x.length === y.length && y.every((v) => x.includes(v));
  const isRecommended = sameSet(remove, DEFAULT_REMOVAL) && sameSet(fields, CLEAN_DEFAULT_FIELDS);
  const reset = () => { setRemove([...DEFAULT_REMOVAL]); setFields([...CLEAN_DEFAULT_FIELDS]); };
  const isCovered = (item: CleanItem) => { const f = FIELD_OF[item]; return f ? covered(f, remove) : false; };
  const counts = (a: Analysis) => {
    const present = ITEMS.filter((i) => isPresent(i, a));
    const removing = present.filter(isOn).length;
    return { removing, keeping: present.length - removing };
  };
  return { isOn, set, isRecommended, reset, isCovered, counts };
}

// MARK: Entry

export default function CleanView() {
  const item = useApp((s) => s.selected());
  if (!item) return <div className="muted" style={{ flex: 1, display: "grid", placeItems: "center" }}>{t("detail.selectImage")}</div>;
  return <CleanItemView key={item.id} item={item} />;
}

function CleanItemView({ item }: { item: FileItem }) {
  const batch = useApp((s) => s.batch);
  const a = item.analysis;
  const scanning = item.status.kind === "scanning";
  return (
    <>
      <div className="scroll">
        <div className="clean-page">
          {scanning ? (
            <div className="row" style={{ justifyContent: "center", padding: 48, gap: 10 }}><Spinner />{t("detail.reading")}</div>
          ) : a ? (
            <>
              <FileCard item={item} a={a} />
              <CleanResultCard item={item} a={a} />
              {batch?.tool === "clean" && <BatchView batch={batch} />}
              <div className="clean-layout">
                <OptionsCard a={a} />
                <div className="clean-side">
                  <PreviewCard item={item} />
                  <ChangeSummary a={a} />
                </div>
              </div>
            </>
          ) : item.status.kind === "failed" ? (
            <Card><div className="row" style={{ color: "var(--danger)" }}><XCircle size={18} />{errorText(item.status.error)}</div></Card>
          ) : item.analysisError ? (
            <Card><div className="row muted"><Info size={16} />{errorText(item.analysisError)}</div></Card>
          ) : null}
        </div>
      </div>
      {a && !scanning && <CleanFooter item={item} a={a} />}
    </>
  );
}

// MARK: File card

function FileCard({ item, a }: { item: FileItem; a: Analysis }) {
  const removeFile = useApp((s) => s.removeFile);
  const location = a.privacy_facts.find((f) => f.kind === "location");
  const day = (ms: number) => new Date(ms).toLocaleDateString(currentLanguage() === "bn" ? "bn-BD" : "en-US", { year: "numeric", month: "short", day: "numeric" });
  const dates = [item.created != null && `${t("clean.created")}: ${day(item.created)}`, item.modified != null && `${t("clean.modified")}: ${day(item.modified)}`].filter(Boolean).join("  ·  ");
  return (
    <div className="file-card">
      <div className="thumb96">{item.thumb && <img src={item.thumb} alt="" />}</div>
      <div className="vdiv" />
      <div className="grow stack" style={{ gap: 8, padding: "0 16px" }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="headline truncate selectable">{item.name}</span>
          <button type="button" className="x-btn" title={t("action.removeFromList")} aria-label={t("action.removeFromList")} onClick={() => removeFile(item.id)}><X size={12} strokeWidth={3} /></button>
        </div>
        <div className="row" style={{ gap: 6 }}><Chip text={a.kind} /><Chip text={`${a.width} × ${a.height}`} /><Chip text={byteString(a.file_size)} /></div>
        {dates && <div className="caption truncate">{dates}</div>}
      </div>
      {location && <LocationPanel value={location.value} />}
    </div>
  );
}

/** "23.810300° N, 90.412500° E" → signed coordinates for a map link. */
function mapUrl(value: string): string | null {
  const parts = value.split(",");
  if (parts.length !== 2) return null;
  const num = (s: string) => {
    const v = Number(s.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(v) ? (/[SW]/.test(s) ? -Math.abs(v) : v) : null;
  };
  const lat = num(parts[0]), lon = num(parts[1]);
  return lat == null || lon == null ? null : `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`;
}

function LocationPanel({ value }: { value: string }) {
  const url = mapUrl(value);
  return (
    <div className="loc-panel">
      <div className="grow stack" style={{ gap: 4 }}>
        <div className="caption row" style={{ gap: 6 }}><MapPin size={13} color="var(--orange)" />{t("clean.originalLocation")}</div>
        <div style={{ fontWeight: 500 }}>{value}</div>
        {url && <button type="button" className="link-btn caption" style={{ fontWeight: 600, fontSize: 11.5 }} onClick={() => void openUrl(url)}>{t("clean.viewOnMap")}<ArrowRight size={12} /></button>}
      </div>
      {/* An offline stand-in for a map: faint streets plus a pin. */}
      <svg className="map-tile" viewBox="0 0 64 64" aria-hidden="true">
        <g stroke="color-mix(in srgb, var(--secondary) 28%, transparent)" strokeWidth="2">
          <line x1="0" y1="40" x2="64" y2="19" /><line x1="22" y1="0" x2="35" y2="64" /><line x1="0" y1="10" x2="64" y2="54" />
        </g>
        <circle cx="32" cy="32" r="11" fill="var(--orange)" /><circle cx="32" cy="32" r="4" fill="var(--surface)" />
      </svg>
    </div>
  );
}

// MARK: Options

function OptionsCard({ a }: { a: Analysis }) {
  const c = useCleanChoices();
  return (
    <Card>
      <div className="stack" style={{ gap: 14 }}>
        <CardHeader icon={ShieldCheck} title={t("clean.options.title")} subtitle={t("clean.options.text")}>
          <Button variant="secondary" icon={RotateCcw} disabled={c.isRecommended} onClick={c.reset}>{t("options.reset")}</Button>
        </CardHeader>
        {GROUPS.map((g) => {
          const items = ITEMS.filter((i) => GROUP_OF[i] === g);
          const GIcon = GROUP_ICON[g];
          return (
            <div key={g} className="group-panel">
              <div className="group-head">
                <div className="icon-tile" style={{ ["--tint" as string]: "var(--accent-text)", width: 30, height: 30 }}><GIcon size={14} /></div>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{t(`clean.group.${g}`)}</div>
                  <div className="caption">{t(`clean.group.${g}.text`)}</div>
                </div>
                <span className="tag" style={{ ["--tag" as string]: "var(--accent-text)" }}>{t("clean.selected", items.filter(c.isOn).length)}</span>
              </div>
              {items.map((i) => {
                const present = isPresent(i, a);
                const cov = c.isCovered(i);
                const Icon = ITEM_ICON[i];
                return (
                  <div key={i} className={`clean-row ${present ? "" : "absent"}`}>
                    <div className="icon-tile sm" style={{ ["--tint" as string]: present ? "var(--accent-text)" : "var(--secondary)" }}><Icon size={13} /></div>
                    <div className="grow">
                      <div style={{ fontWeight: 500 }}>{t(`clean.item.${i}`)}</div>
                      <div className="caption">{cov ? t("clean.included") : t(`clean.item.${i}.text`)}</div>
                    </div>
                    <Switch checked={c.isOn(i)} disabled={cov} onChange={(v) => c.set(i, v)} label={t(`clean.item.${i}`)} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function PreviewCard({ item }: { item: FileItem }) {
  const pane = (label: string, after: boolean) => (
    <div className={`cmp-pane ${after ? "after" : ""}`}>
      {item.thumb && <img src={item.thumb} alt="" />}
      <span className="lbl">{label}</span>
    </div>
  );
  return (
    <Card>
      <div className="stack" style={{ gap: 12 }}>
        <CardHeader icon={Eye} title={t("clean.preview.title")} subtitle={t("clean.preview.text")} />
        <div className="row" style={{ gap: 8 }}>
          {pane(t("clean.preview.original"), false)}
          <span className="arrow-dot"><ArrowRight size={12} strokeWidth={3} /></span>
          {pane(t("clean.preview.after"), true)}
        </div>
      </div>
    </Card>
  );
}

function ChangeSummary({ a }: { a: Analysis }) {
  const c = useCleanChoices();
  const present = ITEMS.filter((i) => isPresent(i, a));
  return (
    <Card>
      <div className="stack" style={{ gap: 12 }}>
        <CardHeader icon={List} title={t("clean.changes.title")} subtitle={t("clean.changes.text")} />
        {present.length === 0 ? (
          <div className="row" style={{ gap: 8, color: "var(--success)", fontWeight: 500 }}><ShieldCheck size={16} />{t("clean.nothingFound")}</div>
        ) : (
          <div className="summary-list">
            {present.map((i) => {
              const Icon = ITEM_ICON[i];
              const removing = c.isOn(i);
              const bytes = itemBytes(i, a);
              return (
                <div key={i} className="summary-row">
                  <div className="icon-tile xs" style={{ ["--tint" as string]: "var(--accent-text)" }}><Icon size={12} /></div>
                  <span className="grow truncate">{t(`clean.item.${i}`)}</span>
                  {bytes > 0 && <span className="caption tnum">{byteString(bytes)}</span>}
                  <span className="tag" style={{ ["--tag" as string]: removing ? "var(--accent-text)" : "var(--success)" }}>{removing ? t("clean.removed") : t("clean.kept")}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="private-note"><ShieldCheck size={14} style={{ flex: "none" }} />{t("clean.private")}</div>
      </div>
    </Card>
  );
}

// MARK: Footer

function CleanFooter({ item, a }: { item: FileItem; a: Analysis }) {
  const { files, isCleaning, cleanSelected, cleanAll, cancelCleaning, saveFolder, chooseSaveFolder } = useApp();
  const { counts } = useCleanChoices();
  useRunShortcut(() => void cleanSelected(), !isCleaning);
  const n = counts(a);
  const ready = files.filter((f) => f.analysis).length;
  const folder = saveFolder ?? dirName(item.path);
  return (
    <div className="tool-footer shadow">
      <div className="inner wide" style={{ gap: 16 }}>
        <button type="button" className="save-to" disabled={isCleaning} title={folder} onClick={() => void chooseSaveFolder(dirName(item.path))}>
          <Folder size={16} style={{ flex: "none" }} />
          <span className="muted" style={{ whiteSpace: "nowrap" }}>{t("clean.saveTo")}</span>
          <span className="path">{folder}</span>
          <ChevronsUpDown size={13} color="var(--secondary)" style={{ flex: "none" }} />
        </button>
        <div className="spacer" />
        <div className="row" style={{ gap: 8, whiteSpace: "nowrap" }}>
          <CheckCircle2 size={16} color="var(--orange)" />
          <span style={{ fontWeight: 500 }}>{t(n.removing === 1 ? "clean.count.removed.one" : "clean.count.removed", n.removing)}</span>
          {n.keeping > 0 && <><span className="muted">•</span><span className="muted">{t(n.keeping === 1 ? "clean.count.kept.one" : "clean.count.kept", n.keeping)}</span></>}
        </div>
        {isCleaning && <><Spinner small /><Button variant="secondary" onClick={cancelCleaning}>{t("common.cancel")}</Button></>}
        {ready > 1 && <Button variant="secondary" icon={Layers} disabled={isCleaning} onClick={() => void cleanAll()}>{t("clean.all", ready)}</Button>}
        <button type="button" className="btn xl" disabled={isCleaning} onClick={() => void cleanSelected()}><Sparkles size={19} />{item.status.kind === "cleaned" ? t("clean.again") : t("clean.run")}</button>
      </div>
    </div>
  );
}

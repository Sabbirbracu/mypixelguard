import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Info, Lock, type LucideIcon } from "lucide-react";
import { t } from "../i18n";
import { hexOf, rgbOf } from "../format";
import type { OutputFormat, RGB } from "../types";

export const toneColor = {
  success: "var(--success)", warning: "var(--warning)", danger: "var(--danger)", info: "var(--info)",
  orange: "var(--accent-text)", secondary: "var(--secondary)",
} as const;
export type Tone = keyof typeof toneColor;

export function Card({ children, tight, className = "", style }: { children: ReactNode; tight?: boolean; className?: string; style?: CSSProperties }) {
  return <div className={`card ${tight ? "tight" : ""} ${className}`} style={style}>{children}</div>;
}

export function Chip({ text, tone = "secondary" }: { text: string; tone?: Tone }) {
  return <span className="chip" style={{ ["--chip" as string]: toneColor[tone] }}>{text}</span>;
}

export function ToolHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="tool-header">
      <div className="bar" />
      <div>
        <h1 className="h-title">{title}</h1>
        <div className="muted" style={{ fontSize: 14 }}>{subtitle}</div>
      </div>
    </header>
  );
}

export function SectionTitle({ text }: { text: string }) {
  return <h2 className="h-sub">{text}</h2>;
}

export function CardHeader({ icon: Icon, title, subtitle, children }: { icon: LucideIcon; title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="card-header">
      <div className="tile"><Icon size={16} /></div>
      <div className="grow">
        <div className="h-sub">{title}</div>
        {subtitle && <div className="caption">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

export function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="setting">
      <div className="label"><b>{label}</b>{hint && <span className="caption">{hint}</span>}</div>
      <div className="ctl">{children}</div>
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className="switch" onClick={() => onChange(!checked)} />;
}

export function Segmented<T extends string | number>({ value, options, onChange, disabled }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean;
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} disabled={disabled} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Button({ variant = "primary", icon: Icon, children, ...rest }: {
  variant?: "primary" | "secondary" | "large" | "link"; icon?: LucideIcon; children?: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`btn ${variant === "primary" ? "" : variant}`} {...rest}>
      {Icon && <Icon size={variant === "large" ? 18 : 15} />}
      {children}
    </button>
  );
}

export function NoticeCard({ text, icon: Icon = Info, tone = "info" }: { text: string; icon?: LucideIcon; tone?: Tone }) {
  return (
    <Card tight>
      <div className="notice">
        <Icon size={17} color={toneColor[tone]} />
        <span>{text}</span>
      </div>
    </Card>
  );
}

export function Callout({ text, tone = "warning" }: { text: string; tone?: "warning" | "success" | "danger" | "info" }) {
  return <div className={`callout tone-${tone}`}><AlertTriangle size={16} style={{ flex: "none", marginTop: 2 }} /><span>{text}</span></div>;
}

export function Spinner({ small }: { small?: boolean }) {
  return <span className={`spinner ${small ? "sm" : ""}`} role="progressbar" aria-label="…" />;
}

export function ProgressBar({ value, total }: { value: number; total: number }) {
  return <div className="progress"><div style={{ width: `${(value / Math.max(total, 1)) * 100}%` }} /></div>;
}

export function Slider({ value, min, max, step = 0.01, onChange, label, disabled }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; disabled?: boolean;
}) {
  return <input type="range" value={value} min={min} max={max} step={step} aria-label={label} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />;
}

export function NumberField({ value, onChange, label, min = 1, width = 90 }: { value: number; onChange: (v: number) => void; label: string; min?: number; width?: number }) {
  return (
    <input className="field num" style={{ width }} type="number" min={min} value={Number.isFinite(value) ? value : ""} aria-label={label}
      onChange={(e) => onChange(Math.max(min, Math.round(Number(e.target.value) || min)))} />
  );
}

export function ColorField({ value, onChange }: { value: RGB; onChange: (c: RGB) => void }) {
  return <input type="color" value={hexOf(value)} onChange={(e) => onChange(rgbOf(e.target.value))} aria-label={t("setting.background")} />;
}

export function Select<T extends string>({ value, onChange, children, width = 240 }: { value: T; onChange: (v: T) => void; children: ReactNode; width?: number }) {
  return <select value={value} style={{ minWidth: width }} onChange={(e) => onChange(e.target.value as T)}>{children}</select>;
}

export function Modal({ children, onClose, width }: { children: ReactNode; onClose: () => void; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" style={width ? { width } : undefined}>{children}</div>
    </div>
  );
}

// MARK: Shared settings rows

export function QualityRow({ quality, onChange, enabled = true }: { quality: number; onChange: (v: number) => void; enabled?: boolean }) {
  return (
    <SettingRow label={t("setting.quality")} hint={enabled ? undefined : t("setting.quality.lossless")}>
      <div className="row grow">
        <Slider value={quality} min={0.05} max={1} onChange={onChange} label={t("setting.quality")} disabled={!enabled} />
        <span style={{ width: 44, textAlign: "right", fontVariantNumeric: "tabular-nums", color: enabled ? undefined : "var(--secondary)" }}>{Math.round(quality * 100)}%</span>
      </div>
    </SettingRow>
  );
}

export function SuffixField({ suffix, onChange, example }: { suffix: string; onChange: (v: string) => void; example: string }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <input className="field" type="text" value={suffix} placeholder={t("common.none")} aria-label={t("setting.suffix")} style={{ maxWidth: 220 }} onChange={(e) => onChange(e.target.value)} />
      <span className="caption">{t("setting.suffix.example", example)}</span>
    </div>
  );
}

export function KeepMetadataRow({ keep, onChange }: { keep: boolean; onChange: (v: boolean) => void }) {
  return <SettingRow label={t("setting.keepMetadata")} hint={t("setting.keepMetadata.hint")}><Switch checked={keep} onChange={onChange} label={t("setting.keepMetadata")} /></SettingRow>;
}

export function BackgroundRow({ color, onChange }: { color: RGB; onChange: (c: RGB) => void }) {
  return (
    <SettingRow label={t("setting.background")} hint={t("setting.background.hint")}>
      <ColorField value={color} onChange={onChange} />
      <Button variant="secondary" onClick={() => onChange([255, 255, 255])}>{t("setting.background.white")}</Button>
      <Button variant="secondary" onClick={() => onChange([0, 0, 0])}>{t("setting.background.black")}</Button>
    </SettingRow>
  );
}

export function ActionFooter({ summary, hint, children }: { summary: string; hint?: string; children: ReactNode }) {
  return (
    <div className="footer-bar">
      <div className="inner">
        <div className="grow">
          <div style={{ fontWeight: 600 }}>{summary}</div>
          {hint && <div className="caption row" style={{ gap: 6 }}><Info size={12} />{hint}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

// MARK: Redesign building blocks

export const FORMAT_NAMES: Record<OutputFormat, string> = { jpeg: "JPEG", png: "PNG", tiff: "TIFF", webp: "WebP" };
export const isLossy = (f: OutputFormat) => f === "jpeg" || f === "webp";

/** Runs `onRun` on Ctrl+Enter while `enabled`, like ⌘↩ on the Mac. */
export function useRunShortcut(onRun: () => void, enabled: boolean) {
  const latest = useRef(onRun);
  latest.current = onRun;
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); latest.current(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [enabled]);
}

/** Pinned bar under a tool: "original stays untouched" on the left, what will happen and the main button on the right. */
export function ToolFooter({ untouched, summary, summaryIcon: SIcon, busy, children, wide, shadow }: {
  untouched: string; summary?: ReactNode; summaryIcon?: LucideIcon; busy?: boolean; children: ReactNode; wide?: boolean; shadow?: boolean;
}) {
  return (
    <div className={`tool-footer ${shadow ? "shadow" : ""}`}>
      <div className={`inner ${wide ? "wide" : ""}`}>
        <div className="untouched"><Lock size={15} />{untouched}</div>
        <div className="spacer" />
        {summary != null && <div className="summary">{SIcon && <SIcon size={16} style={{ flex: "none" }} />}<span className="truncate">{summary}</span></div>}
        {summary != null && <div className="spacer" />}
        {busy && <Spinner small />}
        {children}
      </div>
    </div>
  );
}

export function StagePane({ label, after, caption, children, spinning }: { label: string; after?: boolean; caption?: string | null; children?: ReactNode; spinning?: boolean }) {
  return (
    <div className="stage-pane">
      {children}
      <span className={`label ${after ? "after" : ""}`}>{label}</span>
      {spinning && <span className="corner-spin"><Spinner small /></span>}
      {caption && <span className="caption-pill">{caption}</span>}
    </div>
  );
}

export function Disclosure({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="disclosure" aria-expanded={open} onClick={onToggle}>
      <ChevronRight size={13} strokeWidth={3} /><span>{title}</span>
    </button>
  );
}

export function ToggleRow({ title, hint, checked, onChange, big }: { title: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; big?: boolean }) {
  return (
    <div className="toggle-row">
      <div className="grow">
        <div className={big ? "title3" : ""} style={big ? undefined : { fontWeight: 600 }}>{title}</div>
        {hint && <div className={big ? "muted" : "caption"}>{hint}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

export function FormatSelect({ value, onChange, formats, same = true }: { value: OutputFormat | null; onChange: (v: OutputFormat | null) => void; formats: OutputFormat[]; same?: boolean }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange((e.target.value || null) as OutputFormat | null)} aria-label={t("setting.outputFormat")}>
      {same && <option value="">{t("format.same")}</option>}
      {formats.map((f) => <option key={f} value={f}>{FORMAT_NAMES[f]}</option>)}
    </select>
  );
}

export function Tip({ text, icon: Icon, tone }: { text: string; icon: LucideIcon; tone: string }) {
  return <div className="tip" style={{ ["--tip" as string]: tone }}><Icon size={14} /><span>{text}</span></div>;
}

/** A small button that opens a menu of choices (the Mac's borderless Menu). */
export function MenuButton({ label, items }: { label: string; items: { label: string; onSelect: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div className="menu-btn" ref={ref}>
      <button type="button" className="trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{label}<ChevronDown size={12} /></button>
      {open && (
        <div className="menu" role="menu" style={{ bottom: 34, left: 0, minWidth: 160 }}>
          {items.map((it) => <button key={it.label} type="button" role="menuitem" onClick={() => { setOpen(false); it.onSelect(); }}>{it.label}</button>)}
        </div>
      )}
    </div>
  );
}

import { useEffect, type CSSProperties, type ReactNode } from "react";
import { AlertTriangle, Info, type LucideIcon } from "lucide-react";
import { t } from "../i18n";
import { hexOf, rgbOf } from "../format";
import type { RGB } from "../types";

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

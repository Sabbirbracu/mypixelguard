import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, FONT, MONO } from "./theme";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

export const useSpring = (delay = 0, config: { damping?: number; stiffness?: number; mass?: number } = {}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 120, mass: 0.8, ...config } });
};

/** Fades a whole scene in and out so cuts never feel abrupt. */
export const SceneFade: React.FC<{
  dur: number;
  inF?: number;
  outF?: number;
  zoom?: boolean;
  children: React.ReactNode;
}> = ({ dur, inF = 10, outF = 10, zoom = true, children }) => {
  const f = useCurrentFrame();
  const o = Math.min(
    interpolate(f, [0, inF], [0, 1], clamp),
    interpolate(f, [dur - outF, dur], [1, 0], clamp),
  );
  const s = zoom
    ? interpolate(f, [0, inF], [1.04, 1], { ...clamp, easing: easeOut }) *
      interpolate(f, [dur - outF, dur], [1, 0.97], clamp)
    : 1;
  const blur = interpolate(o, [0, 1], [12, 0]);
  return (
    <AbsoluteFill style={{ opacity: o, transform: `scale(${s})`, filter: blur > 0.3 ? `blur(${blur}px)` : undefined }}>
      {children}
    </AbsoluteFill>
  );
};

/** Animated dark background: drifting glows, perspective grid, particles. */
export const Background: React.FC<{ tint?: "orange" | "red" | "none"; grid?: boolean }> = ({
  tint = "orange",
  grid = true,
}) => {
  const f = useCurrentFrame();
  const glow = tint === "red" ? "255,59,78" : tint === "orange" ? "255,122,0" : "120,140,200";
  const x1 = 30 + Math.sin(f / 90) * 12;
  const y1 = 30 + Math.cos(f / 110) * 10;
  const x2 = 72 + Math.cos(f / 100) * 10;
  const y2 = 75 + Math.sin(f / 80) * 8;
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${x1}% ${y1}%, rgba(${glow},0.22), transparent 45%),
                       radial-gradient(circle at ${x2}% ${y2}%, rgba(${glow},0.12), transparent 50%),
                       radial-gradient(circle at 50% 120%, rgba(60,80,160,0.25), transparent 60%)`,
        }}
      />
      {grid && (
        <AbsoluteFill style={{ perspective: 900, perspectiveOrigin: "50% 30%" }}>
          <div
            style={{
              position: "absolute",
              left: "-50%",
              width: "200%",
              top: "55%",
              height: "120%",
              transform: "rotateX(72deg)",
              transformOrigin: "50% 0%",
              backgroundImage: `linear-gradient(rgba(${glow},0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(${glow},0.18) 1px, transparent 1px)`,
              backgroundSize: "80px 80px",
              backgroundPosition: `0px ${(f * 1.2) % 80}px`,
              maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.9), transparent 70%)",
              WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,0.9), transparent 70%)",
            }}
          />
        </AbsoluteFill>
      )}
      {new Array(40).fill(0).map((_, i) => {
        const px = random(`x${i}`) * 1920;
        const speed = 0.2 + random(`s${i}`) * 0.6;
        const py = (random(`y${i}`) * 1200 - f * speed) % 1200;
        const size = 2 + random(`z${i}`) * 3;
        const o = 0.15 + random(`o${i}`) * 0.4;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: px,
              top: py < -20 ? py + 1200 : py,
              width: size,
              height: size,
              borderRadius: i % 3 === 0 ? 1 : size,
              background: i % 4 === 0 ? `rgba(${glow},${o + 0.2})` : `rgba(255,255,255,${o * 0.6})`,
            }}
          />
        );
      })}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.6))" }} />
    </AbsoluteFill>
  );
};

/** Word-by-word kinetic headline. Words wrapped in *asterisks* are highlighted. */
export const Kinetic: React.FC<{
  text: string;
  delay?: number;
  size?: number;
  stagger?: number;
  color?: string;
  accent?: string;
  weight?: number;
  align?: "left" | "center";
  style?: React.CSSProperties;
}> = ({ text, delay = 0, size = 72, stagger = 4, color = C.text, accent = C.orange, weight = 700, align = "center", style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  return (
    <div
      style={{
        fontFamily: FONT,
        fontSize: size,
        fontWeight: weight,
        lineHeight: 1.12,
        letterSpacing: -size * 0.025,
        textAlign: align,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: align === "center" ? "center" : "flex-start",
        gap: `0 ${size * 0.26}px`,
        ...style,
      }}
    >
      {words.map((w, i) => {
        const hl = w.startsWith("*");
        const clean = w.replace(/\*/g, "");
        const p = spring({ frame: frame - delay - i * stagger, fps, config: { damping: 15, stiffness: 140 } });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              color: hl ? accent : color,
              opacity: interpolate(p, [0, 0.6], [0, 1], clamp),
              transform: `translateY(${(1 - p) * size * 0.6}px) rotateX(${(1 - p) * 40}deg)`,
              filter: `blur(${(1 - p) * 8}px)`,
              textShadow: hl ? `0 0 ${size * 0.5}px rgba(255,122,0,0.45)` : undefined,
            }}
          >
            {clean}
          </span>
        );
      })}
    </div>
  );
};

export const Glass: React.FC<{ style?: React.CSSProperties; children?: React.ReactNode; glow?: string }> = ({
  style,
  children,
  glow,
}) => (
  <div
    style={{
      background: "linear-gradient(160deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))",
      border: `1px solid ${glow ?? C.border}`,
      borderRadius: 22,
      backdropFilter: "blur(18px)",
      boxShadow: `0 30px 80px rgba(0,0,0,0.45)${glow ? `, 0 0 40px ${glow}55` : ""}, inset 0 1px 0 rgba(255,255,255,0.15)`,
      ...style,
    }}
  >
    {children}
  </div>
);

export const Chip: React.FC<{ icon?: IconName; text: string; color?: string; style?: React.CSSProperties; size?: number }> = ({
  icon,
  text,
  color = C.orange,
  style,
  size = 26,
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 14,
      padding: `${size * 0.55}px ${size * 0.95}px`,
      borderRadius: 999,
      background: `linear-gradient(135deg, ${color}2a, ${color}10)`,
      border: `1.5px solid ${color}88`,
      color: C.text,
      fontFamily: FONT,
      fontWeight: 600,
      fontSize: size,
      boxShadow: `0 10px 40px ${color}33`,
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {icon && <Icon name={icon} size={size * 1.15} color={color} />}
    {text}
  </div>
);

export type IconName =
  | "pin" | "camera" | "clock" | "chip" | "sparkle" | "shield" | "check" | "x" | "cloud" | "upload"
  | "lock" | "eye" | "server" | "warning" | "download" | "apple" | "windows" | "bolt" | "user" | "layers";

export const Icon: React.FC<{ name: IconName; size?: number; color?: string; stroke?: number }> = ({
  name,
  size = 28,
  color = C.text,
  stroke = 2,
}) => {
  const p = { fill: "none", stroke: color, strokeWidth: stroke, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<IconName, React.ReactNode> = {
    pin: (<><path {...p} d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" /><circle {...p} cx="12" cy="10" r="2.6" /></>),
    camera: (<><path {...p} d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle {...p} cx="12" cy="13.5" r="3.5" /></>),
    clock: (<><circle {...p} cx="12" cy="12" r="9" /><path {...p} d="M12 7v5l3 2" /></>),
    chip: (<><rect {...p} x="6" y="6" width="12" height="12" rx="2" /><path {...p} d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></>),
    sparkle: (<path {...p} d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />),
    shield: (<><path {...p} d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path {...p} d="M8.5 12l2.5 2.5 4.5-5" /></>),
    check: (<path {...p} d="M5 12.5l4.5 4.5L19 7" />),
    x: (<path {...p} d="M6 6l12 12M18 6L6 18" />),
    cloud: (<path {...p} d="M7 18h10a4.5 4.5 0 0 0 .6-8.96A6 6 0 0 0 6.2 10.1 4 4 0 0 0 7 18z" />),
    upload: (<><path {...p} d="M12 16V4M7 9l5-5 5 5" /><path {...p} d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>),
    lock: (<><rect {...p} x="5" y="11" width="14" height="10" rx="2" /><path {...p} d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
    eye: (<><path {...p} d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle {...p} cx="12" cy="12" r="3" /></>),
    server: (<><rect {...p} x="3" y="4" width="18" height="7" rx="1.5" /><rect {...p} x="3" y="13" width="18" height="7" rx="1.5" /><path {...p} d="M7 7.5h.01M7 16.5h.01" /></>),
    warning: (<><path {...p} d="M12 3l10 18H2L12 3z" /><path {...p} d="M12 10v5M12 18h.01" /></>),
    download: (<><path {...p} d="M12 4v12M7 11l5 5 5-5" /><path {...p} d="M4 20h16" /></>),
    apple: (<path fill={color} d="M16.4 12.6c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.1 2.5-1.8 3.1-.5 7.6 1.3 10.1.8 1.2 1.8 2.6 3.1 2.5 1.3 0 1.7-.8 3.3-.8 1.5 0 1.9.8 3.3.8 1.4 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.6-1-2.6-4.1zM14 5.2c.7-.8 1.1-1.9 1-3-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.2-.6 2.9-1.4z" />),
    windows: (<path fill={color} d="M3 5.5l7.5-1v7H3v-6zm8.5-1.2L21 3v8.5h-9.5V4.3zM3 12.5h7.5v7L3 18.5v-6zm8.5 0H21V21l-9.5-1.3v-7.2z" />),
    bolt: (<path {...p} d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />),
    user: (<><circle {...p} cx="12" cy="8" r="4" /><path {...p} d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>),
    layers: (<><path {...p} d="M12 3l9 5-9 5-9-5 9-5z" /><path {...p} d="M3 13l9 5 9-5" /></>),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      {paths[name]}
    </svg>
  );
};

/** macOS-style pointer that travels between keyframes and clicks. */
export const Cursor: React.FC<{
  path: { f: number; x: number; y: number }[];
  clicks?: number[];
  appearAt?: number;
}> = ({ path, clicks = [], appearAt = 0 }) => {
  const f = useCurrentFrame();
  const fs = path.map((p) => p.f);
  const x = interpolate(f, fs, path.map((p) => p.x), { ...clamp, easing: easeInOut });
  const y = interpolate(f, fs, path.map((p) => p.y), { ...clamp, easing: easeInOut });
  let s = 1;
  let ripple: number | null = null;
  for (const c of clicks) {
    if (f >= c - 3 && f <= c + 4) s = 0.82;
    if (f >= c && f < c + 20) ripple = (f - c) / 20;
  }
  const o = interpolate(f, [appearAt, appearAt + 8], [0, 1], clamp);
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity: o, zIndex: 50 }}>
      {ripple !== null && (
        <div
          style={{
            position: "absolute",
            left: -40 * ripple - 6,
            top: -40 * ripple - 6,
            width: 80 * ripple + 12,
            height: 80 * ripple + 12,
            borderRadius: "50%",
            border: `3px solid ${C.orange}`,
            opacity: 1 - ripple,
          }}
        />
      )}
      <svg width={46} height={46} viewBox="0 0 24 24" style={{ transform: `scale(${s})`, transformOrigin: "10% 10%", filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.5))" }}>
        <path d="M5 2.5l13.5 12.2-6.1.6 3.6 7.3-2.6 1.2-3.5-7.4L5 20.6V2.5z" fill="#fff" stroke="#111" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

export const Logo: React.FC<{ size: number; style?: React.CSSProperties }> = ({ size, style }) => (
  <Img src={staticFile("img/logo.png")} style={{ width: size, height: size, ...style }} />
);

export const Wordmark: React.FC<{ size: number; reveal?: number }> = ({ size, reveal = 1 }) => {
  const word = "MyPixelGuard";
  const shown = Math.floor(word.length * reveal + 0.0001);
  return (
    <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: size, letterSpacing: -size * 0.03, display: "flex" }}>
      {word.split("").map((ch, i) => (
        <span
          key={i}
          style={{
            color: i >= 7 ? C.orange : C.text,
            opacity: i < shown ? 1 : 0,
            transform: `translateY(${i < shown ? 0 : 10}px)`,
            textShadow: i >= 7 ? "0 0 30px rgba(255,122,0,0.5)" : undefined,
          }}
        >
          {ch}
        </span>
      ))}
    </div>
  );
};

export const MonoText: React.FC<{ children: React.ReactNode; size?: number; color?: string }> = ({ children, size = 22, color = C.sub }) => (
  <span style={{ fontFamily: MONO, fontSize: size, color, fontWeight: 500 }}>{children}</span>
);

/** Tilted macOS window frame. */
export const MacWindow: React.FC<{ width: number; height: number; title?: string; children: React.ReactNode; light?: boolean; style?: React.CSSProperties }> = ({
  width,
  height,
  title,
  children,
  light,
  style,
}) => (
  <div
    style={{
      width,
      height,
      borderRadius: 18,
      overflow: "hidden",
      background: light ? "#F4F5F7" : "#0E1320",
      border: `1px solid ${light ? "#d0d4da" : "rgba(255,255,255,0.14)"}`,
      boxShadow: "0 50px 120px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.3)",
      display: "flex",
      flexDirection: "column",
      ...style,
    }}
  >
    <div
      style={{
        height: 38,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 16px",
        background: light ? "#E6E8EC" : "#151B2B",
        borderBottom: `1px solid ${light ? "#d0d4da" : "rgba(255,255,255,0.08)"}`,
      }}
    >
      {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
        <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />
      ))}
      {title && (
        <div style={{ flex: 1, textAlign: "center", fontFamily: FONT, fontSize: 15, color: light ? "#555" : C.sub, marginRight: 60 }}>{title}</div>
      )}
    </div>
    <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>{children}</div>
  </div>
);

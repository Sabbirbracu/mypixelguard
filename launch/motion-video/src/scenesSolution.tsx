import React from "react";
import { AbsoluteFill, Img, interpolate, OffthreadVideo, random, Sequence, staticFile, useCurrentFrame } from "remotion";
import {
  Background, Chip, clamp, Cursor, easeInOut, easeOut, Glass, Icon, IconName, Kinetic, Logo, MacWindow, SceneFade, useSpring, Wordmark,
} from "./components";
import { C, FEATURE_LENS, FEATURE_STARTS, FONT, MONO } from "./theme";

/* ------------------------------------------------------- 6. Logo reveal */
// target cells of the logo's pixel squares (percent of the 1024 logo)
const PIXELS = [
  [0.6, 0.045, 0.067], [0.833, 0.073, 0.065], [0.713, 0.138, 0.073], [0.6, 0.24, 0.093], [0.805, 0.24, 0.065],
];

export const Reveal: React.FC = () => {
  const f = useCurrentFrame();
  const logoP = useSpring(14, { damping: 11, stiffness: 120 });
  const size = 300;
  const lx = 960 - size / 2;
  const ly = 330 - size / 2;
  const flash = interpolate(f, [0, 3, 18], [0, 0.9, 0], clamp);
  const ring = interpolate(f, [12, 50], [0, 1], { ...clamp, easing: easeOut });
  const typeP = interpolate(f, [50, 74], [0, 1], clamp);
  const tag = ["Your Images.", "Your Privacy.", "Your Control."];
  return (
    <SceneFade dur={180} inF={1} outF={10}>
      <Background tint="orange" />
      {/* rotating light rays */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: interpolate(f, [10, 40], [0, 0.5], clamp) }}>
        <div
          style={{
            position: "absolute",
            top: 330 - 900,
            width: 1800,
            height: 1800,
            background: `repeating-conic-gradient(from ${f * 0.4}deg, rgba(255,122,0,0.10) 0deg 6deg, transparent 6deg 18deg)`,
            maskImage: "radial-gradient(circle, black 10%, transparent 60%)",
            WebkitMaskImage: "radial-gradient(circle, black 10%, transparent 60%)",
          }}
        />
      </AbsoluteFill>
      {/* shockwave ring */}
      <div
        style={{
          position: "absolute",
          left: 960 - 600 * ring,
          top: 330 - 600 * ring,
          width: 1200 * ring,
          height: 1200 * ring,
          borderRadius: "50%",
          border: `4px solid ${C.orange}`,
          opacity: 1 - ring,
        }}
      />
      {/* pixels flying into the logo */}
      {new Array(36).fill(0).map((_, i) => {
        const target = PIXELS[i % PIXELS.length];
        const sx = random(`px${i}`) * 1920;
        const sy = random(`py${i}`) * 1080;
        const p = interpolate(f, [0 + i * 0.5, 26 + i * 0.5], [0, 1], { ...clamp, easing: easeInOut });
        const tx = lx + target[0] * size;
        const ty = ly + target[1] * size;
        const s = target[2] * size * (i < 5 ? 1 : 0.6);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: sx + (tx - sx) * p,
              top: sy + (ty - sy) * p,
              width: s,
              height: s,
              background: `linear-gradient(135deg, ${C.orange2}, ${C.orange})`,
              opacity: p < 1 ? 0.9 : 0,
              transform: `rotate(${(1 - p) * 180}deg)`,
              boxShadow: `0 0 20px ${C.orange}`,
            }}
          />
        );
      })}
      <div
        style={{
          position: "absolute",
          left: lx,
          top: ly,
          transform: `scale(${logoP})`,
          filter: `drop-shadow(0 0 ${40 + Math.sin(f / 10) * 15}px rgba(255,122,0,0.55))`,
        }}
      >
        <Logo size={size} />
      </div>
      <AbsoluteFill style={{ alignItems: "center", top: 520 }}>
        <Wordmark size={120} reveal={typeP} />
        <div style={{ display: "flex", gap: 26, marginTop: 34 }}>
          {tag.map((t, i) => {
            const d = [86, 111, 141][i];
            const o = interpolate(f, [d, d + 10], [0, 1], clamp);
            return (
              <div
                key={t}
                style={{
                  fontFamily: FONT,
                  fontSize: 44,
                  fontWeight: 600,
                  color: i === 2 ? C.orange : C.text,
                  opacity: o,
                  transform: `translateY(${(1 - o) * 30}px)`,
                }}
              >
                {t}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#FFE2C2", opacity: flash, mixBlendMode: "screen" }} />
    </SceneFade>
  );
};

/* -------------------------------------------------------- 7. Product hero */
export const Hero: React.FC = () => {
  const f = useCurrentFrame();
  const img = useSpring(0, { damping: 18, stiffness: 70 });
  const chips: { icon: IconName; t: string; d: number }[] = [
    { icon: "shield", t: "Runs 100% on your device", d: 58 },
    { icon: "upload", t: "Zero uploads", d: 112 },
    { icon: "user", t: "No account needed", d: 132 },
  ];
  return (
    <SceneFade dur={180}>
      <Background tint="orange" grid={false} />
      <div
        style={{
          position: "absolute",
          right: -60,
          top: 120,
          width: 1380,
          height: 1380 * (941 / 1672),
          borderRadius: 30,
          overflow: "hidden",
          transform: `translateX(${(1 - img) * 300}px) scale(${interpolate(f, [0, 180], [1.0, 1.08])})`,
          opacity: img,
          maskImage: "linear-gradient(90deg, transparent 0%, black 22%)",
          WebkitMaskImage: "linear-gradient(90deg, transparent 0%, black 22%)",
        }}
      >
        <Img src={staticFile("img/MyPixelGuard-Laptop-Hero.png")} style={{ width: "100%", height: "100%" }} />
      </div>
      <div style={{ position: "absolute", left: 110, top: 230, width: 760 }}>
        <Kinetic text="The complete" delay={6} size={70} align="left" />
        <Kinetic text="*image* *toolkit*" delay={14} size={70} align="left" />
        <Kinetic text="that never leaves your computer." delay={26} size={36} weight={500} color={C.sub} align="left" style={{ marginTop: 18 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 50, alignItems: "flex-start" }}>
          {chips.map((c) => (
            <HeroChip key={c.t} {...c} />
          ))}
        </div>
      </div>
    </SceneFade>
  );
};

const HeroChip: React.FC<{ icon: IconName; t: string; d: number }> = ({ icon, t, d }) => {
  const p = useSpring(d, { damping: 12, stiffness: 180 });
  return (
    <div style={{ transform: `translateX(${(1 - p) * -80}px) scale(${0.8 + p * 0.2})`, opacity: p }}>
      <Chip icon={icon} text={t} size={28} />
    </div>
  );
};

/* --------------------------------------------------- 8. Feature journey */
// badgeAt: frame within the beat where the result badge lands (on the matching voice-over word)
export const FEATURES: { id: string; name: string; line: string; badge: string; icon: IconName; badgeAt: number }[] = [
  { id: "inspect", name: "Inspect", line: "See everything hidden inside your image.", badge: "GPS · Camera · AI label found", icon: "eye", badgeAt: 66 },
  { id: "clean", name: "Clean", line: "Strip GPS, EXIF & AI labels in one click.", badge: "All metadata removed", icon: "shield", badgeAt: 104 },
  { id: "redact", name: "Redact", line: "Blur faces & sensitive text before you share.", badge: "Area blurred", icon: "lock", badgeAt: 32 },
  { id: "resize", name: "Resize", line: "The perfect size for every platform.", badge: "1672×941 → 1080×1080", icon: "layers", badgeAt: 34 },
  { id: "compress", name: "Compress", line: "Smaller files. Same great quality.", badge: "2.7 MB → 562 KB  (−79%)", icon: "bolt", badgeAt: 32 },
  { id: "bg", name: "Remove Background", line: "Clean cut-outs — fully offline.", badge: "Transparent PNG", icon: "sparkle", badgeAt: 43 },
  { id: "ai", name: "AI Tools", line: "Enhance, Smart Crop & Upscale on-device.", badge: "Upscale 2× · Smart Crop", icon: "chip", badgeAt: 56 },
];

export const Features: React.FC = () => {
  const f = useCurrentFrame();
  const active = FEATURE_STARTS.filter((st) => f >= st).length - 1;
  const railIn = interpolate(f, [0, 15], [0, 1], clamp);
  const total = FEATURE_LENS.reduce((a, b) => a + b, 0);
  return (
    <SceneFade dur={total} outF={12}>
      <Background tint="orange" />
      {/* journey rail */}
      <div style={{ position: "absolute", left: 110, top: 760, display: "flex", gap: 10, opacity: railIn }}>
        {FEATURES.map((ft, i) => {
          const on = i === active;
          const done = i < active;
          return (
            <div key={ft.id} style={{ display: "flex", flexDirection: "column", gap: 8, width: 92 }}>
              <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: done ? "100%" : on ? `${((f - FEATURE_STARTS[i]) / FEATURE_LENS[i]) * 100}%` : "0%",
                    background: C.orange,
                    boxShadow: `0 0 12px ${C.orange}`,
                  }}
                />
              </div>
              <div style={{ fontFamily: FONT, fontSize: 14, color: on ? C.text : C.sub, fontWeight: on ? 700 : 500, whiteSpace: "nowrap" }}>
                {ft.name === "Remove Background" ? "Remove BG" : ft.name}
              </div>
            </div>
          );
        })}
      </div>
      {FEATURES.map((ft, i) => (
        <Sequence key={ft.id} from={FEATURE_STARTS[i]} durationInFrames={FEATURE_LENS[i]} layout="none">
          <FeatureBeat ft={ft} index={i} len={FEATURE_LENS[i]} />
        </Sequence>
      ))}
    </SceneFade>
  );
};

const FeatureBeat: React.FC<{ ft: (typeof FEATURES)[number]; index: number; len: number }> = ({ ft, index, len }) => {
  const f = useCurrentFrame();
  const enter = interpolate(f, [0, 16], [0, 1], { ...clamp, easing: easeOut });
  const exit = interpolate(f, [len - 12, len], [0, 1], { ...clamp, easing: easeInOut });
  const badge = useSpring(ft.badgeAt, { damping: 12, stiffness: 170 });
  const ww = 1040;
  const wh = 650 + 38;
  return (
    <AbsoluteFill>
      {/* text column */}
      <div
        style={{
          position: "absolute",
          left: 110,
          top: 250,
          width: 620,
          opacity: enter * (1 - exit),
          transform: `translateY(${(1 - enter) * 40 - exit * 30}px)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: `linear-gradient(135deg, ${C.orange2}, ${C.orange})`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 10px 40px ${C.orange}66` }}>
            <Icon name={ft.icon} size={36} color="#fff" stroke={2.2} />
          </div>
          <div style={{ fontFamily: MONO, fontSize: 22, color: C.orange2, letterSpacing: 3 }}>
            {String(index + 1).padStart(2, "0")} / {String(FEATURES.length).padStart(2, "0")}
          </div>
        </div>
        <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: ft.name.length > 10 ? 74 : 92, color: C.text, letterSpacing: -2.5, marginTop: 26, lineHeight: 1.02 }}>
          {ft.name}
        </div>
        <div style={{ fontFamily: FONT, fontSize: 34, color: C.sub, marginTop: 20, lineHeight: 1.3 }}>{ft.line}</div>
      </div>
      {/* app window with the real footage */}
      <div style={{ position: "absolute", left: 790, top: 190, perspective: 2200 }}>
        <div
          style={{
            transform: `translateX(${(1 - enter) * 260 - exit * 200}px) rotateY(${interpolate(enter, [0, 1], [-38, -9]) + exit * 25}deg) rotateX(4deg) scale(${0.92 + enter * 0.08})`,
            opacity: enter * (1 - exit),
            transformOrigin: "0% 50%",
          }}
        >
          <MacWindow width={ww} height={wh} title="MyPixelGuard" style={{ boxShadow: `0 60px 140px rgba(0,0,0,0.7), 0 0 80px ${C.orange}33` }}>
            <OffthreadVideo src={staticFile(`clips/${ft.id}.mp4`)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} startFrom={8} />
          </MacWindow>
          {/* reflective sheen */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 18,
              background: `linear-gradient(110deg, transparent ${30 + f * 0.4}%, rgba(255,255,255,0.07) ${40 + f * 0.4}%, transparent ${50 + f * 0.4}%)`,
              pointerEvents: "none",
            }}
          />
          {/* result badge floating in front */}
          <div
            style={{
              position: "absolute",
              left: -60,
              bottom: 60,
              transform: `translateZ(80px) scale(${badge})`,
              opacity: badge * (1 - exit),
            }}
          >
            <Glass glow={C.green} style={{ padding: "16px 24px", display: "flex", alignItems: "center", gap: 14, background: "rgba(10,20,16,0.85)" }}>
              <div style={{ width: 40, height: 40, borderRadius: 20, background: C.green, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="check" size={26} color="#fff" stroke={3} />
              </div>
              <div style={{ fontFamily: FONT, fontSize: 26, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>{ft.badge}</div>
            </Glass>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ----------------------------------------------------- 9. All-in-one grid */
const SHOTS = ["01-Inspect-Metadata", "02-Clean-Privacy", "03-Redact-Sensitive", "04-Convert-Resize-Compress", "05-AI-Enhance-Smart-Crop", "MyPixelGuard-Laptop-Hero"];

export const Grid: React.FC = () => {
  const f = useCurrentFrame();
  const badge = useSpring(58, { damping: 12, stiffness: 160 });
  return (
    <SceneFade dur={180}>
      <Background tint="orange" grid={false} />
      <AbsoluteFill style={{ perspective: 1800 }}>
        <div
          style={{
            position: "absolute",
            left: 960 - 1300,
            top: 540 - 720,
            width: 2600,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 40,
            transform: `rotateX(28deg) rotateZ(-10deg) translateY(${interpolate(f, [0, 180], [160, -120])}px) translateX(${interpolate(f, [0, 180], [-60, 60])}px)`,
          }}
        >
          {[...SHOTS, ...SHOTS].map((s, i) => {
            const p = interpolate(f, [i * 3, i * 3 + 25], [0, 1], { ...clamp, easing: easeOut });
            return (
              <div key={i} style={{ borderRadius: 24, overflow: "hidden", aspectRatio: "1672 / 941", opacity: p * 0.9, transform: `translateZ(${(1 - p) * -400}px)`, boxShadow: "0 40px 100px rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <Img src={staticFile(`img/${s}.png`)} style={{ width: "100%", height: "100%" }} />
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(7,11,22,0.92) 0%, rgba(7,11,22,0.75) 35%, transparent 75%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Kinetic text="One app." delay={14} size={96} weight={800} />
        <Kinetic text="*Every* *tool.*" delay={24} size={96} weight={800} />
        <div style={{ marginTop: 40, transform: `scale(${badge})`, opacity: badge }}>
          <Chip icon="layers" text="Batch Studio — hundreds of images at once" size={30} />
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
};

/* ------------------------------------------------------- 10. Comparison */
export const Compare: React.FC = () => {
  const f = useCurrentFrame();
  const left = useSpring(4, { damping: 16, stiffness: 110 });
  const right = useSpring(60, { damping: 14, stiffness: 110 });
  const settle = interpolate(f, [130, 150], [0, 1], { ...clamp, easing: easeInOut });
  const bad = [
    { t: "Uploads your photo", d: 20 },
    { t: "Ads & tracking", d: 35 },
    { t: "Stored on unknown servers", d: 50 },
  ];
  const good = [
    { t: "Works offline", d: 80 },
    { t: "Zero uploads — ever", d: 95 },
    { t: "You stay in control", d: 110 },
  ];
  const col = (items: typeof bad, ok: boolean) =>
    items.map((it) => {
      const o = interpolate(f, [it.d, it.d + 8], [0, 1], clamp);
      return (
        <div key={it.t} style={{ display: "flex", alignItems: "center", gap: 18, opacity: o, transform: `translateX(${(1 - o) * 30}px)` }}>
          <div style={{ width: 46, height: 46, borderRadius: 23, background: ok ? `${C.green}22` : `${C.red}22`, border: `2px solid ${ok ? C.green : C.red}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name={ok ? "check" : "x"} size={26} color={ok ? C.green : C.red} stroke={3} />
          </div>
          <div style={{ fontFamily: FONT, fontSize: 32, color: ok ? C.text : "#c4c9d4", fontWeight: 600 }}>{it.t}</div>
        </div>
      );
    });
  return (
    <SceneFade dur={180}>
      <Background tint="orange" />
      <AbsoluteFill style={{ paddingTop: 80 }}>
        <Kinetic text="Other sites take your photo." delay={2} size={52} weight={600} color={C.sub} />
        <Kinetic text="*MyPixelGuard* keeps it with you." delay={62} size={58} />
      </AbsoluteFill>
      <div style={{ position: "absolute", top: 340, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 60 }}>
        <Glass
          glow={`${C.red}`}
          style={{
            width: 640,
            padding: "44px 48px",
            opacity: left * interpolate(settle, [0, 1], [1, 0.55]),
            transform: `translateY(${(1 - left) * 80}px) scale(${1 - settle * 0.05})`,
            display: "flex",
            flexDirection: "column",
            gap: 28,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: FONT, fontSize: 40, fontWeight: 800, color: C.text }}>
            <Icon name="cloud" size={50} color={C.red} /> Online tools
          </div>
          {col(bad, false)}
        </Glass>
        <Glass
          glow={C.orange}
          style={{
            width: 640,
            padding: "44px 48px",
            opacity: right,
            transform: `translateY(${(1 - right) * 80}px) scale(${1 + settle * 0.05})`,
            display: "flex",
            flexDirection: "column",
            gap: 28,
            background: "linear-gradient(160deg, rgba(255,122,0,0.16), rgba(255,255,255,0.03))",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Logo size={56} />
            <span style={{ fontFamily: FONT, fontSize: 40, fontWeight: 800, color: C.text }}>
              MyPixel<span style={{ color: C.orange }}>Guard</span>
            </span>
          </div>
          {col(good, true)}
        </Glass>
      </div>
    </SceneFade>
  );
};

/* -------------------------------------------------------------- 11. CTA */
export const CTA: React.FC = () => {
  const f = useCurrentFrame();
  const logo = useSpring(0, { damping: 12, stiffness: 110 });
  const btn = useSpring(38, { damping: 13, stiffness: 150 });
  const pressed = f >= 118 && f <= 125;
  const clicked = f >= 122;
  const end = interpolate(f, [218, 240], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: end }}>
      <Background tint="orange" />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 120 }}>
        <div style={{ transform: `scale(${logo})`, filter: `drop-shadow(0 0 ${50 + Math.sin(f / 9) * 20}px rgba(255,122,0,0.6))` }}>
          <Logo size={190} />
        </div>
        <div style={{ marginTop: 24, opacity: logo }}>
          <Wordmark size={100} />
        </div>
        <div style={{ marginTop: 12 }}>
          <Kinetic text="Your Images. Your Privacy. *Your* *Control.*" delay={20} size={40} weight={600} stagger={3} />
        </div>
        <div
          style={{
            marginTop: 54,
            transform: `scale(${btn * (pressed ? 0.94 : 1)})`,
            opacity: btn,
            display: "flex",
            alignItems: "center",
            gap: 18,
            padding: "26px 48px",
            borderRadius: 999,
            background: clicked ? `linear-gradient(135deg, ${C.green}, #16a34a)` : `linear-gradient(135deg, ${C.orange2}, ${C.orange})`,
            boxShadow: `0 20px 60px ${clicked ? C.green : C.orange}77, inset 0 1px 0 rgba(255,255,255,0.4)`,
            fontFamily: FONT,
            fontSize: 38,
            fontWeight: 800,
            color: "#fff",
          }}
        >
          <Icon name={clicked ? "check" : "download"} size={42} color="#fff" stroke={2.6} />
          {clicked ? "Downloading…" : "Download for Mac & Windows"}
          {!clicked && (
            <span style={{ display: "flex", gap: 10, marginLeft: 6 }}>
              <Icon name="apple" size={36} color="#fff" />
              <Icon name="windows" size={32} color="#fff" />
            </span>
          )}
        </div>
        <div style={{ marginTop: 36, fontFamily: MONO, fontSize: 32, color: C.orange2, opacity: interpolate(f, [80, 95], [0, 1], clamp), letterSpacing: 1 }}>
          mypixelguard.agentiqbd.com
        </div>
        <div style={{ marginTop: 16, fontFamily: FONT, fontSize: 20, color: C.sub, opacity: interpolate(f, [146, 158], [0, 1], clamp) }}>
          A product of Agentiq BD
        </div>
      </AbsoluteFill>
      <Cursor
        appearAt={84}
        path={[
          { f: 84, x: 1500, y: 1000 },
          { f: 114, x: 1000, y: 628 },
          { f: 160, x: 1012, y: 636 },
        ]}
        clicks={[120]}
      />
    </AbsoluteFill>
  );
};

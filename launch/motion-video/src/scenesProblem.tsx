import React from "react";
import { AbsoluteFill, Img, interpolate, random, staticFile, useCurrentFrame } from "remotion";
import {
  Background, Chip, clamp, Cursor, easeInOut, easeOut, Glass, Icon, IconName, Kinetic, SceneFade, useSpring,
} from "./components";
import { C, FONT, MONO } from "./theme";

const PHOTO = staticFile("img/photo.png");

/* ------------------------------------------------------------ 1. Hook */
export const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const enter = useSpring(0, { damping: 20, stiffness: 60 });
  const scanY = interpolate(f, [28, 85], [-5, 105], { ...clamp, easing: easeInOut });
  const scanOn = f > 26 && f < 88;
  const w = 880;
  const h = w * (941 / 1672);
  return (
    <SceneFade dur={120} inF={14} outF={1} zoom={false}>
      <Background tint="none" grid={false} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            position: "relative",
            width: w,
            height: h,
            marginTop: -110,
            borderRadius: 26,
            overflow: "hidden",
            transform: `scale(${interpolate(enter, [0, 1], [1.25, 1])}) translateY(${interpolate(f, [0, 120], [10, -10])}px)`,
            filter: `blur(${interpolate(enter, [0, 1], [24, 0])}px) brightness(${interpolate(f, [0, 30], [0.4, 0.95], clamp)})`,
            boxShadow: "0 40px 120px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.1)",
          }}
        >
          <Img src={PHOTO} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          {/* data layer revealed behind the scan line */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              clipPath: `inset(0 0 ${100 - scanY}% 0)`,
              opacity: interpolate(f, [88, 104], [1, 0.45], clamp),
              background: "rgba(7,11,22,0.55)",
              fontFamily: MONO,
              fontSize: 15,
              lineHeight: "22px",
              color: "rgba(255,169,77,0.85)",
              padding: 16,
              overflow: "hidden",
              wordBreak: "break-all",
            }}
          >
            {new Array(22).fill(0).map((_, i) => (
              <div key={i}>
                {["GPSLatitude=23.8103", "Make=Apple", "Model=iPhone 15 Pro", "DateTimeOriginal=2026:10:19 18:16:09", "SerialNumber=F2LXK9QW3M", "c2pa.claim_generator=OpenAI", "GPSLongitude=90.4125", "Software=17.4", "LensModel=f/1.78", "OwnerName=you"]
                  .slice(i % 5, (i % 5) + 4)
                  .join("  ·  ")}
              </div>
            ))}
          </div>
          {scanOn && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: `${scanY}%`,
                height: 4,
                background: C.orange,
                boxShadow: `0 0 30px 8px ${C.orange}aa`,
              }}
            />
          )}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "flex-end", paddingBottom: 120 }}>
        <Kinetic text="Your photo knows" delay={18} size={78} />
        <Kinetic text="*more* *than* *you* *think.*" delay={34} size={78} />
      </AbsoluteFill>
    </SceneFade>
  );
};

/* ---------------------------------------------------- 2. Metadata cards */
const META: { icon: IconName; label: string; value: string; sub?: string; x: number; y: number; d: number }[] = [
  { icon: "pin", label: "GPS LOCATION", value: "23.8103° N, 90.4125° E", sub: "Dhaka, Bangladesh", x: 120, y: 250, d: 42 },
  { icon: "camera", label: "CAMERA", value: "iPhone 15 Pro", sub: "f/1.78 · 24 mm", x: 120, y: 600, d: 75 },
  { icon: "clock", label: "TAKEN", value: "19 Oct 2026", sub: "6:16:09 PM", x: 1390, y: 250, d: 120 },
  { icon: "chip", label: "DEVICE SERIAL", value: "F2LXK9QW3M", sub: "Unique to your phone", x: 1390, y: 600, d: 94 },
  { icon: "sparkle", label: "AI LABEL · C2PA", value: "Generated with AI", sub: "Content Credentials", x: 760, y: 820, d: 136 },
];

export const Metadata: React.FC = () => {
  const f = useCurrentFrame();
  const cx = 960;
  const cy = 500;
  const pw = 640;
  const ph = pw * (941 / 1672);
  const pin = useSpring(10);
  return (
    <SceneFade dur={180}>
      <Background tint="orange" />
      <AbsoluteFill style={{ paddingTop: 70 }}>
        <Kinetic text="Location. Device. Time." delay={4} size={64} />
        <Kinetic text="Hidden inside *every* *image.*" delay={20} size={40} weight={600} color={C.sub} style={{ marginTop: 10 }} />
      </AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        {META.map((m, i) => {
          const p = interpolate(f, [m.d, m.d + 18], [0, 1], { ...clamp, easing: easeOut });
          const tx = m.x + 200;
          const ty = m.y + 60;
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={cx + (tx - cx) * p}
              y2={cy + (ty - cy) * p}
              stroke={C.orange}
              strokeOpacity={0.7}
              strokeWidth={2}
              strokeDasharray="6 8"
              strokeDashoffset={-f * 1.5}
            />
          );
        })}
      </svg>
      <div
        style={{
          position: "absolute",
          left: cx - pw / 2,
          top: cy - ph / 2,
          width: pw,
          height: ph,
          borderRadius: 22,
          overflow: "hidden",
          boxShadow: `0 0 0 2px ${C.orange}66, 0 30px 90px rgba(0,0,0,0.6), 0 0 80px rgba(255,122,0,0.25)`,
          transform: `scale(${interpolate(f, [0, 180], [1, 1.04])})`,
        }}
      >
        <Img src={PHOTO} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        {/* pulsing location pin */}
        <div style={{ position: "absolute", left: 300, top: 120, transform: `scale(${pin}) translate(-50%,-100%)` }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 30,
              width: 70,
              height: 70,
              marginLeft: -12,
              borderRadius: "50%",
              border: `3px solid ${C.orange}`,
              opacity: 1 - ((f % 30) / 30),
              transform: `scale(${0.3 + (f % 30) / 30})`,
            }}
          />
          <Icon name="pin" size={48} color={C.orange} stroke={2.6} />
        </div>
      </div>
      {META.map((m, i) => (
        <MetaCard key={i} {...m} />
      ))}
    </SceneFade>
  );
};

const MetaCard: React.FC<(typeof META)[number]> = ({ icon, label, value, sub, x, y, d }) => {
  const f = useCurrentFrame();
  const p = useSpring(d, { damping: 12, stiffness: 160 });
  const float = Math.sin((f + d * 3) / 22) * 6;
  return (
    <Glass
      style={{
        position: "absolute",
        left: x,
        top: y + float,
        width: 400,
        padding: "22px 26px",
        display: "flex",
        gap: 18,
        alignItems: "center",
        transform: `scale(${p})`,
        opacity: p,
      }}
      glow={C.orange}
    >
      <div style={{ width: 62, height: 62, borderRadius: 16, background: `${C.orange}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={34} color={C.orange} />
      </div>
      <div style={{ fontFamily: FONT }}>
        <div style={{ fontFamily: MONO, fontSize: 15, letterSpacing: 2, color: C.orange2 }}>{label}</div>
        <div style={{ fontSize: 27, fontWeight: 700, color: C.text, marginTop: 4 }}>{value}</div>
        {sub && <div style={{ fontSize: 18, color: C.sub, marginTop: 2 }}>{sub}</div>}
      </div>
    </Glass>
  );
};

/* ---------------------------------------------------- 3. "Free" website */
export const Upload: React.FC = () => {
  const f = useCurrentFrame();
  const win = useSpring(0, { damping: 18, stiffness: 90 });
  const progress = interpolate(f, [80, 126], [0, 100], { ...clamp, easing: easeInOut });
  const flyP = interpolate(f, [130, 160], [0, 1], { ...clamp, easing: easeInOut });
  const pressed = f >= 74 && f <= 80;
  const adBlink = Math.floor(f / 8) % 2 === 0;
  // thumbnail position (relative to the scene)
  const tx0 = 860, ty0 = 520, tx1 = 1640, ty1 = 170;
  const tx = tx0 + (tx1 - tx0) * flyP;
  const ty = ty0 + (ty1 - ty0) * flyP - Math.sin(flyP * Math.PI) * 160;
  const cloudPulse = interpolate(f, [160, 172], [1.25, 1], clamp);
  return (
    <SceneFade dur={180}>
      <Background tint="none" />
      <AbsoluteFill style={{ paddingTop: 56 }}>
        <Kinetic text="So you upload it to a" delay={2} size={54} weight={600} color={C.sub} />
        <Kinetic text="*“free”* online tool…" delay={12} size={64} />
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 380,
          top: 250,
          perspective: 1600,
        }}
      >
        <div
          style={{
            transform: `rotateX(${interpolate(win, [0, 1], [25, 6])}deg) rotateY(${interpolate(win, [0, 1], [-10, 4])}deg) translateY(${(1 - win) * 200}px)`,
            opacity: win,
          }}
        >
          <div style={{ width: 1160, height: 700, borderRadius: 16, overflow: "hidden", background: "#fff", boxShadow: "0 60px 140px rgba(0,0,0,0.6)" }}>
            {/* browser chrome */}
            <div style={{ height: 56, background: "#E9EBEF", display: "flex", alignItems: "center", gap: 10, padding: "0 18px" }}>
              {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
                <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />
              ))}
              <div style={{ marginLeft: 24, flex: 1, height: 34, borderRadius: 10, background: "#fff", display: "flex", alignItems: "center", gap: 10, padding: "0 14px", fontFamily: FONT, fontSize: 17 }}>
                <span style={{ color: C.red, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="warning" size={18} color={C.red} /> Not Secure
                </span>
                <span style={{ color: "#444" }}>free-bg-remover.online/upload</span>
              </div>
            </div>
            <div style={{ position: "relative", height: 644, background: "linear-gradient(180deg,#fafafa,#eef0f4)", fontFamily: FONT }}>
              {/* sketchy ads */}
              <div style={{ position: "absolute", left: 20, top: 20, width: 190, height: 590, borderRadius: 10, background: adBlink ? "#FFE14D" : "#FF4D8D", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", color: "#111", fontWeight: 800, fontSize: 30, textAlign: "center" }}>
                <div style={{ fontSize: 14, alignSelf: "flex-end", marginRight: 10, opacity: 0.6 }}>AD</div>
                YOU WON
                <br />A FREE
                <br />iPHONE!
                <div style={{ marginTop: 20, fontSize: 18, background: "#111", color: "#fff", padding: "8px 14px", borderRadius: 8 }}>CLAIM NOW</div>
              </div>
              <div style={{ position: "absolute", right: 20, top: 20, width: 190, height: 590, borderRadius: 10, background: "#3B82F6", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontWeight: 800, fontSize: 26, flexDirection: "column" }}>
                <div style={{ fontSize: 14, alignSelf: "flex-end", marginRight: 10, opacity: 0.6 }}>AD</div>
                FAST
                <br />VPN
                <br />90% OFF
              </div>
              <div style={{ position: "absolute", left: 240, right: 240, top: 40, textAlign: "center" }}>
                <div style={{ fontSize: 40, fontWeight: 800, color: "#111" }}>Remove Background</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#16A34A" }}>100% FREE · No signup!!</div>
              </div>
              <div style={{ position: "absolute", left: 270, right: 270, top: 170, height: 300, border: "3px dashed #c3c7d0", borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", paddingBottom: 26, gap: 16 }}>
                <div style={{ width: "86%", height: 14, borderRadius: 7, background: "#dde1e8", overflow: "hidden", opacity: f > 76 ? 1 : 0 }}>
                  <div style={{ width: `${progress}%`, height: "100%", background: "linear-gradient(90deg,#22c55e,#16a34a)" }} />
                </div>
                <div style={{ fontSize: 18, color: "#555", opacity: f > 76 ? 1 : 0 }}>
                  {progress < 100 ? `Uploading to our servers… ${Math.round(progress)}%` : "Upload complete ✓"}
                </div>
              </div>
              <div
                style={{
                  position: "absolute",
                  left: 455,
                  top: 500,
                  width: 250,
                  height: 66,
                  borderRadius: 14,
                  background: "#2563EB",
                  color: "#fff",
                  fontSize: 26,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  transform: `scale(${pressed ? 0.94 : 1})`,
                  boxShadow: "0 10px 30px rgba(37,99,235,0.4)",
                }}
              >
                <Icon name="upload" size={28} color="#fff" /> Upload
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* the cloud it disappears into */}
      <div
        style={{
          position: "absolute",
          left: 1560,
          top: 70,
          opacity: interpolate(f, [112, 126], [0, 1], clamp),
          transform: `scale(${cloudPulse})`,
          textAlign: "center",
        }}
      >
        <Icon name="cloud" size={190} color={C.sub} stroke={1.3} />
        <div style={{ fontFamily: MONO, color: C.sub, fontSize: 20, marginTop: -20 }}>unknown-server-04</div>
      </div>
      {/* the user's photo */}
      <div
        style={{
          position: "absolute",
          left: tx - 140,
          top: ty - 80,
          width: 280 * (1 - flyP * 0.6),
          height: 158 * (1 - flyP * 0.6),
          borderRadius: 12,
          overflow: "hidden",
          opacity: interpolate(f, [30, 40], [0, 1], clamp) * interpolate(f, [156, 164], [1, 0], clamp),
          boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
          transform: `rotate(${flyP * 14}deg)`,
        }}
      >
        <Img src={PHOTO} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      <Cursor
        appearAt={18}
        path={[
          { f: 18, x: 1300, y: 900 },
          { f: 70, x: 960, y: 830 },
          { f: 104, x: 980, y: 845 },
          { f: 150, x: 1200, y: 960 },
        ]}
        clicks={[76]}
      />
    </SceneFade>
  );
};

/* -------------------------------------------------- 4. What happens next */
const DANGERS = [
  { t: "Stored on unknown servers", x: 90, y: 300, d: 42 },
  { t: "Used to train AI models", x: 1240, y: 300, d: 70 },
  { t: "Shared with third parties", x: 90, y: 660, d: 88 },
  { t: "Leaked in data breaches", x: 1250, y: 660, d: 104 },
];

export const Danger: React.FC = () => {
  const f = useCurrentFrame();
  const shake = (f > 42 && f < 120 && f % 18 < 4) || (f > 182 && f < 192) ? (random(`sh${f}`) - 0.5) * 18 : 0;
  const goneP = useSpring(181, { damping: 9, stiffness: 200 });
  const glitchOn = (f > 181 && f < 195) || f % 37 < 2;
  const copies = 7;
  return (
    <SceneFade dur={240} outF={6}>
      <AbsoluteFill style={{ transform: `translate(${shake}px, ${shake * 0.6}px)` }}>
        <Background tint="red" />
        {/* the photo is copied again and again */}
        {new Array(copies).fill(0).map((_, i) => {
          const p = interpolate(f, [8 + i * 5, 40 + i * 5], [0, 1], { ...clamp, easing: easeOut });
          const ang = (i / copies) * Math.PI * 2 + 0.4;
          const r = 330 * p;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 960 + Math.cos(ang) * r * 1.5 - 120,
                top: 520 + Math.sin(ang) * r * 0.8 - 68,
                width: 240,
                height: 135,
                borderRadius: 12,
                overflow: "hidden",
                opacity: p * 0.55,
                transform: `rotate(${(i - 3) * 8 * p}deg) scale(${0.6 + p * 0.3})`,
                border: `2px solid ${C.red}88`,
                filter: "saturate(0.4)",
              }}
            >
              <Img src={PHOTO} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          );
        })}
        {/* server rack at the centre */}
        <div style={{ position: "absolute", left: 960 - 130, top: 520 - 150, width: 260, height: 300, display: "flex", flexDirection: "column", gap: 12, opacity: interpolate(f, [0, 12], [0, 1], clamp) }}>
          {[0, 1, 2].map((r) => (
            <div key={r} style={{ flex: 1, borderRadius: 12, background: "linear-gradient(180deg,#1c2133,#11141f)", border: `1px solid ${C.red}55`, display: "flex", alignItems: "center", padding: "0 18px", gap: 10, boxShadow: `0 0 30px ${C.red}22` }}>
              {[0, 1, 2].map((l) => (
                <div key={l} style={{ width: 10, height: 10, borderRadius: 5, background: (Math.floor(f / 4) + l + r) % 3 === 0 ? C.red : "#3a2028", boxShadow: `0 0 10px ${C.red}` }} />
              ))}
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: "#2a2f40", marginLeft: 12 }} />
            </div>
          ))}
        </div>
        {DANGERS.map((d, i) => (
          <DangerChip key={i} {...d} />
        ))}
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingTop: 0 }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `rgba(7,11,22,${interpolate(f, [138, 150], [0, 0.82], clamp)})`,
            }}
          />
          <div style={{ position: "relative", textAlign: "center", fontFamily: FONT }}>
            <div style={{ fontSize: 72, fontWeight: 700, color: C.text, opacity: interpolate(f, [144, 154], [0, 1], clamp), transform: `translateY(${interpolate(f, [144, 154], [30, 0], clamp)}px)` }}>
              Your privacy?
            </div>
            <div
              style={{
                fontSize: 190,
                fontWeight: 800,
                color: C.red,
                letterSpacing: -6,
                lineHeight: 1,
                marginTop: 10,
                transform: `scale(${interpolate(goneP, [0, 1], [2.2, 1])})`,
                opacity: interpolate(f, [181, 185], [0, 1], clamp),
                textShadow: glitchOn ? `-8px 0 rgba(0,255,255,0.7), 8px 0 rgba(255,0,80,0.8)` : `0 0 60px ${C.red}88`,
                clipPath: glitchOn ? `inset(${random(`g${f}`) * 40}% 0 ${random(`h${f}`) * 30}% 0)` : undefined,
              }}
            >
              Gone.
            </div>
          </div>
        </AbsoluteFill>
        {/* scanline glitch overlay */}
        {glitchOn && (
          <AbsoluteFill style={{ background: "repeating-linear-gradient(0deg, rgba(255,59,78,0.08) 0 2px, transparent 2px 6px)", mixBlendMode: "screen" }} />
        )}
      </AbsoluteFill>
    </SceneFade>
  );
};

const DangerChip: React.FC<(typeof DANGERS)[number]> = ({ t, x, y, d }) => {
  const f = useCurrentFrame();
  const p = useSpring(d, { damping: 10, stiffness: 220 });
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `scale(${interpolate(p, [0, 1], [1.8, 1])}) rotate(${(1 - p) * -6}deg)`,
        opacity: interpolate(f, [d, d + 4], [0, 1], clamp),
      }}
    >
      <Chip icon="x" text={t} color={C.red} size={30} />
    </div>
  );
};

/* ------------------------------------------------------- 5. Not anymore */
export const Turn: React.FC = () => {
  const f = useCurrentFrame();
  const o = interpolate(f, [6, 20], [0, 1], clamp);
  const s = interpolate(f, [6, 60], [0.94, 1.06]);
  const spacing = interpolate(f, [6, 60], [30, 4]);
  return (
    <AbsoluteFill style={{ background: "#000", alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 120,
          color: C.text,
          letterSpacing: spacing,
          opacity: o * interpolate(f, [52, 60], [1, 0], clamp),
          transform: `scale(${s})`,
          filter: `blur(${interpolate(f, [6, 20], [14, 0], clamp)}px)`,
        }}
      >
        Not <span style={{ color: C.orange }}>anymore.</span>
      </div>
    </AbsoluteFill>
  );
};

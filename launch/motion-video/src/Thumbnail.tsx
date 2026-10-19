import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { Icon, Logo } from "./components";
import { C, FONT } from "./theme";

/** YouTube thumbnail, 1280×720. Render: npm run thumb */
export const Thumbnail: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg, fontFamily: FONT }}>
    <Img src={staticFile("img/thumb-bg.webp")} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover" }} />
    {/* darken the left so the headline reads at any size */}
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(90deg, rgba(7,11,22,0.97) 0%, rgba(7,11,22,0.9) 28%, rgba(7,11,22,0.55) 46%, rgba(7,11,22,0) 60%)",
      }}
    />
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 20% 50%, rgba(255,122,0,0.18), transparent 50%)" }} />

    <div style={{ position: "absolute", left: 58, top: 46, display: "flex", alignItems: "center", gap: 14 }}>
      <Logo size={64} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 38, fontWeight: 800, color: C.text, letterSpacing: -1, lineHeight: 1 }}>
          MyPixel<span style={{ color: C.orange }}>Guard</span>
        </span>
        <span style={{ fontSize: 17, fontWeight: 600, color: "#CBD5E1", letterSpacing: 0.5, marginTop: 6 }}>
          A product of <span style={{ color: C.text, fontWeight: 800 }}>Agentiq BD</span>
        </span>
      </div>
    </div>

    <div style={{ position: "absolute", left: 52, top: 150, lineHeight: 0.92, letterSpacing: -3 }}>
      <div
        style={{
          fontSize: 178,
          fontWeight: 800,
          color: C.orange,
          textShadow: "0 0 50px rgba(255,122,0,0.55), 0 8px 0 rgba(0,0,0,0.35)",
        }}
      >
        STOP
      </div>
      <div style={{ fontSize: 88, fontWeight: 800, color: "#fff", textShadow: "0 6px 24px rgba(0,0,0,0.8)", marginTop: 6 }}>
        UPLOADING
      </div>
      <div style={{ fontSize: 88, fontWeight: 800, color: "#fff", textShadow: "0 6px 24px rgba(0,0,0,0.8)" }}>YOUR PHOTOS</div>
    </div>

    <div
      style={{
        position: "absolute",
        left: 58,
        top: 548,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "16px 30px 16px 20px",
        borderRadius: 999,
        background: "linear-gradient(135deg, #22C55E, #15803D)",
        boxShadow: "0 12px 40px rgba(34,197,94,0.45), inset 0 1px 0 rgba(255,255,255,0.35)",
        color: "#fff",
        fontSize: 40,
        fontWeight: 800,
        letterSpacing: -0.5,
      }}
    >
      <div style={{ width: 48, height: 48, borderRadius: 24, background: "rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name="check" size={34} color="#fff" stroke={3.4} />
      </div>
      100% OFFLINE
    </div>
  </AbsoluteFill>
);

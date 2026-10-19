import { loadFont as loadSora } from "@remotion/google-fonts/Sora";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const sora = loadSora("normal", { weights: ["400", "600", "700", "800"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["500", "700"], subsets: ["latin"] });

export const FONT = sora.fontFamily;
export const MONO = mono.fontFamily;

export const C = {
  bg: "#070B16",
  navy: "#111827",
  panel: "rgba(255,255,255,0.055)",
  border: "rgba(255,255,255,0.12)",
  text: "#F8FAFC",
  sub: "#94A3B8",
  orange: "#FF7A00",
  orange2: "#FFA94D",
  red: "#FF3B4E",
  green: "#22C55E",
};

export const FPS = 30;
export const BEAT = 15; // frames per beat at 120 BPM
export const BAR = 60;

// Scene start frames (each bar = 2 s)
export const S = {
  hook: 0,
  meta: 120,
  upload: 300,
  danger: 480,
  turn: 720,
  reveal: 780,
  hero: 960,
  features: 1140,
  grid: 2040,
  compare: 2220,
  cta: 2400,
  end: 2640,
};
// Per-feature beat length (frames), sized to each voice-over line
export const FEATURE_LENS = [150, 150, 120, 120, 120, 120, 120];
export const FEATURE_STARTS = FEATURE_LENS.map((_, i) => FEATURE_LENS.slice(0, i).reduce((a, b) => a + b, 0));

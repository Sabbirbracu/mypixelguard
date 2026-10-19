import type { ResizePlan, ResizeSettings } from "./types";

/**
 * Same maths as `resize::plan` in core/src/resize.rs, run in the UI so the preview follows every keystroke
 * and drag without a round trip. The export itself always uses the Rust version.
 */
export function planResize(original: [number, number], s: ResizeSettings): ResizePlan {
  const [ow, oh] = original;
  let cw: number, ch: number, scaleUp: boolean;
  let draw = { x: 0, y: 0, w: ow, h: oh };
  if (s.mode === "percent" || s.lockAspect) {
    const f = s.mode === "percent" ? Math.max(s.percent, 1) / 100 : s.driver === "width" ? s.width / ow : s.height / oh;
    cw = ow * f; ch = oh * f; scaleUp = f > 1;
  } else {
    const tw = Math.max(s.width, 1), th = Math.max(s.height, 1);
    if (s.fit === "pad") {
      const f = Math.min(tw / ow, th / oh);
      cw = tw; ch = th; draw = { x: (tw - ow * f) / 2, y: (th - oh * f) / 2, w: ow * f, h: oh * f }; scaleUp = f > 1;
    } else if (s.fit === "fit") {
      const f = Math.min(tw / ow, th / oh);
      cw = ow * f; ch = oh * f; scaleUp = f > 1;
    } else if (s.fit === "fill") {
      const f = Math.max(tw / ow, th / oh);
      const ax = Math.min(Math.max(s.anchor[0], 0), 1), ay = Math.min(Math.max(s.anchor[1], 0), 1);
      cw = tw; ch = th; draw = { x: (tw - ow * f) * ax, y: (th - oh * f) * ay, w: ow * f, h: oh * f }; scaleUp = f > 1;
    } else {
      cw = tw; ch = th; scaleUp = tw > ow || th > oh;
    }
  }
  if (scaleUp && s.neverEnlarge) {
    return { canvas_width: ow, canvas_height: oh, draw: { x: 0, y: 0, w: ow, h: oh }, enlarges: false, unchanged: true };
  }
  const w = Math.max(Math.round(cw), 1), h = Math.max(Math.round(ch), 1);
  if (draw.w === ow && draw.h === oh && draw.x === 0 && draw.y === 0) draw = { x: 0, y: 0, w, h };
  return { canvas_width: w, canvas_height: h, draw, enlarges: scaleUp, unchanged: w === ow && h === oh };
}

export type Bars = "sides" | "topBottom";

export function barsFor(p: ResizePlan): Bars | null {
  if (p.draw.w < p.canvas_width - 0.5) return "sides";
  if (p.draw.h < p.canvas_height - 0.5) return "topBottom";
  return null;
}

export interface BorderSamples { start: string[]; end: string[] }

/** Same sampling as `resize::border_samples`: 12 averages along each outer edge of a 96 × 96 copy over white. */
export function borderSamples(img: HTMLImageElement, bars: Bars, count = 12): BorderSamples | null {
  const n = 96;
  const canvas = document.createElement("canvas");
  canvas.width = n; canvas.height = n;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, n, n);
  ctx.drawImage(img, 0, 0, n, n);
  const px = ctx.getImageData(0, 0, n, n).data;
  const step = Math.max(Math.floor(n / count), 1);
  const average = (points: [number, number][]) => {
    let r = 0, g = 0, b = 0;
    for (const [x, y] of points) { const i = (y * n + x) * 4; r += px[i]; g += px[i + 1]; b += px[i + 2]; }
    const k = Math.max(points.length, 1);
    return `rgb(${Math.round(r / k)}, ${Math.round(g / k)}, ${Math.round(b / k)})`;
  };
  const along = (edge: (j: number) => [number, number][]) =>
    Array.from({ length: count }, (_, i) => { const pts: [number, number][] = []; for (let j = i * step; j < Math.min((i + 1) * step, n); j++) pts.push(...edge(j)); return average(pts); });
  return bars === "sides"
    ? { start: along((y) => [[0, y], [1, y]]), end: along((y) => [[n - 1, y], [n - 2, y]]) }
    : { start: along((x) => [[x, 0], [x, 1]]), end: along((x) => [[x, n - 1], [x, n - 2]]) };
}

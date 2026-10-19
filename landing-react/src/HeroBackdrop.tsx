// Hero background: a warm spotlight from above, a fine grid, and a field of small "pixels" that is dense at the sides and
// dissolves toward the headline, like an image being cleaned. A soft scan line drifts down and a few
// pixels twinkle; both stop for prefers-reduced-motion. Pixel layout is seeded, so server and client render the same.

const CELL = 64;            // matches .hb-grid background-size
const SUB = 16;             // a "pixel" is a quarter of a grid cell
const COLS = 37, ROWS = 12; // 2368 × 768 px — wider than any screen; the SVG is centred, not scaled
const W = COLS * CELL, H = ROWS * CELL;

// Pixels are bucketed by colour and strength and drawn as one <path> per bucket, which keeps the HTML small.
const LEVELS = [0.07, 0.13, 0.22, 0.34];
type Layer = { fill: string; o: number; d: string };
type Spark = { x: number; y: number; tw: number };

function build(): { layers: Layer[]; sparks: Spark[] } {
  let seed = 20261020;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const buckets: Record<string, string[]> = {};
  const sparks: Spark[] = [];
  const n = CELL / SUB, cols = COLS * n, rows = ROWS * n;
  const cx = cols / 2, cy = 3.2 * n;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // 0 behind the headline, rising toward the sides: the image "dissolves" into clean space in the middle
      const dx = (c + 0.5 - cx) / (9.5 * n), dy = (r + 0.5 - cy) / (6 * n);
      const d = Math.sqrt(dx * dx + dy * dy);
      const side = Math.min(1, Math.max(0, (d - 0.7) / 1.1));
      const fade = Math.max(0, 1 - r / rows) ** 1.1;
      // clumpy noise so pixels gather in blocks instead of salt-and-pepper
      const blk = Math.sin(Math.floor(c / 3) * 12.9898 + Math.floor(r / 3) * 78.233) * 43758.5453;
      const clump = 0.55 + 0.9 * (blk - Math.floor(blk));
      const p = side * side * fade * clump * 0.78;
      if (rnd() > p) continue;
      const x = c * SUB + 1, y = r * SUB + 1;
      if (rnd() < 0.012 * side) { sparks.push({ x, y, tw: 1 + Math.floor(rnd() * 4) }); continue; }
      const warm = rnd() < 0.25 + 0.6 * (1 - r / rows);      // warm near the light, cooler lower down
      const lv = Math.min(3, Math.floor(rnd() * 2 + side * 2.2));
      (buckets[`${warm ? 1 : 0}${lv}`] ??= []).push(`M${x} ${y}h14v14h-14z`);
    }
  }
  const layers = Object.entries(buckets).map(([k, ds]) => ({
    fill: k[0] === "1" ? "#FF8A1E" : "#8FA8FF", o: LEVELS[+k[1]] * (k[0] === "1" ? 1 : 0.7), d: ds.join(""),
  }));
  return { layers, sparks };
}

const ART = build();

export function HeroBackdrop() {
  return (
    <div className="hero-bg" aria-hidden="true">
      <div className="hb-light" />
      <div className="hb-grid" />
      <svg className="hb-pixels" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {ART.layers.map((l, i) => <path key={i} d={l.d} fill={l.fill} opacity={l.o} />)}
        {ART.sparks.map((p, i) => <rect key={i} className={`tw tw${p.tw}`} x={p.x} y={p.y} width={14} height={14} fill="#FFB066" />)}
      </svg>
      <div className="hb-scan" />
      <svg className="hb-arc" viewBox="0 0 1600 420" preserveAspectRatio="xMidYMin slice">
        <defs>
          <linearGradient id="hb-line" x1="0" x2="1">
            <stop offset="0" stopColor="#FFB066" stopOpacity="0" />
            <stop offset="0.5" stopColor="#FFC58A" stopOpacity="0.95" />
            <stop offset="1" stopColor="#FFB066" stopOpacity="0" />
          </linearGradient>
          <filter id="hb-blur" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="14" /></filter>
        </defs>
        <path d="M-200 330 Q800 -300 1800 330" fill="none" stroke="#FF8A1E" strokeOpacity="0.45" strokeWidth="14" filter="url(#hb-blur)" />
        <path d="M-200 330 Q800 -300 1800 330" fill="none" stroke="url(#hb-line)" strokeWidth="1.6" />
      </svg>
    </div>
  );
}

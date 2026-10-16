// Hero background: clean and calm. A warm spotlight from above, a cool blue glow at the sides for depth, a fine grid that
// fades out, and one thin glowing arc like a horizon. Static — nothing moves, so it never competes with the headline.
export function HeroBackdrop() {
  return (
    <div className="hero-bg" aria-hidden="true">
      <div className="hb-light" />
      <div className="hb-grid" />
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

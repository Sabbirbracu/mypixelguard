// Download links and availability. Edit here — every "Download" button follows.
export const DOWNLOADS = {
  mac: "https://agentiqbd.com/downloads/MyPixelGuard-mac.dmg",
  windows: "https://agentiqbd.com/downloads/MyPixelGuard-windows-setup.exe",
} as const;

// "soon" shows a "Coming soon" badge and makes the button non-clickable.
export const STATUS: Record<"mac" | "windows", "ready" | "soon"> = { mac: "ready", windows: "ready" };

// Where the visitor counter (server/visitor-counter.mjs) lives, e.g. "https://counter.your-site.com".
// Set it at build time:  VITE_VISITOR_API=https://counter.your-site.com pnpm build
// Left empty, the counter is simply not shown (no fake numbers).
export const VISITOR_API: string = ((import.meta.env.VITE_VISITOR_API as string | undefined) ?? "").replace(/\/+$/, "");

export const TITLE = {
  en: "MyPixelGuard — Your Images. Your Privacy. Your Control.",
  bn: "MyPixelGuard — আপনার ছবি। আপনার প্রাইভেসি। আপনার কন্ট্রোল।",
};

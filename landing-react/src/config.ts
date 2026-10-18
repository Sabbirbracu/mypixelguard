// Download links and availability. Edit here — every "Download" button follows.
export const DOWNLOADS = {
  mac: "https://mypixelguard.agentiqbd.com/downloads/MyPixelGuard-mac.dmg",
  windows: "https://mypixelguard.agentiqbd.com/downloads/MyPixelGuard-windows-setup.exe",
} as const;

// The page each "Download" button opens (install guide + automatic download). Built by scripts/build.mjs.
export const DOWNLOAD_PAGES = {
  mac: "/download/mac/",
  windows: "/download/windows/",
} as const;

// Seconds the download page waits before the file starts downloading by itself.
export const DOWNLOAD_DELAY = 8;

// Short video that shows the installation, one per platform. Leave "" to hide the video block.
// Use a direct file (.mp4/.webm, e.g. "/downloads/install-mac.mp4") or a YouTube/Vimeo embed link.
export const INSTALL_VIDEO = { mac: "", windows: "" } as const;

// Public VirusTotal report of each installer (virustotal.com → upload the file → copy the page link, without "?nocache").
// The report belongs to that exact file: scan again and update this whenever you publish a new installer.
// Left empty, no "virus scan" claim is shown anywhere — the site never claims a scan that was not done.
export interface VtReport { url: string; flagged: number; vendors: number }
export const VIRUSTOTAL: { mac: VtReport | null; windows: VtReport | null } = {
  mac: { url: "https://www.virustotal.com/gui/file/8dbeb9bf6d39f78f4619e5a4bbb6f56647871295b5fb78572d3f57c2cc9a8647", flagged: 0, vendors: 59 },
  windows: null,
};

// Where people can ask for help (shown on the download pages). Leave "" to hide it.
export const SUPPORT_EMAIL = "";

// "soon" shows a "Coming soon" badge and makes the button non-clickable.
export const STATUS: Record<"mac" | "windows", "ready" | "soon"> = { mac: "ready", windows: "ready" };

// Where the visitor counter (server/visitor-counter.mjs) lives, e.g. "https://counter.your-site.com".
// Set it at build time:  VITE_VISITOR_API=https://counter.your-site.com pnpm build
// Left empty, the counter is simply not shown (no fake numbers).
export const VISITOR_API: string = ((import.meta.env.VITE_VISITOR_API as string | undefined) ?? "").replace(/\/+$/, "");

export const TITLE = {
  en: "MyPixelGuard: Free Metadata Remover Tool for Mac & Windows",
  bn: "MyPixelGuard: ছবির মেটাডেটা (EXIF) রিমুভার — Mac ও Windows",
};

# MyPixelGuard landing page (React)

The same page as `../landing`, rebuilt as a React + Vite app that is **pre-rendered to static HTML at build time**
(so the page is readable before any JavaScript runs) with optimised assets. `../landing` is left untouched as a fallback.

## Commands
    pnpm install
    pnpm dev          # live-reload development server
    pnpm build        # -> dist/  (client bundle + pre-rendered index.html)
    pnpm preview      # serves dist/ on http://localhost:4173 with brotli and long-lived caching
    pnpm typecheck

Deploy the `dist/` folder to any static host (Netlify, Cloudflare Pages, GitHub Pages, S3 …).
Hashed files in `dist/assets/` can be cached forever; `index.html` should not be.

## Where things are
| What | Where |
|---|---|
| Download links and "Coming soon" status | `src/config.ts` |
| Page sections (English + বাংলা side by side in each `<L en=… bn=…/>`) | `src/sections/*.tsx` |
| Language state, `<L>`, `<Pic>`, `<Dl>` helpers | `src/ui.tsx` |
| Language pop-up | `src/LangGate.tsx` (`?choose-language` shows it again, `?lang=bn` skips it) |
| Tabs, scroll reveal, tab-image prefetch | `src/hooks.ts` |
| Styles (unchanged design) | `src/styles.css` |
| Build / pre-render / preview scripts | `scripts/` |

`scripts/convert-html.mjs` generated `src/sections` from `../landing/index.html`. It is only needed if you keep editing the old
HTML and want to regenerate; otherwise edit the `.tsx` files directly.

## Why it is faster
* Screenshots are WebP: 4.3 MB → 0.7 MB for all 14 images.
* The page is pre-rendered: `index.html` already contains every section (7 KB compressed), so text and the hero paint immediately.
* Fonts: the logo font is a 5 KB subset (was 93 KB); the full 105 KB Bengali font is only fetched in Bangla mode.
* Hero screenshot is `fetchpriority=high`; everything else is lazy, and hidden tool-tab images are prefetched when the browser is idle.
* Hashed filenames → cacheable for a year.

Fonts: Inter, Noto Sans Bengali, Sora (SIL Open Font License, see `src/assets/fonts/OFL*.txt`).
Photos: free Unsplash photos, credits in `../landing/assets/img/CREDITS.md`.

## Visitor counter (real, shown at the top of the hero)
A static page cannot count anyone by itself, so there is a tiny server: `server/visitor-counter.mjs` (no dependencies, one file).
The page asks it once per browser and shows the real total. **If no server is configured or it is unreachable, nothing is shown —
the page never displays a made-up number.**

**Try it locally**

    pnpm counter                                   # http://localhost:8787
    VITE_VISITOR_API=http://localhost:8787 pnpm build && pnpm preview

**Put it online**
1. Run `server/visitor-counter.mjs` on any host that runs Node and has a disk that survives restarts (a VPS, Render/Railway/Fly.io with a volume,
   or use `server/Dockerfile`). Set `ALLOW_ORIGIN=https://your-site.com` and, behind a proxy, `TRUST_PROXY=1`.
   Optional: `START_AT=1200` to continue from a number you already had. It must be served over HTTPS because the site is.
2. Build the site pointing at it: `VITE_VISITOR_API=https://counter.your-site.com pnpm build`, then deploy `dist/`.

**What "visitor" means.** One browser = one visitor: the page makes a random id once and keeps it in localStorage; the server counts each id once.
Clearing site data, private windows or a second browser count again, and bots are ignored — as with any cookie-free counter, treat the number as
"about this many people". The server stores only salted hashes of the ids (no IP, no user agent) in `data/visitors.json`, so there is nothing to
declare or ask consent for beyond mentioning it in your privacy note. Back that file up if the number matters to you.

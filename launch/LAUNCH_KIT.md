# MyPixelGuard — launch kit

Everything needed to list MyPixelGuard on launch sites and directories. Assets are in `launch/assets/` (rebuild with `python3 launch/make_assets.py`).
Rules of these sites change: read each site's own submission page and community rules on the day. Nothing here was submitted for you — every site needs *your* account.

## 0. Before you launch (these decide how it goes)

| Check | Why |
|---|---|
| Install the Windows `.exe` on a real Windows PC and try all tools, offline | It has never been run on Windows. Launch crowds will find every bug in the first hour. |
| Decide the Mac warning | Without an Apple Developer ID, macOS shows "Apple could not verify…". On a launch day that becomes the top comment. $99/year fixes it (`package_dmg.sh` already supports it). If you launch before, say it openly in your first comment. |
| Scan the Windows installer on virustotal.com and add the link to `landing-react/src/config.ts` | Same trust badge the Mac page has. |
| Put a real address in `SUPPORT_EMAIL` in `config.ts` | People will ask for help. |
| Use one real account per site, in your own name | Do not create fake accounts or ask friends to vote in bulk — it breaks the rules and sites remove the listing. |
| Be ready to answer comments for the first 3–4 hours | This matters more than any other tactic. |

## 1. Core copy (reuse everywhere)

**Name:** MyPixelGuard  
**URL:** https://mypixelguard.agentiqbd.com  
**Publisher:** Agentiq BD (https://agentiqbd.com)  
**Platforms:** macOS 13+ (Apple Silicon and Intel), Windows 10/11 (64-bit)  
**Price wording:** "Free to download." (Do not write "free forever" — pricing may change.)  
**Categories / tags:** Privacy, Photo editing, Productivity, Developer/Utility tools, Mac, Windows, Desktop app

**Tagline (≤60 chars)** — pick one:
- `Remove hidden photo data and blur faces, fully offline` (54)
- `See what your photos reveal. Remove it. Offline.` (48)
- `Photo privacy toolkit: remove metadata, offline` (47)

**One-liner (≈140 chars):**  
MyPixelGuard shows what's hidden inside your photos — location, device, dates, AI labels — and removes it. Offline, for Mac and Windows.

**Short description (≈260 chars):**  
MyPixelGuard is a photo metadata (EXIF) remover and image privacy toolkit for Mac and Windows. See what a photo gives away, remove EXIF, GPS and AI metadata, blur faces and private text, remove backgrounds, and resize, compress and convert — all offline, nothing uploaded.

**Long description:**  
Every photo carries hidden data: where it was taken, which device took it, when, and sometimes labels that mark it as AI-made. MyPixelGuard reads all of it, explains it in plain language, and lets you remove exactly what you choose.

- **Inspect** — a "Safe to share?" report: location, device, capture time, author, software. EXIF, IPTC, XMP, GPS and C2PA Content Credentials.
- **Clean** — remove everything or only some of it. Cleaned copies are saved separately; your originals are never overwritten, and each saved file is re-scanned.
- **Redact** — finds faces, emails, phone numbers and number plates on your computer; blur, pixelate or cover them with an exact preview.
- **Remove Background** — subject pixels stay exactly as they were; saved losslessly as PNG or TIFF.
- **Resize, Compress, Convert, Batch** — presets, before/after preview, whole folders, reusable recipes.

It runs entirely on your own machine. The app contains no network code, needs no account and works offline. English and Bangla.

**Honest limits (say these yourself, it builds trust):**
- It removes metadata labels such as C2PA Content Credentials. It cannot remove invisible pixel watermarks such as SynthID, and it does not remove visible watermarks.
- Face and text detection is good, not perfect — you review every region before exporting.
- New publisher: macOS/Windows show a first-run warning (explained step by step on the download page).

## 2. Assets

| File | Use |
|---|---|
| `logo-240.png` / `logo-512.png` | Thumbnail / logo (Product Hunt asks 240×240) |
| `gallery-1…5-*.png` (1270×760) | Gallery images, in this order |
| `social-card-1200x630.png` | Link previews, posts |
| *(you)* a 30–60 s screen recording | Most sites reward a short demo: drop a photo → see what it hides → Clean → verify. Record with Cmd+Shift+5. |

## 3. Where to list it

### Launch-day platforms (one big push)
| Site | Fit | Notes |
|---|---|---|
| **Product Hunt** | Broad tech audience | Guides agree: thumbnail 240×240, gallery 1270×760, tagline ≤60 chars, a first comment from the maker. Schedule for 12:01 AM Pacific. Tue–Thu is busiest. Don't ask for upvotes directly. |
| **Hacker News — "Show HN"** | Developers, privacy-minded | Title: `Show HN: MyPixelGuard – offline photo metadata remover and redactor`. People must be able to try it without signing up (you can). Be plain and technical, no marketing words; reply to everything. One post, don't repost. |
| **Reddit** | Privacy, Mac and Windows app communities | Read each community's self-promotion rules first; many restrict or ban it. Say you are the developer. Offer value (e.g. a post about what photos leak), not just a link. |

### Directories that keep sending visitors (do these all, same week)
| Site | Why |
|---|---|
| **AlternativeTo** | List as an alternative to ExifTool, ExifCleaner, ImageOptim, remove.bg, etc. People searching "X alternative" find you. |
| **SaaSHub** | Directory with long-term search value. |
| **Uneed**, **Peerlist**, **Fazier**, **MicroLaunch**, **BetaList** | Indie/maker launch sites. Some have free queues and paid fast-tracks — choose the free option. |
| **MacUpdate**, **Softpedia** | Classic software download directories (Mac / Windows). Their submit forms ask for download URL, version, screenshots, short description. |
| **Indie Hackers** | A "Show" post with the story of why you built it. |
| **Alternative listings on Slant, G2, Capterra** | Later, when you have reviews. |

### Closer to home
LinkedIn post from the Agentiq BD page, Facebook tech groups and Startup Bangladesh style communities, and a link from agentiqbd.com. The Bangla page/language is a real differentiator in Bangladeshi communities.

### Later (needs signing/accounts)
Microsoft Store, winget, Homebrew cask, Mac App Store (see `APP_STORE_GUIDE.md`). All are easier after the app is signed.

## 4. Product Hunt — maker's first comment (edit freely)

> Hi Product Hunt! I'm [name] from Agentiq BD.
>
> I built MyPixelGuard because every photo I shared carried more than I realised — exact location, phone model, time, sometimes AI labels — and the tools that remove it either live in the command line or ask you to upload the photo to a website.
>
> MyPixelGuard runs entirely on your Mac or Windows PC. It shows what a photo is hiding in plain language, lets you remove only what you choose (or everything), blurs faces and private text, removes backgrounds without losing quality, and handles resize/compress/convert for whole folders. There's no account and no network code, so your photos never leave your computer.
>
> What it can't do: it removes metadata (including C2PA Content Credentials) but not invisible watermarks like SynthID. And it's from a new publisher, so macOS/Windows show a first-run warning — the download page walks you through it, and there's a SHA-256 checksum and a VirusTotal report so you can check the file yourself.
>
> It's free to download. I'd love to hear what you'd want it to do next. I'll be here all day.

## 5. Show HN text (post body)

> MyPixelGuard is an offline desktop app (Mac, Windows) that shows what a photo reveals — EXIF/GPS/IPTC/XMP/C2PA — and removes it, plus face/text redaction, background removal and batch resize/compress. No network code; processing is on-device (Apple Vision on Mac; a bundled ONNX model and Windows OCR on Windows). Originals are never overwritten and each saved file is re-read to verify. Not covered: invisible watermarks (SynthID) and visible watermarks. The installers are unsigned (no Apple/Microsoft cert yet), so expect a first-run warning; checksums and a VirusTotal report are on the download page. Feedback welcome.

## 6. Launch week plan

| When | Do |
|---|---|
| T-7 days | Windows PC test, VirusTotal for Windows, support email, Product Hunt account active a while (comment on other launches), draft everything above. |
| T-1 | Schedule Product Hunt. Prepare replies to likely questions (uploads? SynthID? why unsigned? price?). |
| Day 0 | Product Hunt at 12:01 AM PT → post first comment → Show HN a few hours later (not the same minute) → LinkedIn/Facebook. Answer every comment. |
| Day 1–7 | Submit to each directory, 2–3 per day. Check Search Console for new queries. |

## 7. Tracking
Add `?ref=producthunt`, `?ref=hn`, `?ref=alternativeto` … to each link. The page ignores unknown parameters, and the visitor counter plus Search Console show the effect. For per-source numbers add a privacy-friendly analytics script (for example Plausible or Cloudflare Web Analytics) — ask before adding anything that tracks visitors.

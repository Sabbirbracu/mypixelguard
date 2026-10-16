# MyPixelGuard (macOS)

A privacy-focused image toolkit for Mac. Inspect, clean, convert, resize and compress your images,
locally on your device. English and বাংলা (Settings → General → Language).

## Tools
| Tool | What it does |
|---|---|
| Inspect | EXIF / IPTC / XMP / GPS / C2PA, AI-provenance evidence (not a definitive AI detector) |
| Clean | Choose what to remove; preview of removed vs kept; consent prompt before Content Credentials are removed; verified output |
| Convert | JPEG / PNG / HEIC / TIFF (WebP when this macOS can write it), batch, background colour for transparency, optional metadata keep |
| Resize | Pixels (aspect lock) or percentage; Fit / Fill (crop) / Stretch; editable + saveable presets; upscale warning |
| Compress | Quality slider, before/after preview, quality-vs-size chart, best-effort target size (e.g. 200 KB) |
| Remove Background | On-device subject cut-out (macOS 14+). Only an alpha channel is added: subject colors, resolution and color profile are untouched, saved lossless as PNG/TIFF. Transparent or solid-color background, edge smoothing, live before/after preview |

All tools: originals are never changed, output goes to a folder you choose, existing files are never
overwritten, every saved file is read back and verified, with progress, cancel and a failed-file list.

## Build & run
    ./build_app.sh
    open "build/MyPixelGuard.app"

Requires only the Xcode Command Line Tools. No third-party dependencies, no network code.

## Tests
    swift build && .build/debug/MetaDataRemover --cli selftest

Covers orientation, transparency flattening, metadata keep/strip, resize maths, target-size search,
background-removal pixel exactness, safe export naming, and English/Bangla string parity.

Try background removal headless: `.build/debug/MetaDataRemover --cli removebg photo.jpg [outdir] [edge 0…1]`

## Brand identity

The orange shield, six-blade aperture, and pixel motif are redrawn as vectors from the supplied brand board.
- Primary orange `#FF7A00`, navy `#111827`, secondary gray `#6B7280`, light background `#F8FAFC`.
- Light and dark appearances share the orange accent; foreground and surface tokens adapt for readability.
- Sora Regular, SemiBold, and Bold are bundled locally under the SIL Open Font License; see `Sources/MetaDataRemover/Fonts/OFL.txt`. Source: https://github.com/sora-xor/sora-font.
- `BrandArtwork.swift` is the shared source for the in-app mark, icon, and SVG/PNG exports in `Resources/Brand`. Rebuild to regenerate them.
- The existing executable and bundle identifier are retained for compatibility with saved preferences. The display name and app bundle are MyPixelGuard.

## Code layout
- `Engine.swift`, `Analyzer.swift` — byte-level metadata parsing and cleaning (unchanged core)
- `ImageCodec.swift` — ImageIO read/encode, format capability checks
- `ImageConversionService`, `ImageResizeService`, `ImageCompressionService`, `BackgroundRemovalService`, `ImageExportService` — one service per feature
- `Theme.swift` — MyPixelGuard design tokens; `Views.swift`, `ToolViews.swift`, `SettingsView.swift` — UI
- `Localization.swift`, `Strings_en.swift`, `Strings_bn.swift` — add a language by adding a `Strings_xx.swift` table and registering it in `Localizer`

## Limits
Metadata removal can't remove invisible pixel watermarks (e.g. SynthID), and finding no metadata does
not prove an image was made by a person. Converted / resized / compressed copies are new files and never
carry C2PA Content Credentials.
## Command-line test mode
    "build/MyPixelGuard.app/Contents/MacOS/MetaDataRemover" --cli analyze photo.jpg
    "build/MyPixelGuard.app/Contents/MacOS/MetaDataRemover" --cli clean photo.jpg [outdir]

## Limits
Metadata removal can't remove invisible pixel watermarks (e.g. SynthID), and Meta may
still detect AI imagery by other means. Meta's rules also ask that realistic
AI-generated content be disclosed.

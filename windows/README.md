# MyPixelGuard for Windows

The Windows edition of MyPixelGuard — *Your Images. Your Privacy. Your Control.* Same nine tools as the Mac
app (Inspect, Clean, Redact, Convert, Resize, Compress, Remove Background, Batch Studio, AI Tools), the same
English / বাংলা text, the same brand. Everything runs on the PC; the app has no network code.

| Layer | What | Where |
|---|---|---|
| Core | Rust: metadata engine, analyzer, cleaner, selective cleaner, image tools, AI | `core/` |
| Shell | Tauri 2 commands, Windows OCR | `src-tauri/` |
| UI | React + TypeScript, Sora font, light/dark | `src/` |
| Text | generated from the Mac app's Swift string tables | `scripts/gen_i18n.py` → `src/i18n/` |

## How it differs from the Mac app
* **Metadata engine** is a byte-for-byte port: cleaned JPEG / PNG / WebP files are **identical** to what the Mac app writes.
* **Selective clean** edits EXIF / IPTC / XMP in place, so the pixels are never re-encoded (the Mac app re-encodes).
* **Remove Background** uses the ISNet model on ONNX Runtime instead of Apple Vision. As on the Mac, only an alpha
  channel is added — the subject's colours and resolution are untouched. The mask is refined with a guided filter.
  ISNet keeps the main subject; on crops where the subject fills the frame it can drop out-of-focus parts that Apple's model keeps.
* **Text finding (Redact)** uses Windows' built-in OCR; **faces** use the small YuNet model.
* **HEIC / AVIF** can be read where Windows has the codec, but can't be written. Output formats: JPEG, PNG, TIFF, WebP.

## Build
Needs Rust, Node 22, pnpm, and the Visual Studio C++ build tools (on Windows).

    python scripts/fetch_models.py      # AI models (~179 MB), build-time only
    pnpm install
    pnpm tauri build                    # installers in target/release/bundle/

`pnpm tauri dev` runs the app with hot reload. On any OS, `pnpm dev` and opening `/?mock` shows the UI with real captured data and no backend.

## Tests
    cargo test --release -p mpg-core
    MPG_MODEL=models/isnet-general-use.onnx MPG_TEST_IMAGE=photo.jpg cargo test --release -p mpg-core -- --ignored

The CI workflow `.github/workflows/build-windows.yml` builds the installers on a Windows runner.

## Status
Tested on macOS (the Rust core, the engine byte-parity against the Swift app, the UI, and the app launching natively).
**Not yet run on a real Windows PC:** the installer, Windows OCR (type-checked against the Windows bindings only), and ONNX Runtime packaging.

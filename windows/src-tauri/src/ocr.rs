//! Text recognition for the Redact tool. On Windows this uses the OCR engine built into the OS
//! (Windows.Media.Ocr) — offline, no model download. Other platforms (only used for development) have none.

#[cfg(windows)]
mod imp {
    use mpg_core::image::{DynamicImage, GenericImageView};
    use mpg_core::error::{CoreError, CoreResult};
    use mpg_core::redact::NRect;
    use mpg_core::visual::{TextLine, TextRecognizer};
    use windows::Graphics::Imaging::{BitmapAlphaMode, BitmapPixelFormat, SoftwareBitmap};
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::DataWriter;

    pub struct WindowsOcr {
        engine: OcrEngine,
    }

    pub fn create() -> Option<WindowsOcr> {
        OcrEngine::TryCreateFromUserProfileLanguages().ok().map(|engine| WindowsOcr { engine })
    }

    fn fail(e: windows::core::Error) -> CoreError {
        CoreError::with("err.ocr", [e.message()])
    }

    impl TextRecognizer for WindowsOcr {
        fn recognize(&self, img: &DynamicImage) -> CoreResult<Vec<TextLine>> {
            // The OS engine rejects very large bitmaps.
            let max = OcrEngine::MaxImageDimension().unwrap_or(10000);
            let img = if img.width().max(img.height()) > max {
                let f = max as f64 / img.width().max(img.height()) as f64;
                mpg_core::resize_pixels(img, (img.width() as f64 * f) as u32, (img.height() as f64 * f) as u32)
            } else {
                img.clone()
            };
            let (w, h) = img.dimensions();
            // Windows wants BGRA.
            let mut bgra = img.to_rgba8().into_raw();
            for px in bgra.chunks_exact_mut(4) {
                px.swap(0, 2);
            }
            let writer = DataWriter::new().map_err(fail)?;
            writer.WriteBytes(&bgra).map_err(fail)?;
            let buffer = writer.DetachBuffer().map_err(fail)?;
            let bitmap = SoftwareBitmap::CreateCopyWithAlphaFromBuffer(&buffer, BitmapPixelFormat::Bgra8, w as i32, h as i32, BitmapAlphaMode::Ignore).map_err(fail)?;
            let result = self.engine.RecognizeAsync(&bitmap).map_err(fail)?.join().map_err(fail)?;
            let mut lines = Vec::new();
            for line in result.Lines().map_err(fail)? {
                let (mut x0, mut y0, mut x1, mut y1) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
                for word in line.Words().map_err(fail)? {
                    let r = word.BoundingRect().map_err(fail)?;
                    x0 = x0.min(r.X as f64);
                    y0 = y0.min(r.Y as f64);
                    x1 = x1.max((r.X + r.Width) as f64);
                    y1 = y1.max((r.Y + r.Height) as f64);
                }
                if x1 <= x0 || y1 <= y0 {
                    continue;
                }
                lines.push(TextLine {
                    text: line.Text().map_err(fail)?.to_string(),
                    rect: NRect { x: x0 / w as f64, y: y0 / h as f64, w: (x1 - x0) / w as f64, h: (y1 - y0) / h as f64 },
                    confidence: 0.9,
                });
            }
            Ok(lines)
        }
    }
}

#[cfg(windows)]
pub fn engine() -> Option<imp::WindowsOcr> {
    imp::create()
}
#[cfg(windows)]
pub fn available() -> bool {
    imp::create().is_some()
}

/// Development builds on other platforms have no OCR; the UI tells the user instead of failing.
#[cfg(not(windows))]
use mpg_core::visual::TextRecognizer;
#[cfg(not(windows))]
pub struct NoOcr;
#[cfg(not(windows))]
impl TextRecognizer for NoOcr {
    fn recognize(&self, _: &mpg_core::image::DynamicImage) -> mpg_core::CoreResult<Vec<mpg_core::visual::TextLine>> {
        Ok(Vec::new())
    }
}
#[cfg(not(windows))]
pub fn engine() -> Option<NoOcr> {
    None
}
#[cfg(not(windows))]
pub fn available() -> bool {
    false
}

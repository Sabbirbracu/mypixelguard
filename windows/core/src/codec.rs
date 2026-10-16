//! Reading and writing pixels. Port of `ImageCodec.swift`.
//!
//! Pixels are decoded to 8-bit RGB / RGBA with the EXIF orientation already applied, and the
//! embedded ICC profile travels with them so re-encoded files keep their colours.

use std::io::Cursor;
use std::path::Path;

use image::{DynamicImage, ImageDecoder, ImageEncoder, RgbImage, RgbaImage};
use serde::{Deserialize, Serialize};

use crate::container;
use crate::engine::{self, ImageKind};
use crate::error::{CoreError, CoreResult, Note};

/// Image formats the tools can write on Windows (HEIC can be read where Windows has the codec, not written).
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OutputFormat {
    Jpeg,
    Png,
    Tiff,
    Webp,
}

impl OutputFormat {
    pub const ALL: [OutputFormat; 4] = [OutputFormat::Jpeg, OutputFormat::Png, OutputFormat::Tiff, OutputFormat::Webp];

    pub fn extension(self) -> &'static str {
        match self {
            OutputFormat::Jpeg => "jpg",
            OutputFormat::Png => "png",
            OutputFormat::Tiff => "tiff",
            OutputFormat::Webp => "webp",
        }
    }
    pub fn display_name(self) -> &'static str {
        match self {
            OutputFormat::Jpeg => "JPEG",
            OutputFormat::Png => "PNG",
            OutputFormat::Tiff => "TIFF",
            OutputFormat::Webp => "WebP",
        }
    }
    pub fn supports_alpha(self) -> bool {
        self != OutputFormat::Jpeg
    }
    pub fn is_lossy(self) -> bool {
        matches!(self, OutputFormat::Jpeg | OutputFormat::Webp)
    }
    pub fn available() -> Vec<OutputFormat> {
        Self::ALL.to_vec()
    }
    /// The format of an existing file, from its first bytes.
    pub fn sniff(b: &[u8]) -> Option<OutputFormat> {
        match engine::detect(b) {
            ImageKind::Jpeg => Some(OutputFormat::Jpeg),
            ImageKind::Png => Some(OutputFormat::Png),
            ImageKind::Webp => Some(OutputFormat::Webp),
            _ if b.starts_with(&[0x49, 0x49, 0x2A, 0x00]) || b.starts_with(&[0x4D, 0x4D, 0x00, 0x2A]) => Some(OutputFormat::Tiff),
            _ => None,
        }
    }
}

/// What the tools need to know about a file before touching it.
#[derive(Clone, Debug, Serialize)]
pub struct SourceInfo {
    /// After EXIF orientation is applied.
    pub width: u32,
    pub height: u32,
    pub has_alpha: bool,
    pub file_size: usize,
    /// `None` for formats we can read but not write (GIF, BMP, HEIC …).
    pub format: Option<OutputFormat>,
    pub is_animated: bool,
    #[serde(skip)]
    pub exif: Option<Vec<u8>>,
    #[serde(skip)]
    pub icc: Option<Vec<u8>>,
}

impl SourceInfo {
    /// The format to write when the user asks for "same as original".
    pub fn same_format(&self) -> OutputFormat {
        self.format.unwrap_or(if self.has_alpha { OutputFormat::Png } else { OutputFormat::Jpeg })
    }
}

/// Decoded pixels plus the colour profile they were saved with.
#[derive(Clone)]
pub struct Loaded {
    pub image: DynamicImage,
    pub icc: Option<Vec<u8>>,
}

impl Loaded {
    pub fn width(&self) -> u32 {
        self.image.width()
    }
    pub fn height(&self) -> u32 {
        self.image.height()
    }
    pub fn has_alpha(&self) -> bool {
        self.image.color().has_alpha()
    }
    pub fn with_image(&self, image: DynamicImage) -> Loaded {
        Loaded { image, icc: self.icc.clone() }
    }
}

pub fn read_file(path: &Path) -> CoreResult<Vec<u8>> {
    std::fs::read(path).map_err(|_| CoreError::unreadable())
}

pub fn info(path: &Path) -> CoreResult<SourceInfo> {
    let bytes = read_file(path)?;
    info_from_bytes(&bytes)
}

pub fn info_from_bytes(b: &[u8]) -> CoreResult<SourceInfo> {
    let kind = engine::detect(b);
    let pieces = engine::parse(b, kind).unwrap_or_default();
    let exif = container::extract_exif(b, &pieces);
    let icc = crate::icc::extract(b, kind, &pieces);
    let reader = image::ImageReader::new(Cursor::new(b)).with_guessed_format().map_err(|_| CoreError::unreadable())?;
    match reader.into_decoder() {
        Ok(mut decoder) => {
            let (mut w, mut h) = decoder.dimensions();
            let orientation = decoder.orientation().unwrap_or(image::metadata::Orientation::NoTransforms);
            if matches!(
                orientation,
                image::metadata::Orientation::Rotate90
                    | image::metadata::Orientation::Rotate270
                    | image::metadata::Orientation::Rotate90FlipH
                    | image::metadata::Orientation::Rotate270FlipH
            ) {
                std::mem::swap(&mut w, &mut h);
            }
            let is_animated = match kind {
                ImageKind::Gif => true,
                ImageKind::Webp => engine::find(b, "ANIM").is_some() && engine::has(b, 12, "VP8X") && b.get(20).is_some_and(|f| f & 0x02 != 0),
                _ => false,
            };
            Ok(SourceInfo {
                width: w,
                height: h,
                has_alpha: decoder.color_type().has_alpha(),
                file_size: b.len(),
                format: OutputFormat::sniff(b),
                is_animated,
                exif,
                icc: icc.or_else(|| decoder.icc_profile().ok().flatten()),
            })
        }
        Err(_) => {
            #[cfg(windows)]
            if let Some(info) = crate::wic::info(b) {
                return Ok(info);
            }
            Err(CoreError::unreadable())
        }
    }
}

/// Full-size decode with the EXIF orientation already applied to the pixels.
/// `max_pixel` caps the longest side (for previews); it never enlarges.
pub fn load_image(path: &Path, max_pixel: Option<u32>) -> CoreResult<Loaded> {
    let bytes = read_file(path)?;
    load_from_bytes(&bytes, max_pixel)
}

pub fn load_from_bytes(b: &[u8], max_pixel: Option<u32>) -> CoreResult<Loaded> {
    let decoded = (|| -> Option<Loaded> {
        let reader = image::ImageReader::new(Cursor::new(b)).with_guessed_format().ok()?;
        let mut decoder = reader.into_decoder().ok()?;
        let icc = decoder.icc_profile().ok().flatten();
        let orientation = decoder.orientation().unwrap_or(image::metadata::Orientation::NoTransforms);
        let mut img = DynamicImage::from_decoder(decoder).ok()?;
        img.apply_orientation(orientation);
        Some(Loaded { image: normalize(img), icc })
    })();
    #[cfg(windows)]
    let decoded = decoded.or_else(|| crate::wic::decode(b));
    let mut loaded = decoded.ok_or_else(CoreError::unreadable)?;
    if let Some(max) = max_pixel {
        let longest = loaded.width().max(loaded.height());
        if longest > max {
            let scale = max as f64 / longest as f64;
            let w = ((loaded.width() as f64 * scale).round() as u32).max(1);
            let h = ((loaded.height() as f64 * scale).round() as u32).max(1);
            loaded.image = crate::resize_pixels(&loaded.image, w, h);
        }
    }
    Ok(loaded)
}

/// 8-bit RGB (no alpha) or RGBA.
fn normalize(img: DynamicImage) -> DynamicImage {
    if img.color().has_alpha() {
        DynamicImage::ImageRgba8(img.to_rgba8())
    } else {
        DynamicImage::ImageRgb8(img.to_rgb8())
    }
}

/// Composites `img` over a solid `background`, returning an opaque RGB image.
pub fn flatten(img: &DynamicImage, background: [u8; 3]) -> RgbImage {
    let rgba = img.to_rgba8();
    let mut out = RgbImage::new(rgba.width(), rgba.height());
    for (x, y, p) in rgba.enumerate_pixels() {
        let a = p[3] as u32;
        let mix = |c: u8, b: u8| ((c as u32 * a + b as u32 * (255 - a) + 127) / 255) as u8;
        out.put_pixel(x, y, image::Rgb([mix(p[0], background[0]), mix(p[1], background[1]), mix(p[2], background[2])]));
    }
    out
}

/// Properties of an encode request.
pub struct EncodeOptions<'a> {
    pub format: OutputFormat,
    /// 0…1, only for lossy formats.
    pub quality: Option<f64>,
    /// Used when the format has no transparency.
    pub background: [u8; 3],
    /// A raw EXIF TIFF block to carry over ("keep metadata"). `None` writes no metadata at all.
    pub keep_exif: Option<&'a [u8]>,
}

impl<'a> EncodeOptions<'a> {
    pub fn new(format: OutputFormat) -> Self {
        EncodeOptions { format, quality: None, background: [255, 255, 255], keep_exif: None }
    }
}

/// Encodes `loaded`. Formats without transparency (JPEG) get the image flattened onto the background.
/// Without `keep_exif` the output carries no camera, location or text metadata.
pub fn encode(loaded: &Loaded, o: &EncodeOptions) -> CoreResult<Vec<u8>> {
    let format = o.format;
    let flat;
    let pixels: DynamicImage = if !format.supports_alpha() && loaded.has_alpha() {
        flat = DynamicImage::ImageRgb8(flatten(&loaded.image, o.background));
        flat.clone()
    } else {
        loaded.image.clone()
    };
    let (w, h) = (pixels.width(), pixels.height());
    let q = (o.quality.unwrap_or(0.92).clamp(0.0, 1.0) * 100.0).round() as u8;
    let icc = loaded.icc.as_deref();
    let exif = o.keep_exif.map(|e| patched_exif(e, w, h));
    let mut buf: Vec<u8> = Vec::new();

    match format {
        OutputFormat::Jpeg => {
            let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, q.max(1));
            if let Some(p) = icc {
                let _ = enc.set_icc_profile(p.to_vec());
            }
            enc.write_image(pixels.to_rgb8().as_raw(), w, h, image::ExtendedColorType::Rgb8).map_err(|_| CoreError::encode_failed())?;
            if let Some(seg) = exif.as_deref().and_then(container::exif_segment) {
                buf = container::jpeg_insert(&buf, &[seg]);
            }
        }
        OutputFormat::Png => {
            let mut enc = image::codecs::png::PngEncoder::new_with_quality(
                &mut buf,
                image::codecs::png::CompressionType::Default,
                image::codecs::png::FilterType::Adaptive,
            );
            if let Some(p) = icc {
                let _ = enc.set_icc_profile(p.to_vec());
            }
            if pixels.color().has_alpha() {
                enc.write_image(pixels.to_rgba8().as_raw(), w, h, image::ExtendedColorType::Rgba8)
            } else {
                enc.write_image(pixels.to_rgb8().as_raw(), w, h, image::ExtendedColorType::Rgb8)
            }
            .map_err(|_| CoreError::encode_failed())?;
            if let Some(tiff) = exif.as_deref() {
                buf = container::png_insert_before_idat(&buf, &container::png_chunk(b"eXIf", tiff));
            }
        }
        OutputFormat::Tiff => {
            let mut cursor = Cursor::new(Vec::new());
            let enc = image::codecs::tiff::TiffEncoder::new(&mut cursor);
            if pixels.color().has_alpha() {
                enc.write_image(pixels.to_rgba8().as_raw(), w, h, image::ExtendedColorType::Rgba8)
            } else {
                enc.write_image(pixels.to_rgb8().as_raw(), w, h, image::ExtendedColorType::Rgb8)
            }
            .map_err(|_| CoreError::encode_failed())?;
            buf = cursor.into_inner();
        }
        OutputFormat::Webp => {
            let has_alpha = pixels.color().has_alpha();
            let encoded = if has_alpha {
                let rgba = pixels.to_rgba8();
                webp::Encoder::from_rgba(rgba.as_raw(), w, h).encode(q as f32)
            } else {
                let rgb = pixels.to_rgb8();
                webp::Encoder::from_rgb(rgb.as_raw(), w, h).encode(q as f32)
            };
            buf = container::webp_add_metadata(&encoded, w, h, has_alpha, icc, exif.as_deref());
        }
    }
    Ok(buf)
}

/// A copy of an EXIF block that matches freshly oriented pixels: orientation reset to 1 and the pixel
/// dimension tags updated.
pub fn patched_exif(tiff: &[u8], width: u32, height: u32) -> Vec<u8> {
    let mut t = tiff.to_vec();
    crate::tiff::patch_for_pixels(&mut t, width, height);
    t
}

/// Reads a finished file back and confirms it decodes at the expected size.
pub fn verify(path: &Path, width: u32, height: u32) -> bool {
    let Ok(b) = std::fs::read(path) else { return false };
    load_from_bytes(&b, None).map(|l| l.width() == width && l.height() == height).unwrap_or(false)
}

/// Small decoded preview of encoded bytes, for before/after views.
pub fn thumbnail_of(data: &[u8], max_pixel: u32) -> Option<DynamicImage> {
    load_from_bytes(data, Some(max_pixel)).ok().map(|l| l.image)
}

/// Encodes a preview image as PNG bytes (keeps transparency) for display in the UI.
pub fn preview_png(img: &DynamicImage) -> Vec<u8> {
    let mut buf = Vec::new();
    let enc = image::codecs::png::PngEncoder::new_with_quality(
        &mut buf,
        image::codecs::png::CompressionType::Fast,
        image::codecs::png::FilterType::Sub,
    );
    if img.color().has_alpha() {
        let _ = enc.write_image(img.to_rgba8().as_raw(), img.width(), img.height(), image::ExtendedColorType::Rgba8);
    } else {
        let _ = enc.write_image(img.to_rgb8().as_raw(), img.width(), img.height(), image::ExtendedColorType::Rgb8);
    }
    buf
}

/// Encodes a preview image as JPEG bytes (smaller, for opaque photos).
pub fn preview_jpeg(img: &DynamicImage, quality: u8) -> Vec<u8> {
    let mut buf = Vec::new();
    let enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality);
    let _ = enc.write_image(img.to_rgb8().as_raw(), img.width(), img.height(), image::ExtendedColorType::Rgb8);
    buf
}

/// What every tool produces before it is written to disk.
pub struct ProcessedImage {
    pub data: Vec<u8>,
    pub format: OutputFormat,
    pub width: u32,
    pub height: u32,
    pub notes: Vec<Note>,
    /// When set, export verification checks whether private/creator metadata remains.
    pub expect_metadata_clean: Option<bool>,
}

/// Convenience used by tools that start from a rgba/rgb buffer.
pub fn rgba_image(w: u32, h: u32, raw: Vec<u8>) -> Option<DynamicImage> {
    RgbaImage::from_raw(w, h, raw).map(DynamicImage::ImageRgba8)
}

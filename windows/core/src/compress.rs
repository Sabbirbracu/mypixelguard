//! Port of `ImageCompressionService.swift`: quality slider, best-effort target size, trade-off curve.

use serde::{Deserialize, Serialize};

use crate::codec::{self, EncodeOptions, Loaded, OutputFormat, ProcessedImage};
use crate::error::{CoreResult, Note};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CompressSettings {
    /// `None` keeps each image's own format.
    pub format: Option<OutputFormat>,
    pub quality: f64,
    pub use_target_size: bool,
    #[serde(rename = "targetKB")]
    pub target_kb: u32,
    pub background: [u8; 3],
    pub keep_metadata: bool,
    pub suffix: String,
}

impl Default for CompressSettings {
    fn default() -> Self {
        CompressSettings {
            format: None,
            quality: 0.75,
            use_target_size: false,
            target_kb: 200,
            background: [255, 255, 255],
            keep_metadata: false,
            suffix: "_compressed".into(),
        }
    }
}

pub struct Outcome {
    pub data: Vec<u8>,
    pub quality: Option<f64>,
    /// False when a target size was requested but could not be reached.
    pub reached_target: bool,
}

fn enc(image: &Loaded, format: OutputFormat, quality: Option<f64>, background: [u8; 3], keep: Option<&[u8]>) -> CoreResult<Vec<u8>> {
    let mut o = EncodeOptions::new(format);
    o.quality = quality;
    o.background = background;
    o.keep_exif = keep;
    codec::encode(image, &o)
}

/// Encodes at `quality`, or, with `target_bytes`, searches for the highest quality that still fits.
/// The target is best-effort: it depends on image content and on the format.
pub fn encode(image: &Loaded, format: OutputFormat, quality: f64, target_bytes: Option<usize>, background: [u8; 3], keep: Option<&[u8]>) -> CoreResult<Outcome> {
    if !format.is_lossy() {
        let data = enc(image, format, None, background, keep)?;
        let reached = target_bytes.map(|t| data.len() <= t).unwrap_or(true);
        return Ok(Outcome { data, quality: None, reached_target: reached });
    }
    let Some(target) = target_bytes else {
        let data = enc(image, format, Some(quality), background, keep)?;
        return Ok(Outcome { data, quality: Some(quality), reached_target: true });
    };
    let (mut lo, mut hi) = (0.02f64, 1.0f64);
    let mut best: Option<(Vec<u8>, f64)> = None;
    // Highest quality first: if it already fits there's nothing to search.
    let top = enc(image, format, Some(hi), background, keep)?;
    if top.len() <= target {
        return Ok(Outcome { data: top, quality: Some(hi), reached_target: true });
    }
    for _ in 0..9 {
        let mid = (lo + hi) / 2.0;
        let data = enc(image, format, Some(mid), background, keep)?;
        if data.len() <= target {
            best = Some((data, mid));
            lo = mid;
        } else {
            hi = mid;
        }
    }
    if let Some((data, q)) = best {
        return Ok(Outcome { data, quality: Some(q), reached_target: true });
    }
    let floor = enc(image, format, Some(0.02), background, keep)?;
    Ok(Outcome { data: floor, quality: Some(0.02), reached_target: false })
}

pub fn process(path: &std::path::Path, s: &CompressSettings) -> CoreResult<ProcessedImage> {
    let info = codec::info(path)?;
    let image = codec::load_image(path, None)?;
    process_loaded(&info, &image, s)
}

pub fn process_loaded(info: &codec::SourceInfo, image: &Loaded, s: &CompressSettings) -> CoreResult<ProcessedImage> {
    let format = s.format.unwrap_or_else(|| info.same_format());
    let mut notes = Vec::new();
    if info.is_animated {
        notes.push(Note::new("note.animated"));
    }
    if info.has_alpha && !format.supports_alpha() {
        notes.push(Note::new("note.flattened"));
    }
    let keep = if s.keep_metadata { info.exif.clone() } else { None };
    let target = s.use_target_size.then(|| s.target_kb as usize * 1000);
    let outcome = encode(image, format, s.quality, target, s.background, keep.as_deref())?;
    if s.use_target_size && !outcome.reached_target {
        if format.is_lossy() {
            notes.push(Note::with("note.targetMissed", [crate::analyzer::byte_string(outcome.data.len())]));
        } else {
            notes.push(Note::new("note.targetLossless"));
        }
    }
    if outcome.data.len() >= info.file_size {
        notes.push(Note::new("note.notSmaller"));
    }
    Ok(ProcessedImage {
        data: outcome.data,
        format,
        width: image.width(),
        height: image.height(),
        notes,
        expect_metadata_clean: Some(!s.keep_metadata),
    })
}

pub const CURVE_QUALITIES: [u32; 5] = [30, 50, 70, 85, 95];

#[derive(Serialize)]
pub struct Preview {
    pub output_bytes: usize,
    pub original_bytes: usize,
    pub width: u32,
    pub height: u32,
    pub format: OutputFormat,
    pub notes: Vec<Note>,
    /// Output size at a few fixed qualities, to show the quality / file-size trade-off.
    pub curve: Vec<(u32, usize)>,
    /// Data URL of the compressed result.
    pub image: String,
}

pub fn preview(path: &std::path::Path, s: &CompressSettings) -> CoreResult<Preview> {
    let info = codec::info(path)?;
    let image = codec::load_image(path, None)?;
    let processed = process_loaded(&info, &image, s)?;
    let mut curve = Vec::new();
    if processed.format.is_lossy() {
        let keep = if s.keep_metadata { info.exif.clone() } else { None };
        for q in CURVE_QUALITIES {
            let data = enc(&image, processed.format, Some(q as f64 / 100.0), s.background, keep.as_deref())?;
            curve.push((q, data.len()));
        }
    }
    let thumb = codec::thumbnail_of(&processed.data, 560);
    Ok(Preview {
        output_bytes: processed.data.len(),
        original_bytes: info.file_size,
        width: processed.width,
        height: processed.height,
        format: processed.format,
        notes: processed.notes,
        curve,
        image: thumb.map(|t| crate::export_data_url(&t)).unwrap_or_default(),
    })
}

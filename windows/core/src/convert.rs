//! Port of `ImageConversionService.swift`.

use serde::{Deserialize, Serialize};

use crate::codec::{self, EncodeOptions, OutputFormat, ProcessedImage};
use crate::error::{CoreResult, Note};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ConvertSettings {
    pub format: OutputFormat,
    pub quality: f64,
    /// Used when transparent pixels have to be flattened (JPEG has no transparency).
    pub background: [u8; 3],
    pub keep_metadata: bool,
    pub suffix: String,
}

impl Default for ConvertSettings {
    fn default() -> Self {
        ConvertSettings { format: OutputFormat::Jpeg, quality: 0.9, background: [255, 255, 255], keep_metadata: false, suffix: String::new() }
    }
}

pub fn process(path: &std::path::Path, s: &ConvertSettings) -> CoreResult<ProcessedImage> {
    let info = codec::info(path)?;
    let image = codec::load_image(path, None)?;
    let mut notes = Vec::new();
    if info.is_animated {
        notes.push(Note::new("note.animated"));
    }
    if info.has_alpha && !s.format.supports_alpha() {
        notes.push(Note::new("note.flattened"));
    }
    let mut o = EncodeOptions::new(s.format);
    o.quality = s.format.is_lossy().then_some(s.quality);
    o.background = s.background;
    let keep = if s.keep_metadata { info.exif.clone() } else { None };
    o.keep_exif = keep.as_deref();
    let data = codec::encode(&image, &o)?;
    Ok(ProcessedImage { data, format: s.format, width: image.width(), height: image.height(), notes, expect_metadata_clean: Some(!s.keep_metadata) })
}

/// Output size of the first image for the live estimate.
pub fn estimate(path: &std::path::Path, s: &ConvertSettings) -> Option<usize> {
    process(path, s).ok().map(|p| p.data.len())
}

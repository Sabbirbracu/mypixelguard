//! Writes processed images to disk without ever touching the originals. Port of `ImageExportService.swift`.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::codec::{self, OutputFormat, ProcessedImage};
use crate::engine::{self, MetaCategory};
use crate::error::{CoreError, CoreResult, Note};

#[derive(Debug, Clone, Serialize, Default)]
pub struct BatchResult {
    pub input_name: String,
    pub output: Option<String>,
    pub error: Option<CoreError>,
    pub before_bytes: usize,
    pub after_bytes: usize,
    pub width: u32,
    pub height: u32,
    pub verified: bool,
    pub format_name: String,
    pub metadata_clean: Option<bool>,
    pub notes: Vec<Note>,
}

impl BatchResult {
    pub fn succeeded(&self) -> bool {
        self.output.is_some() && self.error.is_none()
    }
}

/// `holiday.jpg` stays `holiday.jpg`; if it already exists the next free name is `holiday 2.jpg`.
pub fn unique_path(path: &Path) -> PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }
    let dir = path.parent().unwrap_or(Path::new("."));
    let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = path.extension().map(|e| e.to_string_lossy().into_owned());
    let mut n = 2;
    loop {
        let name = match &ext {
            Some(e) => format!("{stem} {n}.{e}"),
            None => format!("{stem} {n}"),
        };
        let candidate = dir.join(name);
        if !candidate.exists() {
            return candidate;
        }
        n += 1;
    }
}

/// `photo.png` + suffix `_resized` + format JPEG → `photo_resized.jpg`; an existing file is never replaced.
pub fn output_path(input: &Path, suffix: &str, format: OutputFormat, folder: &Path) -> PathBuf {
    let stem = input.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "image".into());
    unique_path(&folder.join(format!("{stem}{suffix}.{}", format.extension())))
}

pub fn sanitized_suffix(s: &str) -> String {
    s.chars().filter(|c| !matches!(c, '/' | '\\' | ':' | '\0' | '*' | '?' | '"' | '<' | '>' | '|')).collect()
}

/// True when the file still carries private metadata (anything beyond structural EXIF tags).
pub fn has_private_metadata(bytes: &[u8]) -> bool {
    let kind = engine::detect(bytes);
    if let Ok(pieces) = engine::parse(bytes, kind) {
        if pieces.iter().any(|p| matches!(p.category, Some(MetaCategory::C2pa | MetaCategory::Iptc | MetaCategory::Xmp))) {
            return true;
        }
        if pieces.iter().any(|p| p.category == Some(MetaCategory::Other) && p.label.contains("text")) {
            return true;
        }
    }
    let structural = ["Orientation", "ColorSpace", "PixelXDimension", "PixelYDimension", "ExifVersion", "ComponentsConfiguration",
        "YCbCrPositioning", "ResolutionUnit", "XResolution", "YResolution", "FlashpixVersion", "ImageWidth", "ImageLength"];
    match exif::Reader::new().read_from_container(&mut std::io::Cursor::new(bytes)) {
        Ok(ex) => ex.fields().any(|f| !structural.contains(&f.tag.to_string().as_str())),
        Err(_) => false,
    }
}

/// Runs `operation` for one input and saves the result into `folder`, then reads it back to verify.
pub fn export(input: &Path, folder: &Path, suffix: &str, operation: impl FnOnce(&Path) -> CoreResult<ProcessedImage>) -> BatchResult {
    let mut result = BatchResult { input_name: input.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(), ..Default::default() };
    result.before_bytes = std::fs::metadata(input).map(|m| m.len() as usize).unwrap_or(0);
    let outcome = (|| -> CoreResult<()> {
        let processed = operation(input)?;
        let out = output_path(input, &sanitized_suffix(suffix), processed.format, folder);
        std::fs::write(&out, &processed.data).map_err(|e| CoreError::write_failed(e))?;
        result.output = Some(out.to_string_lossy().into_owned());
        result.after_bytes = processed.data.len();
        result.width = processed.width;
        result.height = processed.height;
        result.notes = processed.notes.clone();
        result.verified = codec::verify(&out, processed.width, processed.height);
        if !result.verified {
            let _ = std::fs::remove_file(&out);
            result.output = None;
            return Err(CoreError::verify_failed());
        }
        result.format_name = processed.format.display_name().to_string();
        if let Some(expect_clean) = processed.expect_metadata_clean {
            let present = has_private_metadata(&processed.data);
            result.metadata_clean = Some(!present);
            if expect_clean && present {
                result.notes.push(Note::new("verify.metadata.remaining"));
            }
        }
        Ok(())
    })();
    if let Err(e) = outcome {
        result.error = Some(e);
    }
    result
}

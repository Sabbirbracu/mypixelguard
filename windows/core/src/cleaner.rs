//! Writes a cleaned copy of an image. Port of `ImageCleaner` in `Analyzer.swift`.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::analyzer::{self, Indicator};
use crate::codec::{self, EncodeOptions, OutputFormat};
use crate::engine::{self, ImageKind, MetaCategory, Piece, Severity};
use crate::error::{CoreError, CoreResult};
use crate::export::unique_path;

pub const NAME_SUFFIX: &str = "_AI-label-cleaned";

#[derive(Debug, Clone, Serialize)]
pub struct RemovedItem {
    pub category: MetaCategory,
    pub bytes: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct CleanReport {
    pub output: String,
    pub before_bytes: usize,
    pub after_bytes: usize,
    pub removed: Vec<RemovedItem>,
    pub reencoded: bool,
    pub kept_orientation: Option<u8>,
    /// Result of re-scanning the finished file.
    pub decodes: bool,
    pub remaining_indicators: Vec<Indicator>,
    pub remaining_blocks: Vec<Piece>,
}

/// e.g. "holiday.jpg" → "holiday_AI-label-cleaned.jpg"
pub fn suggested_filename(path: &Path, kind: ImageKind, has_alpha: bool) -> String {
    let base = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "image".into());
    let ext = match kind {
        ImageKind::Other => if has_alpha { "png".to_string() } else { "jpg".to_string() },
        _ => path.extension().map(|e| e.to_string_lossy().into_owned()).filter(|e| !e.is_empty()).unwrap_or_else(|| "jpg".into()),
    };
    format!("{base}{NAME_SUFFIX}.{ext}")
}

fn summarize(pieces: &[Piece], remove: &HashSet<MetaCategory>) -> Vec<RemovedItem> {
    MetaCategory::ALL
        .iter()
        .filter(|c| remove.contains(c))
        .filter_map(|&c| {
            let total: usize = pieces.iter().filter(|p| p.category == Some(c)).map(Piece::size).sum();
            (total > 0).then_some(RemovedItem { category: c, bytes: total })
        })
        .collect()
}

/// Decodes with the orientation applied and re-encodes without any metadata (HEIC, TIFF, BMP …).
fn reencode(input: &Path, keep_icc: bool) -> CoreResult<(Vec<u8>, &'static str)> {
    let mut loaded = codec::load_image(input, None)?;
    if !keep_icc {
        loaded.icc = None;
    }
    let (format, ext) = if loaded.has_alpha() { (OutputFormat::Png, "png") } else { (OutputFormat::Jpeg, "jpg") };
    let mut o = EncodeOptions::new(format);
    o.quality = format.is_lossy().then_some(0.95);
    Ok((codec::encode(&loaded, &o)?, ext))
}

/// Writes a cleaned copy to `output`. With `avoid_overwrite` an existing file is never replaced
/// (a number is added to the name); the original image is never replaced in either mode.
pub fn clean(input: &Path, output: &Path, avoid_overwrite: bool, remove: &HashSet<MetaCategory>) -> CoreResult<CleanReport> {
    let b = codec::read_file(input)?;
    let kind = engine::detect(&b);

    let mut new_ext: Option<&str> = None;
    let removed_list: Vec<RemovedItem>;
    let out_bytes: Vec<u8>;
    let kept: Option<u8>;
    let mut reencoded = false;

    match kind {
        ImageKind::Jpeg | ImageKind::Png | ImageKind::Webp => {
            let pieces = engine::parse(&b, kind)?;
            removed_list = summarize(&pieces, remove);
            (out_bytes, kept) = engine::strip(&b, kind, &pieces, remove);
        }
        ImageKind::Gif => return Err(CoreError::unsupported("err.gifUnsupported")),
        ImageKind::Other => {
            // HEIC, TIFF, BMP, AVIF …: decode and save a fresh JPEG/PNG that carries no metadata at all.
            let (encoded, ext) = reencode(input, !remove.contains(&MetaCategory::Icc))?;
            new_ext = Some(ext);
            reencoded = true;
            out_bytes = encoded;
            kept = None;
            removed_list = vec![RemovedItem { category: MetaCategory::Other, bytes: b.len().saturating_sub(out_bytes.len()) }];
        }
    }

    let mut target: PathBuf = output.to_path_buf();
    if let Some(e) = new_ext {
        if target.extension().map(|x| x.to_string_lossy().to_lowercase()) != Some(e.to_string()) {
            target.set_extension(e);
        }
    }
    let same_as_input = target.canonicalize().ok().zip(input.canonicalize().ok()).is_some_and(|(a, b)| a == b);
    if same_as_input || (avoid_overwrite && target.exists()) {
        target = unique_path(&target);
    }
    std::fs::write(&target, &out_bytes).map_err(CoreError::write_failed)?;

    // Verify by reading the new file back.
    let decodes = codec::load_from_bytes(&out_bytes, Some(64)).is_ok();
    let rescan = analyzer::analyze(&target).ok();
    Ok(CleanReport {
        output: target.to_string_lossy().into_owned(),
        before_bytes: b.len(),
        after_bytes: out_bytes.len(),
        removed: removed_list,
        reencoded,
        kept_orientation: kept,
        decodes,
        remaining_indicators: rescan.as_ref().map(|r| r.indicators.iter().filter(|i| i.severity != Severity::Info).cloned().collect()).unwrap_or_default(),
        remaining_blocks: rescan.map(|r| r.metadata_pieces()).unwrap_or_default(),
    })
}

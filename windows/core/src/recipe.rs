//! Port of `RecipeService.swift`: a saved workflow of resize → compress/convert → clean.

use serde::{Deserialize, Serialize};

use crate::codec::{self, OutputFormat, ProcessedImage};
use crate::compress;
use crate::error::{CoreResult, Note};
use crate::resize::{self, Fit, ResizeSettings};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ImageRecipe {
    pub id: String,
    pub name: String,
    pub format: Option<OutputFormat>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    #[serde(rename = "targetKB")]
    pub target_kb: Option<u32>,
    pub quality: f64,
    pub clean_metadata: bool,
    pub suffix: String,
    pub is_built_in: bool,
}

impl Default for ImageRecipe {
    fn default() -> Self {
        ImageRecipe { id: String::new(), name: String::new(), format: None, width: None, height: None, target_kb: None, quality: 0.82, clean_metadata: true, suffix: "_ready".into(), is_built_in: false }
    }
}

pub fn built_in() -> Vec<ImageRecipe> {
    let r = |n: u32, name: &str, format: Option<OutputFormat>, size: Option<(u32, u32)>, kb: Option<u32>, q: f64, suffix: &str| ImageRecipe {
        id: format!("10000000-0000-0000-0000-00000000000{n}"),
        name: name.into(),
        format,
        width: size.map(|s| s.0),
        height: size.map(|s| s.1),
        target_kb: kb,
        quality: q,
        clean_metadata: true,
        suffix: suffix.into(),
        is_built_in: true,
    };
    vec![
        r(1, "Website Optimized", Some(OutputFormat::Webp), Some((1920, 1920)), Some(500), 0.82, "_web"),
        r(2, "Private Share", None, None, None, 0.92, "_private"),
        r(3, "Marketplace Ready", Some(OutputFormat::Jpeg), Some((1600, 1600)), Some(500), 0.86, "_market"),
        r(4, "Social Media", Some(OutputFormat::Jpeg), Some((1080, 1350)), Some(500), 0.88, "_social"),
    ]
}

pub fn process(path: &std::path::Path, recipe: &ImageRecipe) -> CoreResult<ProcessedImage> {
    let info = codec::info(path)?;
    let source = codec::load_image(path, None)?;
    let mut image = source.clone();
    let mut notes: Vec<Note> = Vec::new();

    if let (Some(w), Some(h)) = (recipe.width, recipe.height) {
        let s = ResizeSettings { width: w.max(1), height: h.max(1), lock_aspect: false, fit: Fit::Fit, never_enlarge: true, ..Default::default() };
        let plan = resize::plan((source.width(), source.height()), &s);
        if !plan.unchanged {
            image = source.with_image(resize::render(&source.image, &plan, None));
            notes.push(Note::with("studio.note.resized", [image.width(), image.height()]));
        }
    }

    let format = recipe.format.unwrap_or_else(|| info.same_format());
    let target = recipe.target_kb.map(|kb| kb.max(1) as usize * 1000);
    let keep = if recipe.clean_metadata { None } else { info.exif.clone() };
    let outcome = compress::encode(&image, format, recipe.quality, target, [255, 255, 255], keep.as_deref())?;
    if recipe.clean_metadata {
        notes.push(Note::new("studio.note.metadata"));
    }
    if target.is_some() && !outcome.reached_target {
        notes.push(Note::with("note.targetMissed", [crate::analyzer::byte_string(outcome.data.len())]));
    }
    Ok(ProcessedImage { data: outcome.data, format, width: image.width(), height: image.height(), notes, expect_metadata_clean: Some(recipe.clean_metadata) })
}

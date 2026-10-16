//! Local image tools: auto-enhance, upscale, smart crop. Port of `AIImageToolsService.swift`
//! (background removal lives in `background.rs`). Everything runs on this PC.

use image::{DynamicImage, RgbImage, RgbaImage};
use serde::{Deserialize, Serialize};

use crate::codec::{self, EncodeOptions, Loaded, OutputFormat, ProcessedImage};
use crate::error::{CoreResult, Note};

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CropAspect {
    Square,
    Portrait,
    Landscape,
}

impl CropAspect {
    pub fn ratio(self) -> f64 {
        match self {
            CropAspect::Square => 1.0,
            CropAspect::Portrait => 4.0 / 5.0,
            CropAspect::Landscape => 16.0 / 9.0,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AiSettings {
    pub enhance: bool,
    pub upscale: bool,
    pub upscale_factor: u32,
    pub smart_crop: bool,
    pub crop_aspect: CropAspect,
    pub remove_background: bool,
    pub format: Option<OutputFormat>,
    pub quality: f64,
    pub clean_metadata: bool,
    pub suffix: String,
}

impl Default for AiSettings {
    fn default() -> Self {
        AiSettings {
            enhance: true,
            upscale: false,
            upscale_factor: 2,
            smart_crop: false,
            crop_aspect: CropAspect::Square,
            remove_background: false,
            format: None,
            quality: 0.92,
            clean_metadata: true,
            suffix: "_enhanced".into(),
        }
    }
}

// MARK: Auto enhance

fn luma(r: f32, g: f32, b: f32) -> f32 {
    0.2126 * r + 0.7152 * g + 0.0722 * b
}

/// Adjusts exposure, contrast and colour the way a photo app's "Auto" button does:
/// a gentle levels stretch from the luminance histogram, a mid-tone gamma toward a natural exposure,
/// and a vibrance boost that mostly lifts dull colours. Colours keep their hue because the same tone
/// curve is applied to every channel.
pub fn auto_enhance(img: &DynamicImage) -> DynamicImage {
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    // Histogram on a sample of pixels (every 3rd is plenty and keeps this fast on large photos).
    let mut hist = [0u32; 256];
    let mut total = 0u64;
    let mut sum = 0f64;
    for p in rgba.pixels().step_by(3) {
        if p[3] < 8 {
            continue;
        }
        let l = luma(p[0] as f32, p[1] as f32, p[2] as f32).round().clamp(0.0, 255.0) as usize;
        hist[l] += 1;
        total += 1;
        sum += l as f64;
    }
    if total == 0 {
        return img.clone();
    }
    let percentile = |q: f64| -> f32 {
        let target = (total as f64 * q) as u64;
        let mut acc = 0u64;
        for (i, &c) in hist.iter().enumerate() {
            acc += c as u64;
            if acc >= target {
                return i as f32 / 255.0;
            }
        }
        1.0
    };
    let lo = percentile(0.005).min(0.25);
    let hi = percentile(0.995).max(0.75);
    let scale = (1.0 / (hi - lo).max(0.2)).min(1.4);

    // Mean luminance after the stretch decides the gamma (brighten dark photos, tame bright ones).
    let mean = ((sum / total as f64) as f32 / 255.0 - lo).max(0.0) * scale;
    let gamma = if mean > 0.01 { (0.46f32.ln() / mean.clamp(0.08, 0.92).ln()).clamp(0.78, 1.3) } else { 1.0 };

    let mut lut = [0u8; 256];
    for (i, v) in lut.iter_mut().enumerate() {
        let x = ((i as f32 / 255.0 - lo) * scale).clamp(0.0, 1.0);
        *v = (x.powf(gamma) * 255.0).round().clamp(0.0, 255.0) as u8;
    }

    let mut out = RgbaImage::new(w, h);
    for (x, y, p) in rgba.enumerate_pixels() {
        let (r, g, b) = (lut[p[0] as usize] as f32, lut[p[1] as usize] as f32, lut[p[2] as usize] as f32);
        // Vibrance: push colours away from their own grey, more for muted pixels.
        let grey = luma(r, g, b);
        let max = r.max(g).max(b);
        let min = r.min(g).min(b);
        let sat = if max > 0.0 { (max - min) / max } else { 0.0 };
        let boost = 1.0 + 0.22 * (1.0 - sat);
        let f = |c: f32| (grey + (c - grey) * boost).round().clamp(0.0, 255.0) as u8;
        out.put_pixel(x, y, image::Rgba([f(r), f(g), f(b), p[3]]));
    }
    if img.color().has_alpha() { DynamicImage::ImageRgba8(out) } else { DynamicImage::ImageRgb8(DynamicImage::ImageRgba8(out).to_rgb8()) }
}

// MARK: Smart crop

/// Where the eye goes: pixels that differ most from the picture's overall look, weighted a little
/// toward the centre (like an attention map), reduced to a focus point.
pub fn salient_focus(img: &DynamicImage) -> (f64, f64) {
    let small: RgbImage = crate::resize_pixels(&DynamicImage::ImageRgb8(img.to_rgb8()), 64, ((64.0 * img.height() as f64 / img.width() as f64).round() as u32).max(1)).to_rgb8();
    let (w, h) = small.dimensions();
    let n = (w * h) as f64;
    let mean: [f64; 3] = {
        let mut m = [0.0; 3];
        for p in small.pixels() {
            for c in 0..3 {
                m[c] += p[c] as f64;
            }
        }
        [m[0] / n, m[1] / n, m[2] / n]
    };
    let mut weights = Vec::with_capacity((w * h) as usize);
    for (x, y, p) in small.enumerate_pixels() {
        let d = ((p[0] as f64 - mean[0]).powi(2) + (p[1] as f64 - mean[1]).powi(2) + (p[2] as f64 - mean[2]).powi(2)).sqrt();
        let (cx, cy) = ((x as f64 + 0.5) / w as f64 - 0.5, (y as f64 + 0.5) / h as f64 - 0.5);
        let centre = 1.0 - 0.6 * (cx * cx + cy * cy).sqrt();
        weights.push((x, y, d * centre));
    }
    let mut sorted: Vec<f64> = weights.iter().map(|t| t.2).collect();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let threshold = sorted[(sorted.len() as f64 * 0.7) as usize];
    let (mut sx, mut sy, mut sw) = (0.0, 0.0, 0.0);
    for (x, y, v) in weights {
        if v >= threshold && v > 0.0 {
            sx += (x as f64 + 0.5) * v;
            sy += (y as f64 + 0.5) * v;
            sw += v;
        }
    }
    if sw == 0.0 { (0.5, 0.5) } else { (sx / sw / w as f64, sy / sw / h as f64) }
}

/// Crop rectangle (x, y, w, h in pixels) of the given aspect ratio centred on the likely subject.
pub fn salient_crop(img: &DynamicImage, ratio: f64) -> (u32, u32, u32, u32) {
    let (bw, bh) = (img.width() as f64, img.height() as f64);
    let (fx, fy) = salient_focus(img);
    let (focus_x, focus_y) = (fx * bw, fy * bh);
    let (mut width, mut height) = (bw, bw / ratio);
    if height > bh {
        height = bh;
        width = height * ratio;
    }
    width = width.floor();
    height = height.floor();
    let x = (focus_x - width / 2.0).round().clamp(0.0, bw - width);
    let y = (focus_y - height / 2.0).round().clamp(0.0, bh - height);
    (x as u32, y as u32, width as u32, height as u32)
}

pub fn process(path: &std::path::Path, s: &AiSettings, segmenter: Option<&crate::background::Segmenter>) -> CoreResult<ProcessedImage> {
    let info = codec::info(path)?;
    let source = codec::load_image(path, None)?;
    let mut image: Loaded = source.clone();
    let mut notes: Vec<Note> = Vec::new();

    if s.smart_crop {
        let (x, y, w, h) = salient_crop(&image.image, s.crop_aspect.ratio());
        image = image.with_image(image.image.crop_imm(x, y, w, h));
        notes.push(Note::new("ai.note.crop"));
    }
    if s.enhance {
        image = image.with_image(auto_enhance(&image.image));
        notes.push(Note::new("ai.note.enhanced"));
    }
    if s.remove_background {
        match segmenter {
            Some(seg) => {
                let bg = crate::background::BackgroundSettings::default();
                image = image.with_image(crate::background::cutout(&image.image, seg, &bg)?);
                notes.push(Note::new("ai.note.background"));
            }
            None => notes.push(Note::new("ai.note.backgroundUnavailable")),
        }
    }
    if s.upscale {
        let factor = s.upscale_factor.clamp(2, 4);
        let resized = crate::resize_pixels(&image.image, image.width() * factor, image.height() * factor);
        image = image.with_image(resized);
        notes.push(Note::with("ai.note.upscaled", [factor]));
    }

    let mut format = s.format.unwrap_or_else(|| info.same_format());
    if s.remove_background && format == OutputFormat::Jpeg {
        format = OutputFormat::Png;
    }
    let mut o = EncodeOptions::new(format);
    o.quality = format.is_lossy().then_some(s.quality);
    let keep = if s.clean_metadata { None } else { info.exif.clone() };
    o.keep_exif = keep.as_deref();
    let data = codec::encode(&image, &o)?;
    if s.clean_metadata {
        notes.push(Note::new("studio.note.metadata"));
    }
    Ok(ProcessedImage { data, format, width: image.width(), height: image.height(), notes, expect_metadata_clean: Some(s.clean_metadata) })
}

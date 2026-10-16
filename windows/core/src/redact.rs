//! Port of `RedactionService.swift`: blur, pixelate or black out regions of an image.

use image::{DynamicImage, GenericImageView, Rgba, RgbaImage};
use serde::{Deserialize, Serialize};

use crate::codec::{self, EncodeOptions, OutputFormat, ProcessedImage};
use crate::error::{CoreResult, Note};

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RedactionStyle {
    Blur,
    Pixelate,
    Solid,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RegionKind {
    Face,
    Email,
    Phone,
    Address,
    Identifier,
    LicensePlate,
    Manual,
}

/// Normalised rectangle with the origin at the image's TOP-left corner (0…1).
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
pub struct NRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl NRect {
    pub fn iou(&self, o: &NRect) -> f64 {
        let x0 = self.x.max(o.x);
        let y0 = self.y.max(o.y);
        let x1 = (self.x + self.w).min(o.x + o.w);
        let y1 = (self.y + self.h).min(o.y + o.h);
        if x1 <= x0 || y1 <= y0 {
            return 0.0;
        }
        let inter = (x1 - x0) * (y1 - y0);
        let union = self.w * self.h + o.w * o.h - inter;
        if union > 0.0 { inter / union } else { 0.0 }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SensitiveRegion {
    pub id: String,
    pub kind: RegionKind,
    pub rect: NRect,
    pub label: String,
    pub confidence: f32,
    #[serde(default = "yes")]
    pub is_selected: bool,
}

fn yes() -> bool {
    true
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RedactionSettings {
    pub style: RedactionStyle,
    pub strength: f64,
    pub format: Option<OutputFormat>,
    pub quality: f64,
    pub clean_metadata: bool,
    pub suffix: String,
}

impl Default for RedactionSettings {
    fn default() -> Self {
        RedactionSettings { style: RedactionStyle::Blur, strength: 30.0, format: None, quality: 0.92, clean_metadata: true, suffix: "_redacted".into() }
    }
}

pub const STRENGTH_RANGE: (f64, f64) = (8.0, 60.0);

const SOLID: [u8; 3] = [9, 14, 23]; // the brand navy used on macOS (0.035, 0.055, 0.09)

fn pixel_rect(r: &NRect, kind: RegionKind, w: u32, h: u32) -> Option<(u32, u32, u32, u32)> {
    let (fw, fh) = (w as f64, h as f64);
    let (mut x0, mut y0, mut x1, mut y1) = (r.x * fw, r.y * fh, (r.x + r.w) * fw, (r.y + r.h) * fh);
    if kind == RegionKind::Face {
        let (dx, dy) = ((x1 - x0) * 0.08, (y1 - y0) * 0.08);
        x0 -= dx;
        x1 += dx;
        y0 -= dy;
        y1 += dy;
    }
    let (x0, y0) = (x0.max(0.0).floor(), y0.max(0.0).floor());
    let (x1, y1) = (x1.min(fw).ceil(), y1.min(fh).ceil());
    if x1 - x0 <= 1.0 || y1 - y0 <= 1.0 {
        return None;
    }
    Some((x0 as u32, y0 as u32, (x1 - x0) as u32, (y1 - y0) as u32))
}

/// Draws every selected region onto `source`. Strength is relative to each region's size, so a preview
/// of a downscaled image looks the same as the full-size export.
pub fn render(source: &DynamicImage, regions: &[SensitiveRegion], s: &RedactionSettings) -> DynamicImage {
    let mut img: RgbaImage = source.to_rgba8();
    let (w, h) = img.dimensions();
    for region in regions.iter().filter(|r| r.is_selected) {
        let Some((x, y, rw, rh)) = pixel_rect(&region.rect, region.kind, w, h) else { continue };
        let side = rw.min(rh) as f64;
        match s.style {
            RedactionStyle::Solid => {
                for yy in y..y + rh {
                    for xx in x..x + rw {
                        img.put_pixel(xx, yy, Rgba([SOLID[0], SOLID[1], SOLID[2], 255]));
                    }
                }
            }
            RedactionStyle::Blur => {
                let sigma = (side * s.strength / 200.0).max(2.0) as f32;
                // Blur a padded crop so the region's edges blend with their surroundings.
                let pad = (sigma * 3.0).ceil() as u32;
                let (cx, cy) = (x.saturating_sub(pad), y.saturating_sub(pad));
                let (cx1, cy1) = ((x + rw + pad).min(w), (y + rh + pad).min(h));
                let crop = image::imageops::crop_imm(&img, cx, cy, cx1 - cx, cy1 - cy).to_image();
                let blurred = image::imageops::blur(&crop, sigma);
                for yy in y..y + rh {
                    for xx in x..x + rw {
                        img.put_pixel(xx, yy, *blurred.get_pixel(xx - cx, yy - cy));
                    }
                }
            }
            RedactionStyle::Pixelate => {
                let block = (side * s.strength / 200.0).max(4.0).round() as i64;
                // Blocks are centred on the region, like CIPixellate with a centre vector.
                let (ox, oy) = (x as i64 + rw as i64 / 2 - block / 2, y as i64 + rh as i64 / 2 - block / 2);
                let snapshot = img.clone();
                let bx0 = (x as i64 - ox).div_euclid(block);
                let bx1 = ((x + rw) as i64 - 1 - ox).div_euclid(block);
                let by0 = (y as i64 - oy).div_euclid(block);
                let by1 = ((y + rh) as i64 - 1 - oy).div_euclid(block);
                for by in by0..=by1 {
                    for bx in bx0..=bx1 {
                        let (sx0, sy0) = ((ox + bx * block).max(0), (oy + by * block).max(0));
                        let (sx1, sy1) = ((ox + (bx + 1) * block).min(w as i64), (oy + (by + 1) * block).min(h as i64));
                        if sx1 <= sx0 || sy1 <= sy0 {
                            continue;
                        }
                        let mut acc = [0u64; 4];
                        for yy in sy0..sy1 {
                            for xx in sx0..sx1 {
                                let p = snapshot.get_pixel(xx as u32, yy as u32);
                                for c in 0..4 {
                                    acc[c] += p[c] as u64;
                                }
                            }
                        }
                        let n = ((sx1 - sx0) * (sy1 - sy0)) as u64;
                        let avg = Rgba([(acc[0] / n) as u8, (acc[1] / n) as u8, (acc[2] / n) as u8, (acc[3] / n) as u8]);
                        for yy in sy0.max(y as i64)..sy1.min((y + rh) as i64) {
                            for xx in sx0.max(x as i64)..sx1.min((x + rw) as i64) {
                                img.put_pixel(xx as u32, yy as u32, avg);
                            }
                        }
                    }
                }
            }
        }
    }
    if source.color().has_alpha() { DynamicImage::ImageRgba8(img) } else { DynamicImage::ImageRgb8(DynamicImage::ImageRgba8(img).to_rgb8()) }
}

/// Words for how strong a setting is, shared by the slider label and the export summary.
pub fn level(strength: f64) -> &'static str {
    match strength {
        s if s < 20.0 => "light",
        s if s < 34.0 => "medium",
        s if s < 48.0 => "strong",
        _ => "maximum",
    }
}

pub fn process(path: &std::path::Path, regions: &[SensitiveRegion], s: &RedactionSettings) -> CoreResult<ProcessedImage> {
    let info = codec::info(path)?;
    let source = codec::load_image(path, None)?;
    let output = source.with_image(render(&source.image, regions, s));
    let format = s.format.unwrap_or_else(|| info.same_format());
    let mut o = EncodeOptions::new(format);
    o.quality = format.is_lossy().then_some(s.quality);
    let keep = if s.clean_metadata { None } else { info.exif.clone() };
    o.keep_exif = keep.as_deref();
    let data = codec::encode(&output, &o)?;
    let mut notes = vec![Note::with("redact.note.regions", [regions.iter().filter(|r| r.is_selected).count()])];
    if s.clean_metadata {
        notes.push(Note::new("redact.note.metadata"));
    }
    Ok(ProcessedImage { data, format, width: output.width(), height: output.height(), notes, expect_metadata_clean: Some(s.clean_metadata) })
}

/// A screen-sized copy of the image (orientation applied) for live previews.
pub fn preview_base(path: &std::path::Path, max_pixel: u32) -> Option<DynamicImage> {
    codec::load_image(path, Some(max_pixel)).ok().map(|l| l.image).filter(|i| i.dimensions().0 > 0)
}

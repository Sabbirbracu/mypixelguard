//! Port of `ImageResizeService.swift`: sizing maths (Fit / Fill / Stretch) and the export.

use image::{DynamicImage, RgbaImage};
use serde::{Deserialize, Serialize};

use crate::codec::{self, EncodeOptions, Loaded, OutputFormat, ProcessedImage};
use crate::error::{CoreResult, Note};

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Pixels,
    Percent,
}
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Fit {
    Fit,
    Fill,
    Stretch,
}
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Driver {
    Width,
    Height,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ResizeSettings {
    pub mode: Mode,
    pub width: u32,
    pub height: u32,
    pub lock_aspect: bool,
    pub driver: Driver,
    pub percent: f64,
    pub fit: Fit,
    pub never_enlarge: bool,
    pub output_format: Option<OutputFormat>,
    pub quality: f64,
    pub background: [u8; 3],
    pub keep_metadata: bool,
    pub suffix: String,
}

impl Default for ResizeSettings {
    fn default() -> Self {
        ResizeSettings {
            mode: Mode::Pixels,
            width: 1080,
            height: 1080,
            lock_aspect: true,
            driver: Driver::Width,
            percent: 50.0,
            fit: Fit::Fit,
            never_enlarge: false,
            output_format: None,
            quality: 0.9,
            background: [255, 255, 255],
            keep_metadata: false,
            suffix: "_resized".into(),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct DrawRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct Plan {
    pub canvas_width: u32,
    pub canvas_height: u32,
    /// Where the source is drawn inside the canvas (bigger than the canvas when cropping).
    pub draw: DrawRect,
    pub enlarges: bool,
    pub unchanged: bool,
}

pub fn plan(original: (u32, u32), s: &ResizeSettings) -> Plan {
    let (ow, oh) = (original.0 as f64, original.1 as f64);
    let (cw, ch): (f64, f64);
    let mut draw = DrawRect { x: 0.0, y: 0.0, w: ow, h: oh };
    let scale_up: bool;

    match (s.mode, s.lock_aspect) {
        (Mode::Percent, _) => {
            let f = s.percent.max(1.0) / 100.0;
            cw = ow * f;
            ch = oh * f;
            scale_up = f > 1.0;
        }
        (Mode::Pixels, true) => {
            let f = if s.driver == Driver::Width { s.width as f64 / ow } else { s.height as f64 / oh };
            cw = ow * f;
            ch = oh * f;
            scale_up = f > 1.0;
        }
        (Mode::Pixels, false) => {
            let (tw, th) = (s.width.max(1) as f64, s.height.max(1) as f64);
            match s.fit {
                Fit::Fit => {
                    let f = (tw / ow).min(th / oh);
                    cw = ow * f;
                    ch = oh * f;
                    scale_up = f > 1.0;
                }
                Fit::Fill => {
                    let f = (tw / ow).max(th / oh);
                    cw = tw;
                    ch = th;
                    draw = DrawRect { x: (tw - ow * f) / 2.0, y: (th - oh * f) / 2.0, w: ow * f, h: oh * f };
                    scale_up = f > 1.0;
                }
                Fit::Stretch => {
                    cw = tw;
                    ch = th;
                    scale_up = tw > ow || th > oh;
                }
            }
        }
    }

    if scale_up && s.never_enlarge {
        return Plan {
            canvas_width: original.0,
            canvas_height: original.1,
            draw: DrawRect { x: 0.0, y: 0.0, w: ow, h: oh },
            enlarges: false,
            unchanged: true,
        };
    }
    let w = (cw.round() as u32).max(1);
    let h = (ch.round() as u32).max(1);
    if draw.w == ow && draw.h == oh && draw.x == 0.0 && draw.y == 0.0 {
        draw = DrawRect { x: 0.0, y: 0.0, w: w as f64, h: h as f64 };
    }
    Plan { canvas_width: w, canvas_height: h, draw, enlarges: scale_up, unchanged: w == original.0 && h == original.1 }
}

/// Draws `source` scaled into a `plan` canvas. With `background` the result is opaque.
pub fn render(source: &DynamicImage, plan: &Plan, background: Option<[u8; 3]>) -> DynamicImage {
    let (cw, ch) = (plan.canvas_width, plan.canvas_height);
    let dw = plan.draw.w.round().max(1.0) as u32;
    let dh = plan.draw.h.round().max(1.0) as u32;
    let scaled = crate::resize_pixels(source, dw, dh);
    if dw == cw && dh == ch && plan.draw.x.round() == 0.0 && plan.draw.y.round() == 0.0 && background.is_none() {
        return scaled;
    }
    let mut canvas = RgbaImage::new(cw, ch);
    if let Some(bg) = background {
        for p in canvas.pixels_mut() {
            *p = image::Rgba([bg[0], bg[1], bg[2], 255]);
        }
    }
    let (ox, oy) = (plan.draw.x.round() as i64, plan.draw.y.round() as i64);
    // `overlay` composites with alpha, which is right for both opaque and transparent sources.
    image::imageops::overlay(&mut canvas, &scaled.to_rgba8(), ox, oy);
    let out = DynamicImage::ImageRgba8(canvas);
    if background.is_some() { DynamicImage::ImageRgb8(out.to_rgb8()) } else { out }
}

pub fn process(path: &std::path::Path, s: &ResizeSettings) -> CoreResult<ProcessedImage> {
    let info = codec::info(path)?;
    let source = codec::load_image(path, None)?;
    let p = plan((source.width(), source.height()), s);
    let mut notes: Vec<Note> = Vec::new();
    if info.is_animated {
        notes.push(Note::new("note.animated"));
    }
    if p.unchanged && s.never_enlarge {
        notes.push(Note::new("note.notEnlarged"));
    }
    let format = s.output_format.unwrap_or_else(|| info.same_format());
    if info.has_alpha && !format.supports_alpha() {
        notes.push(Note::new("note.flattened"));
    }
    let resized: Loaded = if p.unchanged {
        source
    } else {
        // Fill/crop on a format without transparency can leave no gaps, so only flatten when needed.
        let bg = if format.supports_alpha() { None } else { Some(s.background) };
        let img = render(&source.image, &p, bg);
        source.with_image(img)
    };
    let mut o = EncodeOptions::new(format);
    o.quality = format.is_lossy().then_some(s.quality);
    o.background = s.background;
    let keep = if s.keep_metadata { info.exif.clone() } else { None };
    o.keep_exif = keep.as_deref();
    let data = codec::encode(&resized, &o)?;
    Ok(ProcessedImage {
        data,
        format,
        width: resized.width(),
        height: resized.height(),
        notes,
        expect_metadata_clean: Some(!s.keep_metadata),
    })
}

//! Port of `ImageResizeService.swift` and `BorderFill.swift`: sizing maths (Fit / Fill / Stretch) and the export.

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
    /// What the Resize tab offers as "Fit": the exact size, the whole picture inside, borders where the shapes differ.
    Pad,
    Fill,
    Stretch,
    /// Only shrinks the picture to fit (no borders); Batch Studio recipes use it.
    Fit,
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
    /// "Fit" borders take their colour from the picture's own edges (otherwise `background`).
    pub border_auto: bool,
    /// With "Fill": which part of the picture stays visible. (0, 0) is the top-left corner, (0.5, 0.5) the centre.
    pub anchor: [f64; 2],
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
            fit: Fit::Pad,
            border_auto: true,
            anchor: [0.5, 0.5],
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
                Fit::Pad => {
                    let f = (tw / ow).min(th / oh);
                    cw = tw;
                    ch = th;
                    draw = DrawRect { x: (tw - ow * f) / 2.0, y: (th - oh * f) / 2.0, w: ow * f, h: oh * f };
                    scale_up = f > 1.0;
                }
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
                    let (ax, ay) = (s.anchor[0].clamp(0.0, 1.0), s.anchor[1].clamp(0.0, 1.0));
                    draw = DrawRect { x: (tw - ow * f) * ax, y: (th - oh * f) * ay, w: ow * f, h: oh * f };
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

// MARK: Edge-matched borders (BorderFill.swift)

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Bars {
    /// Empty space at the left and right.
    Sides,
    /// Empty space at the top and bottom.
    TopBottom,
}

/// Colours sampled along the two edges next to the bars, top-to-bottom (sides) or left-to-right (top/bottom).
#[derive(Clone, Debug, PartialEq)]
pub struct BorderSamples {
    /// Along the first edge (left or top).
    pub start: Vec<[u8; 3]>,
    /// Along the opposite edge (right or bottom).
    pub end: Vec<[u8; 3]>,
}

pub fn bars(plan: &Plan) -> Option<Bars> {
    if plan.draw.w < plan.canvas_width as f64 - 0.5 {
        Some(Bars::Sides)
    } else if plan.draw.h < plan.canvas_height as f64 - 0.5 {
        Some(Bars::TopBottom)
    } else {
        None
    }
}

/// Averages `count` stretches of the picture's two outer pixel lines along each edge (on a 96 × 96 copy over white).
pub fn border_samples(image: &DynamicImage, bars: Bars, count: usize) -> BorderSamples {
    const N: usize = 96;
    let small = crate::resize_pixels(image, N as u32, N as u32);
    let rgb = crate::codec::flatten(&small, [255, 255, 255]);
    let px = |x: usize, y: usize| rgb.get_pixel(x as u32, y as u32).0;
    let step = (N / count).max(1);
    let average = |points: Vec<(usize, usize)>| -> [u8; 3] {
        let mut sum = [0f64; 3];
        for &(x, y) in &points {
            let p = px(x, y);
            for c in 0..3 {
                sum[c] += p[c] as f64;
            }
        }
        let k = points.len().max(1) as f64;
        [(sum[0] / k).round() as u8, (sum[1] / k).round() as u8, (sum[2] / k).round() as u8]
    };
    let along = |edge: &dyn Fn(usize) -> [(usize, usize); 2]| -> Vec<[u8; 3]> {
        (0..count).map(|i| average((i * step..((i + 1) * step).min(N)).flat_map(|j| edge(j)).collect())).collect()
    };
    match bars {
        Bars::Sides => BorderSamples { start: along(&|y| [(0, y), (1, y)]), end: along(&|y| [(N - 1, y), (N - 2, y)]) },
        Bars::TopBottom => BorderSamples { start: along(&|x| [(x, 0), (x, 1)]), end: along(&|x| [(x, N - 1), (x, N - 2)]) },
    }
}

/// Colour at `t` (0…1) of an evenly spaced gradient through `stops`.
fn gradient_at(stops: &[[u8; 3]], t: f64) -> [u8; 3] {
    if stops.len() < 2 {
        return stops.first().copied().unwrap_or([255, 255, 255]);
    }
    let pos = t.clamp(0.0, 1.0) * (stops.len() - 1) as f64;
    let i = (pos.floor() as usize).min(stops.len() - 2);
    let f = pos - i as f64;
    let (a, b) = (stops[i], stops[i + 1]);
    [0, 1, 2].map(|c| (a[c] as f64 + (b[c] as f64 - a[c] as f64) * f).round() as u8)
}

/// Fills the canvas around the picture with gradients continuing its edges (opaque result).
fn paint_bars(canvas: &mut RgbaImage, plan: &Plan, bars: Bars, samples: &BorderSamples) {
    let (w, h) = (canvas.width(), canvas.height());
    let (x0, y0) = (plan.draw.x.round().max(0.0) as u32, plan.draw.y.round().max(0.0) as u32);
    let (x1, y1) = ((plan.draw.x + plan.draw.w).round().min(w as f64) as u32, (plan.draw.y + plan.draw.h).round().min(h as f64) as u32);
    for y in 0..h {
        for x in 0..w {
            let colour = match bars {
                Bars::Sides if x < x0 => gradient_at(&samples.start, y as f64 / h.max(2).saturating_sub(1) as f64),
                Bars::Sides if x >= x1 => gradient_at(&samples.end, y as f64 / h.max(2).saturating_sub(1) as f64),
                Bars::TopBottom if y < y0 => gradient_at(&samples.start, x as f64 / w.max(2).saturating_sub(1) as f64),
                Bars::TopBottom if y >= y1 => gradient_at(&samples.end, x as f64 / w.max(2).saturating_sub(1) as f64),
                _ => continue,
            };
            canvas.put_pixel(x, y, image::Rgba([colour[0], colour[1], colour[2], 255]));
        }
    }
}

/// Draws `source` scaled into a `plan` canvas. With `background` the result is opaque.
pub fn render(source: &DynamicImage, plan: &Plan, background: Option<[u8; 3]>) -> DynamicImage {
    render_with(source, plan, background, None)
}

/// Like `render`, with the empty space filled from the picture's own edge colours when `edges` is given.
pub fn render_with(source: &DynamicImage, plan: &Plan, background: Option<[u8; 3]>, edges: Option<(Bars, &BorderSamples)>) -> DynamicImage {
    let (cw, ch) = (plan.canvas_width, plan.canvas_height);
    let dw = plan.draw.w.round().max(1.0) as u32;
    let dh = plan.draw.h.round().max(1.0) as u32;
    let scaled = crate::resize_pixels(source, dw, dh);
    if dw == cw && dh == ch && plan.draw.x.round() == 0.0 && plan.draw.y.round() == 0.0 && background.is_none() {
        return scaled;
    }
    let mut canvas = RgbaImage::new(cw, ch);
    let background = if edges.is_some() { background.or(Some([255, 255, 255])) } else { background };
    if let Some(bg) = background {
        for p in canvas.pixels_mut() {
            *p = image::Rgba([bg[0], bg[1], bg[2], 255]);
        }
    }
    if let Some((bars, samples)) = edges {
        paint_bars(&mut canvas, plan, bars, samples);
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
        // Borders and flattened transparency take the background colour, unless the picture itself can stay transparent.
        let keeps_transparency = format.supports_alpha() && info.has_alpha;
        let bg = if keeps_transparency { None } else { Some(s.background) };
        let edge_bars = (s.border_auto && !keeps_transparency).then(|| bars(&p)).flatten();
        let samples = edge_bars.map(|b| border_samples(&source.image, b, 12));
        let img = render_with(&source.image, &p, bg, edge_bars.zip(samples.as_ref()));
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

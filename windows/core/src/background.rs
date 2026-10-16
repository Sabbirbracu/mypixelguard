//! Background removal. Same approach as the macOS tool: the subject's pixels are never resampled,
//! recoloured or recompressed — the only new information is an alpha channel built from a mask.
//!
//! The mask comes from the ISNet general-use model (Apache-2.0) running on ONNX Runtime, fully offline.
//! Because the model only sees a 1024 px copy of the photo, its mask is refined at full resolution with a
//! guided filter that uses the original photo as the guide, so edges snap to real edges in the picture.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use image::{DynamicImage, RgbaImage};
use serde::{Deserialize, Serialize};

use crate::codec::{self, EncodeOptions, OutputFormat, ProcessedImage};
use crate::error::{CoreError, CoreResult, Note};

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Fill {
    Transparent,
    Color,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct BackgroundSettings {
    pub fill: Fill,
    /// Used when `fill` is `Color`.
    pub color: [u8; 3],
    pub format: OutputFormat,
    /// Only applies to lossy formats.
    pub quality: f64,
    /// 0 keeps the raw mask edge; higher values give a smoother, more anti-aliased edge.
    pub edge_smoothing: f64,
    pub keep_metadata: bool,
    pub suffix: String,
}

impl Default for BackgroundSettings {
    fn default() -> Self {
        BackgroundSettings {
            fill: Fill::Transparent,
            color: [255, 255, 255],
            format: OutputFormat::Png,
            quality: 0.95,
            edge_smoothing: 0.4,
            keep_metadata: false,
            suffix: "_nobg".into(),
        }
    }
}

impl BackgroundSettings {
    /// Formats that can hold the chosen fill: transparency needs an alpha channel, a solid colour doesn't.
    pub fn available_formats(&self) -> Vec<OutputFormat> {
        OutputFormat::available().into_iter().filter(|f| self.fill == Fill::Color || f.supports_alpha()).collect()
    }
    pub fn effective_format(&self) -> OutputFormat {
        let avail = self.available_formats();
        if avail.contains(&self.format) { self.format } else { avail.first().copied().unwrap_or(OutputFormat::Png) }
    }
}

// MARK: Model

const MODEL_NAME: &str = "isnet-general-use.onnx";
const SIDE: u32 = 1024;
const MEAN: [f32; 3] = [0.485, 0.456, 0.406];
/// Steepness of the S-curve applied to the averaged model output.
const SHARPNESS: f32 = 8.0;

static ENVIRONMENT: OnceLock<ort::environment::Environment> = OnceLock::new();

pub(crate) fn environment() -> CoreResult<&'static ort::environment::Environment> {
    if let Some(e) = ENVIRONMENT.get() {
        return Ok(e);
    }
    let env = ort::init().with_name("mypixelguard").with_telemetry(false).build().map_err(|e| CoreError::with("bg.err.runtime", [e.to_string()]))?;
    Ok(ENVIRONMENT.get_or_init(|| env))
}

/// Where the model file might live, most specific first.
pub fn model_candidates(resource_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Ok(p) = std::env::var("MPG_MODEL") {
        v.push(PathBuf::from(p));
    }
    if let Some(dir) = resource_dir {
        v.push(dir.join("models").join(MODEL_NAME));
        v.push(dir.join(MODEL_NAME));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            v.push(dir.join("models").join(MODEL_NAME));
            v.push(dir.join("resources").join("models").join(MODEL_NAME));
        }
    }
    v.push(PathBuf::from("models").join(MODEL_NAME));
    v.push(PathBuf::from("../models").join(MODEL_NAME));
    v
}

pub struct Segmenter {
    session: Mutex<ort::session::Session>,
}

impl Segmenter {
    pub fn locate(resource_dir: Option<&Path>) -> Option<PathBuf> {
        model_candidates(resource_dir).into_iter().find(|p| p.is_file())
    }

    pub fn load(model: &Path) -> CoreResult<Segmenter> {
        let env = environment()?;
        let session = ort::session::Session::builder(env)
            .and_then(|mut b| b.commit_from_file(model))
            .map_err(|e| CoreError::with("bg.err.model", [e.to_string()]))?;
        Ok(Segmenter { session: Mutex::new(session) })
    }

    /// One model pass over a 1024×1024 plane (NCHW, already normalised). Returns 1024×1024 probabilities.
    fn infer(&self, plane: Vec<f32>) -> CoreResult<Vec<f32>> {
        let side = SIDE as usize;
        let runtime = |e: ort::Error| CoreError::with("bg.err.runtime", [e.to_string()]);
        let input = ort::value::Tensor::from_array(([1usize, 3, side, side], plane)).map_err(runtime)?;
        let mut session = self.session.lock().map_err(|_| CoreError::encode_failed())?;
        let outputs = session.run(ort::inputs![input]).map_err(runtime)?;
        let (_, data) = outputs[0].try_extract_tensor::<f32>().map_err(runtime)?;
        if data.len() < side * side {
            return Err(CoreError::encode_failed());
        }
        Ok(data[..side * side].to_vec())
    }

    /// Subject probability for every pixel of `img`, 0…255, exactly `width × height` values.
    ///
    /// The model runs on the photo and on its mirror image and the two answers are averaged, which removes
    /// most of the model's one-sided guesses; the result is then sharpened and snapped to the photo's edges.
    pub fn mask(&self, img: &DynamicImage) -> CoreResult<Vec<u8>> {
        let (w, h) = (img.width(), img.height());
        let small = crate::resize_pixels(&DynamicImage::ImageRgb8(img.to_rgb8()), SIDE, SIDE).to_rgb8();
        let max = small.as_raw().iter().copied().max().unwrap_or(255).max(1) as f32;
        let side = SIDE as usize;
        let plane = |flip: bool| {
            let mut plane = vec![0f32; 3 * side * side];
            for (x, y, p) in small.enumerate_pixels() {
                let sx = if flip { side - 1 - x as usize } else { x as usize };
                let i = y as usize * side + sx;
                for c in 0..3 {
                    plane[c * side * side + i] = p[c] as f32 / max - MEAN[c];
                }
            }
            plane
        };
        let normalise = |v: Vec<f32>| -> Option<Vec<f32>> {
            let (lo, hi) = v.iter().fold((f32::MAX, f32::MIN), |(l, h), &x| (l.min(x), h.max(x)));
            (hi - lo > 1e-6).then(|| v.iter().map(|x| (x - lo) / (hi - lo)).collect())
        };
        let straight = normalise(self.infer(plane(false))?).ok_or_else(|| CoreError::new("bg.err.noSubject"))?;
        let mirrored = normalise(self.infer(plane(true))?).ok_or_else(|| CoreError::new("bg.err.noSubject"))?;
        let mut norm = vec![0f32; side * side];
        for y in 0..side {
            for x in 0..side {
                norm[y * side + x] = 0.5 * (straight[y * side + x] + mirrored[y * side + (side - 1 - x)]);
            }
        }
        // Push uncertain values toward a decision (S-curve centred on 0.5).
        for v in norm.iter_mut() {
            *v = 1.0 / (1.0 + (-(*v - 0.5) * SHARPNESS).exp());
        }

        let full = resize_f32(&norm, side, side, w as usize, h as usize);
        let guide = luminance(img);
        let refined = guided_filter(&guide, &full, w as usize, h as usize);
        let mask: Vec<u8> = refined.iter().map(|v| (v.clamp(0.0, 1.0) * 255.0).round() as u8).collect();
        if mask.iter().filter(|&&m| m > 127).count() < (w as usize * h as usize) / 400 {
            return Err(CoreError::new("bg.err.noSubject"));
        }
        Ok(mask)
    }
}

// MARK: Float helpers

fn resize_f32(src: &[f32], sw: usize, sh: usize, dw: usize, dh: usize) -> Vec<f32> {
    use fast_image_resize::{FilterType, PixelType, ResizeAlg, ResizeOptions, Resizer, images::Image};
    if sw == dw && sh == dh {
        return src.to_vec();
    }
    let bytes: Vec<u8> = src.iter().flat_map(|f| f.to_ne_bytes()).collect();
    let image = Image::from_vec_u8(sw as u32, sh as u32, bytes, PixelType::F32).expect("f32 buffer");
    let mut dst = Image::new(dw as u32, dh as u32, PixelType::F32);
    let options = ResizeOptions::new().resize_alg(ResizeAlg::Convolution(FilterType::Bilinear));
    Resizer::new().resize(&image, &mut dst, &options).expect("resize f32");
    dst.buffer().chunks_exact(4).map(|c| f32::from_ne_bytes([c[0], c[1], c[2], c[3]])).collect()
}

fn luminance(img: &DynamicImage) -> Vec<f32> {
    img.to_rgb8().pixels().map(|p| (0.299 * p[0] as f32 + 0.587 * p[1] as f32 + 0.114 * p[2] as f32) / 255.0).collect()
}

/// Mean over a (2r+1)² window, clamped at the borders.
fn box_mean(src: &[f32], w: usize, h: usize, r: usize) -> Vec<f32> {
    let mut tmp = vec![0f32; w * h];
    for y in 0..h {
        let row = &src[y * w..(y + 1) * w];
        let mut acc = 0f64;
        let mut count = 0usize;
        for x in 0..r.min(w) {
            acc += row[x] as f64;
            count += 1;
        }
        for x in 0..w {
            if x + r < w {
                acc += row[x + r] as f64;
                count += 1;
            }
            if x > r {
                acc -= row[x - r - 1] as f64;
                count -= 1;
            }
            tmp[y * w + x] = (acc / count as f64) as f32;
        }
    }
    let mut out = vec![0f32; w * h];
    for x in 0..w {
        let mut acc = 0f64;
        let mut count = 0usize;
        for y in 0..r.min(h) {
            acc += tmp[y * w + x] as f64;
            count += 1;
        }
        for y in 0..h {
            if y + r < h {
                acc += tmp[(y + r) * w + x] as f64;
                count += 1;
            }
            if y > r {
                acc -= tmp[(y - r - 1) * w + x] as f64;
                count -= 1;
            }
            out[y * w + x] = (acc / count as f64) as f32;
        }
    }
    out
}

/// Fast guided filter (He & Sun): smooths `p` while keeping the edges that exist in the guide `i`.
fn guided_filter(i: &[f32], p: &[f32], w: usize, h: usize) -> Vec<f32> {
    let longest = w.max(h);
    // Work at a reduced size, then upsample the (smooth) linear coefficients.
    let s = (longest as f32 / 1100.0).ceil().max(1.0) as usize;
    let (lw, lh) = ((w / s).max(1), (h / s).max(1));
    let (i_s, p_s) = if s > 1 { (resize_f32(i, w, h, lw, lh), resize_f32(p, w, h, lw, lh)) } else { (i.to_vec(), p.to_vec()) };
    let r = ((longest / s) as f32 / 150.0).round().max(3.0) as usize;
    let eps = 1e-3f32;

    let mean_i = box_mean(&i_s, lw, lh, r);
    let mean_p = box_mean(&p_s, lw, lh, r);
    let ii: Vec<f32> = i_s.iter().map(|v| v * v).collect();
    let ip: Vec<f32> = i_s.iter().zip(&p_s).map(|(a, b)| a * b).collect();
    let corr_i = box_mean(&ii, lw, lh, r);
    let corr_ip = box_mean(&ip, lw, lh, r);
    let n = lw * lh;
    let mut a = vec![0f32; n];
    let mut b = vec![0f32; n];
    for k in 0..n {
        let var = corr_i[k] - mean_i[k] * mean_i[k];
        let cov = corr_ip[k] - mean_i[k] * mean_p[k];
        a[k] = cov / (var + eps);
        b[k] = mean_p[k] - a[k] * mean_i[k];
    }
    let mean_a = box_mean(&a, lw, lh, r);
    let mean_b = box_mean(&b, lw, lh, r);
    let (fa, fb) = if s > 1 { (resize_f32(&mean_a, lw, lh, w, h), resize_f32(&mean_b, lw, lh, w, h)) } else { (mean_a, mean_b) };
    (0..w * h).map(|k| (fa[k] * i[k] + fb[k]).clamp(0.0, 1.0)).collect()
}

// MARK: Edge refinement

/// Softens the mask edge slightly and then re-steepens it: a clean anti-aliased boundary without halos.
/// The blur radius grows with large images so preview and export look alike.
pub fn refine(mask: &[u8], w: usize, h: usize, smoothing: f64) -> Vec<u8> {
    let sigma = smoothing.max(0.0) * (w.max(h) as f64 / 2000.0).max(1.0);
    let kernel = ((sigma * 4.9).round() as usize) | 1; // tent filter ≈ Gaussian, odd width
    if kernel < 3 {
        return mask.to_vec();
    }
    let half = kernel / 2;
    let weights: Vec<u32> = (0..kernel).map(|i| (half as i64 + 1 - (i as i64 - half as i64).abs()) as u32).collect();
    let total: u32 = weights.iter().sum();
    // Horizontal pass then vertical pass (edge pixels are repeated).
    let mut tmp = vec![0u8; mask.len()];
    for y in 0..h {
        for x in 0..w {
            let mut acc = 0u32;
            for (k, wt) in weights.iter().enumerate() {
                let xx = (x as i64 + k as i64 - half as i64).clamp(0, w as i64 - 1) as usize;
                acc += mask[y * w + xx] as u32 * wt;
            }
            tmp[y * w + x] = ((acc + total / 2) / total) as u8;
        }
    }
    let mut out = vec![0u8; mask.len()];
    for y in 0..h {
        for x in 0..w {
            let mut acc = 0u32;
            for (k, wt) in weights.iter().enumerate() {
                let yy = (y as i64 + k as i64 - half as i64).clamp(0, h as i64 - 1) as usize;
                acc += tmp[yy * w + x] as u32 * wt;
            }
            out[y * w + x] = ((acc + total / 2) / total) as u8;
        }
    }
    let steepen: Vec<u8> = (0..256).map(|v| (((v as f64 - 127.5) * 2.0 + 127.5).round().clamp(0.0, 255.0)) as u8).collect();
    for v in out.iter_mut() {
        *v = steepen[*v as usize];
    }
    out
}

// MARK: Compositing

/// Returns `img` with `mask` as its alpha channel. RGB values are copied unchanged (straight alpha,
/// no premultiplication loss); an alpha channel the image already had is multiplied in.
pub fn attach(mask: &[u8], img: &DynamicImage) -> Option<DynamicImage> {
    let (w, h) = (img.width(), img.height());
    if mask.len() != (w * h) as usize {
        return None;
    }
    let mut rgba: RgbaImage = img.to_rgba8();
    let opaque = !img.color().has_alpha();
    for (k, p) in rgba.pixels_mut().enumerate() {
        let m = mask[k] as u32;
        p[3] = if opaque { m as u8 } else { ((p[3] as u32 * m + 127) / 255) as u8 };
    }
    Some(DynamicImage::ImageRgba8(rgba))
}

/// The cut-out of `img` (same size, straight alpha), or flattened onto a colour when requested.
pub fn cutout(img: &DynamicImage, seg: &Segmenter, s: &BackgroundSettings) -> CoreResult<DynamicImage> {
    let mask = seg.mask(img)?;
    cutout_with_mask(img, &mask, s)
}

pub fn cutout_with_mask(img: &DynamicImage, mask: &[u8], s: &BackgroundSettings) -> CoreResult<DynamicImage> {
    let refined = refine(mask, img.width() as usize, img.height() as usize, s.edge_smoothing);
    let cut = attach(&refined, img).ok_or_else(CoreError::encode_failed)?;
    Ok(match s.fill {
        Fill::Transparent => cut,
        Fill::Color => DynamicImage::ImageRgb8(codec::flatten(&cut, s.color)),
    })
}

pub fn process(path: &Path, s: &BackgroundSettings, seg: &Segmenter) -> CoreResult<ProcessedImage> {
    let info = codec::info(path)?;
    let source = codec::load_image(path, None)?;
    let cut = source.with_image(cutout(&source.image, seg, s)?);
    let format = s.effective_format();
    let mut o = EncodeOptions::new(format);
    o.quality = format.is_lossy().then_some(s.quality);
    o.background = s.color;
    let keep = if s.keep_metadata { info.exif.clone() } else { None };
    o.keep_exif = keep.as_deref();
    let data = codec::encode(&cut, &o)?;
    // Never hand back a file that silently lost its transparency.
    if s.fill == Fill::Transparent {
        match codec::thumbnail_of(&data, 64) {
            Some(t) if t.color().has_alpha() => {}
            _ => return Err(CoreError::encode_failed()),
        }
    }
    let mut notes = vec![Note::new("bg.note.removed")];
    if info.is_animated {
        notes.push(Note::new("note.animated"));
    }
    if format.is_lossy() {
        notes.push(Note::with("bg.note.lossy", [format.display_name()]));
    }
    Ok(ProcessedImage { data, format, width: cut.width(), height: cut.height(), notes, expect_metadata_clean: Some(!s.keep_metadata) })
}

/// Fast, reduced-size version of the same cut-out for the live before/after view.
pub fn preview(path: &Path, s: &BackgroundSettings, seg: &Segmenter) -> CoreResult<DynamicImage> {
    let small = codec::load_image(path, Some(1100))?;
    cutout(&small.image, seg, s)
}

//! Face detection with the small YuNet model (MIT licence, ~340 KB, runs offline on ONNX Runtime).

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use image::DynamicImage;

use crate::error::{CoreError, CoreResult};
use crate::redact::NRect;
use crate::visual::FaceFinder;

const MODEL_NAME: &str = "face_detection_yunet_2023mar.onnx";
const SIDE: usize = 640;
const STRIDES: [usize; 3] = [8, 16, 32];
const SCORE_THRESHOLD: f32 = 0.7;
const NMS_THRESHOLD: f32 = 0.3;

pub fn locate(resource_dir: Option<&Path>) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(p) = std::env::var("MPG_FACE_MODEL") {
        candidates.push(PathBuf::from(p));
    }
    if let Some(dir) = resource_dir {
        candidates.push(dir.join("models").join(MODEL_NAME));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("models").join(MODEL_NAME));
            candidates.push(dir.join("resources").join("models").join(MODEL_NAME));
        }
    }
    candidates.push(PathBuf::from("models").join(MODEL_NAME));
    candidates.push(PathBuf::from("../models").join(MODEL_NAME));
    candidates.into_iter().find(|p| p.is_file())
}

pub struct YuNet {
    session: Mutex<ort::session::Session>,
}

impl YuNet {
    pub fn load(model: &Path) -> CoreResult<YuNet> {
        let env = crate::background::environment()?;
        let session = ort::session::Session::builder(env)
            .and_then(|mut b| b.commit_from_file(model))
            .map_err(|e| CoreError::with("bg.err.model", [e.to_string()]))?;
        Ok(YuNet { session: Mutex::new(session) })
    }
}

/// A candidate box in the 640×640 network space.
#[derive(Clone, Copy, Debug)]
pub struct Candidate {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub score: f32,
}

/// Decodes the 12 YuNet outputs (cls ×3, obj ×3, bbox ×3, kps ×3 — one per stride) into boxes.
pub fn decode(cls: [&[f32]; 3], obj: [&[f32]; 3], bbox: [&[f32]; 3]) -> Vec<Candidate> {
    let mut out = Vec::new();
    for (i, &stride) in STRIDES.iter().enumerate() {
        let cols = SIDE / stride;
        let rows = SIDE / stride;
        for r in 0..rows {
            for c in 0..cols {
                let idx = r * cols + c;
                if idx >= cls[i].len() || idx * 4 + 3 >= bbox[i].len() {
                    continue;
                }
                let score = (cls[i][idx].clamp(0.0, 1.0) * obj[i][idx].clamp(0.0, 1.0)).sqrt();
                if score < SCORE_THRESHOLD {
                    continue;
                }
                let b = &bbox[i][idx * 4..idx * 4 + 4];
                let s = stride as f32;
                let (cx, cy) = ((c as f32 + b[0]) * s, (r as f32 + b[1]) * s);
                let (w, h) = (b[2].exp() * s, b[3].exp() * s);
                out.push(Candidate { x: cx - w / 2.0, y: cy - h / 2.0, w, h, score });
            }
        }
    }
    out
}

fn iou(a: &Candidate, b: &Candidate) -> f32 {
    let (x0, y0) = (a.x.max(b.x), a.y.max(b.y));
    let (x1, y1) = ((a.x + a.w).min(b.x + b.w), (a.y + a.h).min(b.y + b.h));
    if x1 <= x0 || y1 <= y0 {
        return 0.0;
    }
    let inter = (x1 - x0) * (y1 - y0);
    inter / (a.w * a.h + b.w * b.h - inter)
}

/// Non-maximum suppression: the best box wins, overlapping weaker ones are dropped.
pub fn nms(mut boxes: Vec<Candidate>) -> Vec<Candidate> {
    boxes.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    let mut keep: Vec<Candidate> = Vec::new();
    for b in boxes {
        if keep.iter().all(|k| iou(k, &b) < NMS_THRESHOLD) {
            keep.push(b);
        }
    }
    keep
}

impl FaceFinder for YuNet {
    fn detect(&self, img: &DynamicImage) -> CoreResult<Vec<(NRect, f32)>> {
        let (w, h) = (img.width() as f32, img.height() as f32);
        // Letterbox into 640×640 so the model sees undistorted faces.
        let scale = SIDE as f32 / w.max(h);
        let (nw, nh) = (((w * scale).round() as u32).max(1), ((h * scale).round() as u32).max(1));
        let resized = crate::resize_pixels(&DynamicImage::ImageRgb8(img.to_rgb8()), nw, nh).to_rgb8();
        let mut plane = vec![0f32; 3 * SIDE * SIDE];
        for (x, y, p) in resized.enumerate_pixels() {
            let i = y as usize * SIDE + x as usize;
            // The model expects BGR, 0…255.
            plane[i] = p[2] as f32;
            plane[SIDE * SIDE + i] = p[1] as f32;
            plane[2 * SIDE * SIDE + i] = p[0] as f32;
        }
        let runtime = |e: ort::Error| CoreError::with("bg.err.runtime", [e.to_string()]);
        let input = ort::value::Tensor::from_array(([1usize, 3, SIDE, SIDE], plane)).map_err(runtime)?;
        let mut session = self.session.lock().map_err(|_| CoreError::encode_failed())?;
        let outputs = session.run(ort::inputs![input]).map_err(runtime)?;
        let mut tensors: Vec<Vec<f32>> = Vec::new();
        for i in 0..12 {
            let (_, data) = outputs[i].try_extract_tensor::<f32>().map_err(runtime)?;
            tensors.push(data.to_vec());
        }
        let candidates = decode(
            [&tensors[0], &tensors[1], &tensors[2]],
            [&tensors[3], &tensors[4], &tensors[5]],
            [&tensors[6], &tensors[7], &tensors[8]],
        );
        Ok(nms(candidates)
            .into_iter()
            .filter_map(|c| {
                // Back to the original image, clamped.
                let (x0, y0) = ((c.x / scale).max(0.0), (c.y / scale).max(0.0));
                let (x1, y1) = (((c.x + c.w) / scale).min(w), ((c.y + c.h) / scale).min(h));
                (x1 > x0 && y1 > y0).then(|| (NRect { x: (x0 / w) as f64, y: (y0 / h) as f64, w: ((x1 - x0) / w) as f64, h: ((y1 - y0) / h) as f64 }, c.score))
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_a_planted_face_and_merges_duplicates() {
        // One strong cell on the stride-16 grid at row 10, col 12, plus a weaker neighbour.
        let n = [(SIDE / 8).pow(2), (SIDE / 16).pow(2), (SIDE / 32).pow(2)];
        let mut cls = [vec![0f32; n[0]], vec![0f32; n[1]], vec![0f32; n[2]]];
        let mut obj = cls.clone();
        let mut bbox = [vec![0f32; n[0] * 4], vec![0f32; n[1] * 4], vec![0f32; n[2] * 4]];
        let cols = SIDE / 16;
        for (idx, s) in [(10 * cols + 12, 0.95f32), (10 * cols + 13, 0.8)] {
            cls[1][idx] = s;
            obj[1][idx] = s;
            bbox[1][idx * 4..idx * 4 + 4].copy_from_slice(&[0.5, 0.5, (64.0f32 / 16.0).ln(), (80.0f32 / 16.0).ln()]);
        }
        let found = nms(decode([&cls[0], &cls[1], &cls[2]], [&obj[0], &obj[1], &obj[2]], [&bbox[0], &bbox[1], &bbox[2]]));
        assert_eq!(found.len(), 1, "overlapping detections of one face collapse into the best one: {found:?}");
        let best = found[0];
        assert!((best.w - 64.0).abs() < 0.01 && (best.h - 80.0).abs() < 0.01);
        assert!((best.x - ((12.5 * 16.0) - 32.0)).abs() < 0.01);
    }
}

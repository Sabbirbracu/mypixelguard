//! Finds faces and sensitive text (emails, phone numbers, addresses, ID cards, number plates) so they
//! can be redacted. Port of `VisualPrivacyScanner.swift`. Detection engines are pluggable: faces use the
//! small YuNet model; text uses Windows' built-in OCR (see `ocr_windows.rs`).

use std::sync::LazyLock;

use image::DynamicImage;
use regex::Regex;
use serde::Serialize;

use crate::error::CoreResult;
use crate::redact::{NRect, RegionKind, SensitiveRegion};

#[derive(Clone, Debug)]
pub struct TextLine {
    pub text: String,
    pub rect: NRect,
    pub confidence: f32,
}

pub trait TextRecognizer {
    fn recognize(&self, img: &DynamicImage) -> CoreResult<Vec<TextLine>>;
}

pub trait FaceFinder {
    /// Face boxes (normalised, top-left origin) with a confidence 0…1.
    fn detect(&self, img: &DynamicImage) -> CoreResult<Vec<(NRect, f32)>>;
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualPrivacyReport {
    pub regions: Vec<SensitiveRegion>,
    pub recognized_text_count: usize,
    /// False when the machine has no text recogniser / face model, so the UI can say why nothing was found.
    pub text_available: bool,
    pub faces_available: bool,
}

pub fn scan(img: &DynamicImage, faces: Option<&dyn FaceFinder>, ocr: Option<&dyn TextRecognizer>) -> CoreResult<VisualPrivacyReport> {
    let mut regions: Vec<SensitiveRegion> = Vec::new();
    let mut text_count = 0;
    let mut serial = 0;
    let mut next_id = |prefix: &str| {
        serial += 1;
        format!("{prefix}-{serial}")
    };

    if let Some(finder) = faces {
        for (rect, confidence) in finder.detect(img)? {
            regions.push(SensitiveRegion {
                id: next_id("face"),
                kind: RegionKind::Face,
                rect,
                label: "t:visual.kind.face".into(),
                confidence,
                is_selected: true,
            });
        }
    }
    if let Some(engine) = ocr {
        for line in engine.recognize(img)? {
            text_count += 1;
            let value = line.text.trim().to_string();
            if let Some(kind) = classify(&value) {
                regions.push(SensitiveRegion {
                    id: next_id("text"),
                    kind,
                    rect: line.rect,
                    label: redacted_label(&value, kind),
                    confidence: line.confidence,
                    is_selected: true,
                });
            }
        }
    }
    Ok(VisualPrivacyReport { regions: deduplicate(regions), recognized_text_count: text_count, text_available: ocr.is_some(), faces_available: faces.is_some() })
}

static EMAIL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}").unwrap());
static PHONE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\+?\d[\d\s().-]{7,}\d").unwrap());
static PLATE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)^[A-Z0-9 -]{5,12}$").unwrap());

pub fn classify(text: &str) -> Option<RegionKind> {
    let lower = text.to_lowercase();
    if EMAIL.is_match(text) {
        return Some(RegionKind::Email);
    }
    if PHONE.is_match(text) {
        return Some(RegionKind::Phone);
    }
    const ADDRESS_WORDS: [&str; 16] =
        ["street", "st.", "road", "rd.", "avenue", "ave", "lane", "ln.", "drive", "dr.", "বাসা", "রোড", "সড়ক", "গ্রাম", "উপজেলা", "district"];
    let has_digit = text.chars().any(|c| c.is_ascii_digit() || c.is_numeric());
    if has_digit && (ADDRESS_WORDS.iter().any(|w| lower.contains(w)) || lower.contains("postcode") || lower.contains("zip")) {
        return Some(RegionKind::Address);
    }
    if ["passport", "national id", "nid", "driver license", "driving licence"].iter().any(|w| lower.contains(w)) {
        return Some(RegionKind::Identifier);
    }
    // Conservative plate heuristic: mixed letters/numbers, short enough to resemble a plate.
    let compact: String = text.chars().filter(|c| *c != ' ' && *c != '-').collect();
    let n = compact.chars().count();
    if (5..=10).contains(&n) && compact.chars().any(|c| c.is_alphabetic()) && compact.chars().any(|c| c.is_ascii_digit()) && PLATE.is_match(text) {
        return Some(RegionKind::LicensePlate);
    }
    None
}

fn redacted_label(value: &str, kind: RegionKind) -> String {
    match kind {
        RegionKind::Email => match value.find('@') {
            Some(at) => format!("{}•••{}", value.chars().take(2).collect::<String>(), &value[at..]),
            None => "t:visual.kind.email".into(),
        },
        RegionKind::Phone => {
            let digits: Vec<char> = value.chars().filter(|c| c.is_numeric()).collect();
            format!("••••{}", digits[digits.len().saturating_sub(4)..].iter().collect::<String>())
        }
        _ => {
            if value.chars().count() > 42 {
                format!("{}…", value.chars().take(42).collect::<String>())
            } else {
                value.to_string()
            }
        }
    }
}

fn deduplicate(mut regions: Vec<SensitiveRegion>) -> Vec<SensitiveRegion> {
    regions.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal));
    let mut out: Vec<SensitiveRegion> = Vec::new();
    for r in regions {
        if !out.iter().any(|o| o.kind == r.kind && o.rect.iou(&r.rect) > 0.65) {
            out.push(r);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_like_the_mac_app() {
        assert_eq!(classify("write to sabbir@example.com"), Some(RegionKind::Email));
        assert_eq!(classify("+880 1712-345678"), Some(RegionKind::Phone));
        assert_eq!(classify("House 12, Road 5"), Some(RegionKind::Address));
        assert_eq!(classify("Passport No"), Some(RegionKind::Identifier));
        assert_eq!(classify("DHAKA 11-45"), Some(RegionKind::LicensePlate));
        assert_eq!(classify("Hello world"), None);
        assert_eq!(classify("12345"), None, "digits only is not a plate");
        assert_eq!(classify("DHAKA 11-4521"), None, "longer than a plate");
    }

    #[test]
    fn labels_hide_most_of_the_value() {
        assert_eq!(redacted_label("sabbir@example.com", RegionKind::Email), "sa•••@example.com");
        assert_eq!(redacted_label("+880 1712-345678", RegionKind::Phone), "••••5678");
    }

    #[test]
    fn duplicates_are_merged() {
        let r = |x: f64, c: f32| SensitiveRegion { id: "a".into(), kind: RegionKind::Face, rect: NRect { x, y: 0.1, w: 0.2, h: 0.2 }, label: String::new(), confidence: c, is_selected: true };
        let merged = deduplicate(vec![r(0.10, 0.9), r(0.11, 0.8), r(0.6, 0.7)]);
        assert_eq!(merged.len(), 2);
        assert_eq!(merged[0].confidence, 0.9);
    }
}

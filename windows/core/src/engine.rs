//! Byte-level metadata parsing and stripping for JPEG, PNG and WebP.
//! Port of `Engine.swift`: pixel data is always copied byte-for-byte, never re-encoded.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use crate::error::{CoreError, CoreResult};

/// A kind of embedded data that can be stripped from an image file.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MetaCategory {
    C2pa,
    Xmp,
    Iptc,
    Exif,
    Other,
    Icc,
}

impl MetaCategory {
    pub const ALL: [MetaCategory; 6] = [
        MetaCategory::C2pa,
        MetaCategory::Xmp,
        MetaCategory::Iptc,
        MetaCategory::Exif,
        MetaCategory::Other,
        MetaCategory::Icc,
    ];

    pub fn title(self) -> &'static str {
        match self {
            MetaCategory::C2pa => "C2PA / Content Credentials",
            MetaCategory::Xmp => "XMP data",
            MetaCategory::Iptc => "IPTC / Photoshop data",
            MetaCategory::Exif => "EXIF data",
            MetaCategory::Other => "Comments & other embedded data",
            MetaCategory::Icc => "Color profile (ICC)",
        }
    }

    /// Everything except the color profile is removed by default.
    pub fn default_removal() -> HashSet<MetaCategory> {
        Self::ALL.iter().copied().filter(|c| *c != MetaCategory::Icc).collect()
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum ImageKind {
    #[serde(rename = "JPEG")]
    Jpeg,
    #[serde(rename = "PNG")]
    Png,
    #[serde(rename = "WebP")]
    Webp,
    #[serde(rename = "GIF")]
    Gif,
    #[serde(rename = "Other")]
    Other,
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Info = 0,
    Medium = 1,
    High = 2,
}

/// One contiguous block of the file (a JPEG segment, PNG chunk or WebP chunk).
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Piece {
    pub start: usize,
    pub end: usize,
    pub label: String,
    /// `None` means structural / pixel data that is always kept.
    pub category: Option<MetaCategory>,
}

impl Piece {
    fn new(start: usize, end: usize, label: impl Into<String>, category: Option<MetaCategory>) -> Self {
        Piece { start, end, label: label.into(), category }
    }
    pub fn size(&self) -> usize {
        self.end - self.start
    }
}

// MARK: Byte helpers

pub fn has(b: &[u8], at: usize, s: &str) -> bool {
    let u = s.as_bytes();
    at + u.len() <= b.len() && &b[at..at + u.len()] == u
}

pub fn be32(b: &[u8], i: usize) -> usize {
    ((b[i] as usize) << 24) | ((b[i + 1] as usize) << 16) | ((b[i + 2] as usize) << 8) | b[i + 3] as usize
}

pub fn le32(b: &[u8], i: usize) -> usize {
    ((b[i + 3] as usize) << 24) | ((b[i + 2] as usize) << 16) | ((b[i + 1] as usize) << 8) | b[i] as usize
}

pub fn four_cc(b: &[u8], i: usize) -> String {
    String::from_utf8_lossy(&b[i..i + 4]).into_owned()
}

/// Decode bytes one-to-one into characters so ASCII text inside binary blobs can be searched.
pub fn latin1(s: &[u8]) -> String {
    s.iter().map(|&b| b as char).collect()
}

pub fn find(hay: &[u8], needle: &str) -> Option<usize> {
    let n = needle.as_bytes();
    if n.is_empty() || hay.len() < n.len() {
        return None;
    }
    hay.windows(n.len()).position(|w| w == n)
}

// MARK: Format detection

pub fn detect(b: &[u8]) -> ImageKind {
    if b.len() > 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF {
        return ImageKind::Jpeg;
    }
    if b.len() > 8 && b[0..8] == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
        return ImageKind::Png;
    }
    if b.len() > 12 && has(b, 0, "RIFF") && has(b, 8, "WEBP") {
        return ImageKind::Webp;
    }
    if b.len() > 6 && has(b, 0, "GIF8") {
        return ImageKind::Gif;
    }
    ImageKind::Other
}

pub fn parse(b: &[u8], kind: ImageKind) -> CoreResult<Vec<Piece>> {
    match kind {
        ImageKind::Jpeg => parse_jpeg(b),
        ImageKind::Png => parse_png(b),
        ImageKind::Webp => parse_webp(b),
        _ => Ok(Vec::new()),
    }
}

// MARK: JPEG

pub fn parse_jpeg(b: &[u8]) -> CoreResult<Vec<Piece>> {
    let n = b.len();
    let mut pieces = vec![Piece::new(0, 2, "Start of image", None)];
    let mut i = 2usize;
    while i < n {
        if b[i] != 0xFF {
            return Err(CoreError::corrupt(format!("unexpected data at byte {i}")));
        }
        if i + 1 >= n {
            break;
        }
        let m = b[i + 1];

        if m == 0xFF {
            i += 1; // fill byte
            continue;
        }
        if m == 0xD9 {
            // end of image
            pieces.push(Piece::new(i, i + 2, "End of image", None));
            i += 2;
            if i < n {
                pieces.push(Piece::new(i, n, "Extra data after image", Some(MetaCategory::Other)));
            }
            return Ok(pieces);
        }
        if m == 0x00 || m == 0x01 || (0xD0..=0xD8).contains(&m) {
            // markers without a length
            pieces.push(Piece::new(i, i + 2, "Marker", None));
            i += 2;
            continue;
        }

        if i + 3 >= n {
            return Err(CoreError::corrupt("truncated segment"));
        }
        let len = ((b[i + 2] as usize) << 8) | b[i + 3] as usize;
        let end = i + 2 + len;
        if len < 2 || end > n {
            return Err(CoreError::corrupt("truncated segment"));
        }

        if m == 0xDA {
            // start of scan: header + entropy-coded data
            pieces.push(Piece::new(i, end, "Scan header", None));
            let mut k = end;
            while k < n {
                if b[k] == 0xFF && k + 1 < n {
                    let nx = b[k + 1];
                    if nx == 0x00 || (0xD0..=0xD7).contains(&nx) {
                        k += 2;
                        continue;
                    }
                    if nx == 0xFF {
                        k += 1;
                        continue;
                    }
                    break;
                }
                k += 1;
            }
            pieces.push(Piece::new(end, k, "Image data", None));
            i = k;
            continue;
        }

        let (label, category) = classify_jpeg(m, b, i + 4);
        pieces.push(Piece::new(i, end, label, category));
        i = end;
    }
    Ok(pieces)
}

fn classify_jpeg(m: u8, b: &[u8], p: usize) -> (String, Option<MetaCategory>) {
    use MetaCategory::*;
    match m {
        0xE0 => {
            if has(b, p, "JFIF\0") || has(b, p, "JFXX\0") {
                ("JFIF header".into(), None)
            } else {
                ("APP0 · other".into(), Some(Other))
            }
        }
        0xE1 => {
            if has(b, p, "Exif\0\0") {
                ("APP1 · EXIF".into(), Some(Exif))
            } else if has(b, p, "http://ns.adobe.com/xap/1.0/\0") {
                ("APP1 · XMP".into(), Some(Xmp))
            } else if has(b, p, "http://ns.adobe.com/xmp/extension/\0") {
                ("APP1 · XMP (extended)".into(), Some(Xmp))
            } else {
                ("APP1 · other".into(), Some(Other))
            }
        }
        0xE2 => {
            if has(b, p, "ICC_PROFILE\0") {
                ("APP2 · ICC color profile".into(), Some(Icc))
            } else if has(b, p, "MPF\0") {
                ("APP2 · multi-picture data".into(), Some(Other))
            } else {
                ("APP2 · other".into(), Some(Other))
            }
        }
        0xEB => ("APP11 · JUMBF (C2PA / Content Credentials)".into(), Some(C2pa)),
        0xED => {
            if has(b, p, "Photoshop 3.0\0") {
                ("APP13 · Photoshop / IPTC".into(), Some(Iptc))
            } else {
                ("APP13 · other".into(), Some(Other))
            }
        }
        0xEE => {
            if has(b, p, "Adobe") {
                ("APP14 · Adobe color info".into(), None)
            } else {
                ("APP14 · other".into(), Some(Other))
            }
        }
        0xFE => ("Comment".into(), Some(Other)),
        0xE3..=0xEF => (format!("APP{} · other", m as i32 - 0xE0), Some(Other)),
        _ => ("Image structure".into(), None),
    }
}

// MARK: PNG

pub fn parse_png(b: &[u8]) -> CoreResult<Vec<Piece>> {
    let n = b.len();
    let mut pieces = vec![Piece::new(0, 8, "PNG signature", None)];
    let mut i = 8usize;
    while i + 12 <= n {
        let len = be32(b, i);
        let ty = four_cc(b, i + 4);
        let end = i + 12 + len;
        if end > n {
            return Err(CoreError::corrupt(format!("truncated {ty} chunk")));
        }
        let (label, category) = classify_png(&ty, b, i + 8, i + 8 + len);
        pieces.push(Piece::new(i, end, label, category));
        i = end;
        if ty == "IEND" {
            break;
        }
    }
    if i < n {
        pieces.push(Piece::new(i, n, "Extra data after image", Some(MetaCategory::Other)));
    }
    Ok(pieces)
}

fn classify_png(ty: &str, b: &[u8], data_start: usize, data_end: usize) -> (String, Option<MetaCategory>) {
    use MetaCategory::*;
    match ty {
        "IHDR" | "PLTE" | "IDAT" | "IEND" | "tRNS" | "gAMA" | "cHRM" | "sRGB" | "sBIT" | "bKGD" | "hIST" | "pHYs"
        | "sPLT" | "acTL" | "fcTL" | "fdAT" | "cICP" | "mDCV" | "cLLI" | "oFFs" | "sTER" => {
            (format!("PNG chunk {ty}"), None)
        }
        "iCCP" => ("iCCP · ICC color profile".into(), Some(Icc)),
        "eXIf" => ("eXIf · EXIF".into(), Some(Exif)),
        "tIME" => ("tIME · modification time".into(), Some(Exif)),
        "caBX" => ("caBX · C2PA manifest".into(), Some(C2pa)),
        "iTXt" | "tEXt" | "zTXt" => {
            let mut k = data_start;
            while k < data_end && k - data_start < 80 && b[k] != 0 {
                k += 1;
            }
            let keyword = String::from_utf8_lossy(&b[data_start..k]).into_owned();
            let lower = keyword.to_lowercase();
            if keyword == "XML:com.adobe.xmp" {
                ("iTXt · XMP".into(), Some(Xmp))
            } else if lower.contains("exif") {
                (format!("{ty} · EXIF ({keyword})"), Some(Exif))
            } else if lower.contains("iptc") {
                (format!("{ty} · IPTC ({keyword})"), Some(Iptc))
            } else if lower.contains("xmp") {
                (format!("{ty} · XMP ({keyword})"), Some(Xmp))
            } else {
                (format!("{ty} · text “{keyword}”"), Some(Other))
            }
        }
        _ => {
            if ty.chars().next().is_some_and(|c| c.is_lowercase()) {
                (format!("{ty} · other"), Some(Other))
            } else {
                (format!("PNG chunk {ty}"), None)
            }
        }
    }
}

// MARK: WebP

pub fn parse_webp(b: &[u8]) -> CoreResult<Vec<Piece>> {
    let n = b.len();
    let mut pieces = vec![Piece::new(0, 12, "RIFF header", None)];
    let mut i = 12usize;
    while i + 8 <= n {
        let ty = four_cc(b, i);
        let size = le32(b, i + 4);
        if i + 8 + size > n {
            return Err(CoreError::corrupt(format!("truncated {ty} chunk")));
        }
        let mut end = i + 8 + size;
        if size % 2 == 1 && end < n {
            end += 1;
        }
        let (label, category): (String, Option<MetaCategory>) = match ty.as_str() {
            "VP8X" | "VP8 " | "VP8L" | "ALPH" | "ANIM" | "ANMF" => (format!("WebP chunk {ty}"), None),
            "ICCP" => ("ICCP · ICC color profile".into(), Some(MetaCategory::Icc)),
            "EXIF" => ("EXIF".into(), Some(MetaCategory::Exif)),
            "XMP " => ("XMP".into(), Some(MetaCategory::Xmp)),
            "C2PA" => ("C2PA manifest".into(), Some(MetaCategory::C2pa)),
            _ => (format!("{ty} · other"), Some(MetaCategory::Other)),
        };
        pieces.push(Piece::new(i, end, label, category));
        i = end;
    }
    Ok(pieces)
}

// MARK: Stripping

/// Rebuilds the file without the categories in `remove`. Pixel data is copied byte-for-byte.
/// Returns the new bytes plus the EXIF orientation that was preserved (JPEG only).
pub fn strip(
    b: &[u8],
    kind: ImageKind,
    pieces: &[Piece],
    remove: &HashSet<MetaCategory>,
) -> (Vec<u8>, Option<u8>) {
    let mut out: Vec<u8> = Vec::with_capacity(b.len());
    let mut kept_orientation: Option<u8> = None;
    let mut orientation_segment: Vec<u8> = Vec::new();

    if kind == ImageKind::Jpeg && remove.contains(&MetaCategory::Exif) {
        if let Some(ex) = pieces.iter().find(|p| p.category == Some(MetaCategory::Exif)) {
            if ex.size() > 12 {
                let tiff = &b[ex.start + 10..ex.end];
                if let Some(o) = exif_orientation(tiff) {
                    if (2..=8).contains(&o) {
                        kept_orientation = Some(o as u8);
                        orientation_segment = make_orientation_segment(o as u8);
                    }
                }
            }
        }
    }

    for (index, p) in pieces.iter().enumerate() {
        if let Some(c) = p.category {
            if remove.contains(&c) {
                continue;
            }
        }
        out.extend_from_slice(&b[p.start..p.end]);
        // Put the tiny orientation-only EXIF block right after SOI / JFIF.
        let is_insertion_point = (index == 0 && !(pieces.len() > 1 && pieces[1].label == "JFIF header"))
            || p.label == "JFIF header";
        if !orientation_segment.is_empty() && is_insertion_point {
            out.extend_from_slice(&orientation_segment);
            orientation_segment.clear();
        }
    }

    if kind == ImageKind::Webp && out.len() >= 30 {
        let total = out.len() - 8;
        out[4] = (total & 0xFF) as u8;
        out[5] = ((total >> 8) & 0xFF) as u8;
        out[6] = ((total >> 16) & 0xFF) as u8;
        out[7] = ((total >> 24) & 0xFF) as u8;
        if has(&out, 12, "VP8X") {
            let mut flags = out[20];
            flags &= !(0x20 | 0x08 | 0x04);
            let had = |c| pieces.iter().any(|p| p.category == Some(c));
            if had(MetaCategory::Icc) && !remove.contains(&MetaCategory::Icc) {
                flags |= 0x20;
            }
            if had(MetaCategory::Exif) && !remove.contains(&MetaCategory::Exif) {
                flags |= 0x08;
            }
            if had(MetaCategory::Xmp) && !remove.contains(&MetaCategory::Xmp) {
                flags |= 0x04;
            }
            out[20] = flags;
        }
    }
    (out, kept_orientation)
}

pub fn exif_orientation(t: &[u8]) -> Option<u16> {
    if t.len() < 8 {
        return None;
    }
    let little = if t[0] == 0x49 && t[1] == 0x49 {
        true
    } else if t[0] == 0x4D && t[1] == 0x4D {
        false
    } else {
        return None;
    };
    let u16_at = |o: usize| -> Option<usize> {
        if o + 2 > t.len() {
            return None;
        }
        Some(if little { t[o] as usize | ((t[o + 1] as usize) << 8) } else { ((t[o] as usize) << 8) | t[o + 1] as usize })
    };
    let u32_at = |o: usize| -> Option<usize> {
        let a = u16_at(o)?;
        let b = u16_at(o + 2)?;
        Some(if little { a | (b << 16) } else { (a << 16) | b })
    };
    let ifd = u32_at(4)?;
    let count = u16_at(ifd)?;
    if count >= 500 {
        return None;
    }
    for e in 0..count {
        let o = ifd + 2 + e * 12;
        if u16_at(o) == Some(0x0112) {
            return u16_at(o + 8).map(|v| v as u16);
        }
    }
    None
}

pub fn make_orientation_segment(o: u8) -> Vec<u8> {
    vec![
        0xFF, 0xE1, 0x00, 0x22, // APP1, length 34
        0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
        0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF header
        0x00, 0x01, // one IFD entry
        0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, // tag 0x0112, SHORT, count 1
        0x00, o, 0x00, 0x00, // value
        0x00, 0x00, 0x00, 0x00, // no next IFD
    ]
}

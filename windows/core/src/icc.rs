//! ICC colour-profile extraction (so re-encoded files keep their colours) and a readable profile name.

use crate::engine::{self, ImageKind, MetaCategory, Piece};
use std::io::Read;

/// Pulls the embedded ICC profile out of a JPEG / PNG / WebP file, if any.
pub fn extract(b: &[u8], kind: ImageKind, pieces: &[Piece]) -> Option<Vec<u8>> {
    match kind {
        ImageKind::Jpeg => {
            // A profile larger than 64 KB is split over several APP2 segments, numbered 1..=n.
            let mut chunks: Vec<(u8, Vec<u8>)> = Vec::new();
            for p in pieces.iter().filter(|p| p.category == Some(MetaCategory::Icc)) {
                let payload = p.start + 4;
                if engine::has(b, payload, "ICC_PROFILE\0") && p.end >= payload + 14 {
                    chunks.push((b[payload + 12], b[payload + 14..p.end].to_vec()));
                }
            }
            if chunks.is_empty() {
                return None;
            }
            chunks.sort_by_key(|c| c.0);
            Some(chunks.into_iter().flat_map(|c| c.1).collect())
        }
        ImageKind::Png => {
            let p = pieces.iter().find(|p| p.label.starts_with("iCCP"))?;
            let data = &b[p.start + 8..p.end - 4];
            let name_end = data.iter().position(|&x| x == 0)?;
            // name\0 compression-method(1) compressed-profile
            let compressed = data.get(name_end + 2..)?;
            let mut out = Vec::new();
            flate2::read::ZlibDecoder::new(compressed).read_to_end(&mut out).ok()?;
            Some(out)
        }
        ImageKind::Webp => {
            let p = pieces.iter().find(|p| p.label.starts_with("ICCP"))?;
            let size = engine::le32(b, p.start + 4);
            Some(b[p.start + 8..p.start + 8 + size].to_vec())
        }
        _ => None,
    }
}

/// The profile's human-readable description, e.g. "sRGB IEC61966-2.1" or "Display P3".
pub fn description(profile: &[u8]) -> Option<String> {
    if profile.len() < 132 {
        return None;
    }
    let count = engine::be32(profile, 128);
    for i in 0..count.min(200) {
        let e = 132 + i * 12;
        if e + 12 > profile.len() {
            return None;
        }
        if &profile[e..e + 4] != b"desc" {
            continue;
        }
        let off = engine::be32(profile, e + 4);
        let size = engine::be32(profile, e + 8);
        let tag = profile.get(off..off.checked_add(size)?)?;
        return match tag.get(0..4)? {
            b"desc" => {
                // v2: type(4) reserved(4) count(4) ascii...
                let n = engine::be32(tag, 8);
                let text = tag.get(12..12 + n)?;
                let text = text.split(|&c| c == 0).next()?;
                Some(String::from_utf8_lossy(text).into_owned())
            }
            b"mluc" => {
                // v4: type(4) reserved(4) records(4) recordSize(4) [lang(2) country(2) len(4) offset(4)]...
                let records = engine::be32(tag, 8);
                if records == 0 {
                    return None;
                }
                let len = engine::be32(tag, 20);
                let o = engine::be32(tag, 24);
                let raw = tag.get(o..o + len)?;
                let units: Vec<u16> = raw.chunks_exact(2).map(|c| u16::from_be_bytes([c[0], c[1]])).collect();
                Some(String::from_utf16_lossy(&units).trim_matches('\0').to_string())
            }
            _ => None,
        };
    }
    None
}

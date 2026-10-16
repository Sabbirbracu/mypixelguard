//! Inserting metadata blocks (EXIF, colour profile) into freshly encoded JPEG / PNG / WebP files.

use crate::engine;

/// APP1 segment holding `tiff` (the raw TIFF structure of an EXIF block). `None` if it can't fit.
pub fn exif_segment(tiff: &[u8]) -> Option<Vec<u8>> {
    let len = 2 + 6 + tiff.len();
    if len > 0xFFFF {
        return None;
    }
    let mut v = vec![0xFF, 0xE1, (len >> 8) as u8, (len & 0xFF) as u8];
    v.extend_from_slice(b"Exif\0\0");
    v.extend_from_slice(tiff);
    Some(v)
}

/// Inserts `segments` right after SOI (and after the JFIF header when there is one).
pub fn jpeg_insert(jpeg: &[u8], segments: &[Vec<u8>]) -> Vec<u8> {
    if jpeg.len() < 4 || jpeg[0] != 0xFF || jpeg[1] != 0xD8 {
        return jpeg.to_vec();
    }
    let mut at = 2;
    if jpeg.len() > 6 && jpeg[2] == 0xFF && jpeg[3] == 0xE0 {
        let len = ((jpeg[4] as usize) << 8) | jpeg[5] as usize;
        at = (2 + 2 + len).min(jpeg.len());
    }
    let mut out = Vec::with_capacity(jpeg.len() + segments.iter().map(Vec::len).sum::<usize>());
    out.extend_from_slice(&jpeg[..at]);
    for s in segments {
        out.extend_from_slice(s);
    }
    out.extend_from_slice(&jpeg[at..]);
    out
}

pub fn png_chunk(ty: &[u8; 4], data: &[u8]) -> Vec<u8> {
    let mut v = Vec::with_capacity(12 + data.len());
    v.extend_from_slice(&(data.len() as u32).to_be_bytes());
    v.extend_from_slice(ty);
    v.extend_from_slice(data);
    let mut crc = flate2::Crc::new();
    crc.update(ty);
    crc.update(data);
    v.extend_from_slice(&crc.sum().to_be_bytes());
    v
}

/// Inserts a chunk before the first IDAT chunk.
pub fn png_insert_before_idat(png: &[u8], chunk: &[u8]) -> Vec<u8> {
    let mut i = 8;
    while i + 12 <= png.len() {
        let len = engine::be32(png, i);
        if &png[i + 4..i + 8] == b"IDAT" {
            let mut out = Vec::with_capacity(png.len() + chunk.len());
            out.extend_from_slice(&png[..i]);
            out.extend_from_slice(chunk);
            out.extend_from_slice(&png[i..]);
            return out;
        }
        i += 12 + len;
    }
    png.to_vec()
}

fn riff_chunk(ty: &[u8; 4], data: &[u8]) -> Vec<u8> {
    let mut v = Vec::with_capacity(8 + data.len() + 1);
    v.extend_from_slice(ty);
    v.extend_from_slice(&(data.len() as u32).to_le_bytes());
    v.extend_from_slice(data);
    if data.len() % 2 == 1 {
        v.push(0);
    }
    v
}

/// Adds an ICC profile and/or EXIF block to a WebP file, converting a simple file to the extended
/// (VP8X) layout when needed. Existing ICCP / EXIF chunks are replaced.
pub fn webp_add_metadata(webp: &[u8], width: u32, height: u32, has_alpha: bool, icc: Option<&[u8]>, exif: Option<&[u8]>) -> Vec<u8> {
    if webp.len() < 20 || &webp[0..4] != b"RIFF" || &webp[8..12] != b"WEBP" || (icc.is_none() && exif.is_none()) {
        return webp.to_vec();
    }
    // Split into top-level chunks.
    let mut chunks: Vec<([u8; 4], Vec<u8>)> = Vec::new();
    let mut i = 12;
    while i + 8 <= webp.len() {
        let ty: [u8; 4] = webp[i..i + 4].try_into().unwrap();
        let size = engine::le32(webp, i + 4);
        if i + 8 + size > webp.len() {
            break;
        }
        chunks.push((ty, webp[i + 8..i + 8 + size].to_vec()));
        i += 8 + size + (size % 2);
    }
    let mut flags = 0u8;
    let (mut w, mut h) = (width, height);
    if let Some((_, d)) = chunks.iter().find(|(t, _)| t == b"VP8X") {
        if d.len() >= 10 {
            flags = d[0];
            w = 1 + (d[4] as u32 | (d[5] as u32) << 8 | (d[6] as u32) << 16);
            h = 1 + (d[7] as u32 | (d[8] as u32) << 8 | (d[9] as u32) << 16);
        }
    } else if has_alpha {
        flags |= 0x10;
    }
    chunks.retain(|(t, _)| t != b"VP8X" && t != b"ICCP" && t != b"EXIF");
    flags &= !(0x20 | 0x08);
    if icc.is_some() {
        flags |= 0x20;
    }
    if exif.is_some() {
        flags |= 0x08;
    }

    let mut body: Vec<u8> = Vec::new();
    let mut vp8x = vec![flags, 0, 0, 0];
    vp8x.extend_from_slice(&(w - 1).to_le_bytes()[..3]);
    vp8x.extend_from_slice(&(h - 1).to_le_bytes()[..3]);
    body.extend(riff_chunk(b"VP8X", &vp8x));
    if let Some(p) = icc {
        body.extend(riff_chunk(b"ICCP", p));
    }
    for (t, d) in &chunks {
        body.extend(riff_chunk(t, d));
    }
    if let Some(e) = exif {
        body.extend(riff_chunk(b"EXIF", e));
    }
    let mut out = Vec::with_capacity(12 + body.len());
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&((body.len() + 4) as u32).to_le_bytes());
    out.extend_from_slice(b"WEBP");
    out.extend(body);
    out
}

/// The raw TIFF block of a file's EXIF metadata (without any "Exif\0\0" prefix).
pub fn extract_exif(b: &[u8], pieces: &[engine::Piece]) -> Option<Vec<u8>> {
    use engine::MetaCategory;
    let p = pieces
        .iter()
        .find(|p| p.category == Some(MetaCategory::Exif) && (p.label == "APP1 · EXIF" || p.label.starts_with("eXIf") || p.label == "EXIF"))?;
    let tiff = if p.label.starts_with("APP1") {
        b.get(p.start + 10..p.end)?
    } else if p.label.starts_with("eXIf") {
        b.get(p.start + 8..p.end - 4)?
    } else {
        let size = engine::le32(b, p.start + 4);
        let d = b.get(p.start + 8..p.start + 8 + size)?;
        d.strip_prefix(b"Exif\0\0").unwrap_or(d)
    };
    (tiff.len() > 8).then(|| tiff.to_vec())
}

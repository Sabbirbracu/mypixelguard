//! Removes chosen private fields (location, device, dates, author, software) while keeping everything
//! else. Unlike the macOS version this edits the metadata blocks in place, so pixels are never re-encoded
//! and a JPEG stays bit-identical apart from the removed bytes.

use std::collections::HashSet;
use std::path::Path;

use crate::analyzer::iim_name;
use crate::codec::{self, EncodeOptions, OutputFormat, ProcessedImage};
use crate::container;
use crate::engine::{self, ImageKind, MetaCategory};
use crate::error::{CoreError, CoreResult, Note};
use crate::tiff::{self, PrivateField};

fn norm(key: &str) -> String {
    key.to_lowercase().chars().filter(|c| c.is_alphanumeric()).collect()
}

fn any_matches(fields: &[PrivateField], key: &str) -> bool {
    let k = norm(key);
    fields.iter().any(|f| f.matches_key(&k))
}

pub fn process(path: &Path, fields: &HashSet<PrivateField>) -> CoreResult<ProcessedImage> {
    let b = codec::read_file(path)?;
    let kind = engine::detect(&b);
    let mut list: Vec<PrivateField> = PrivateField::ALL.iter().copied().filter(|f| fields.contains(f)).collect();
    list.dedup();

    let data = match kind {
        ImageKind::Jpeg => jpeg(&b, &list)?,
        ImageKind::Png => png(&b, &list)?,
        ImageKind::Webp => webp(&b, &list)?,
        _ => {
            // TIFF and friends: no block-level editing, so re-save the pixels without any metadata.
            let info = codec::info_from_bytes(&b)?;
            if info.format != Some(OutputFormat::Tiff) {
                return Err(CoreError::unsupported("err.selectiveUnsupported"));
            }
            let loaded = codec::load_from_bytes(&b, None)?;
            codec::encode(&loaded, &EncodeOptions::new(OutputFormat::Tiff))?
        }
    };

    let info = codec::info_from_bytes(&data)?;
    let names: Vec<String> = list.iter().map(|f| format!("t:privacy.field.{}", field_id(*f))).collect();
    Ok(ProcessedImage {
        format: info.format.unwrap_or(OutputFormat::Jpeg),
        width: info.width,
        height: info.height,
        notes: vec![Note::with("selective.note", [names.join(", ")])],
        expect_metadata_clean: Some(list.len() == PrivateField::ALL.len()),
        data,
    })
}

fn field_id(f: PrivateField) -> &'static str {
    match f {
        PrivateField::Location => "location",
        PrivateField::Device => "device",
        PrivateField::Dates => "dates",
        PrivateField::Author => "author",
        PrivateField::Software => "software",
    }
}

fn segment(marker: u8, payload: &[u8]) -> Option<Vec<u8>> {
    let len = payload.len() + 2;
    if len > 0xFFFF {
        return None;
    }
    let mut v = vec![0xFF, marker, (len >> 8) as u8, (len & 0xFF) as u8];
    v.extend_from_slice(payload);
    Some(v)
}

// MARK: JPEG

fn jpeg(b: &[u8], fields: &[PrivateField]) -> CoreResult<Vec<u8>> {
    let pieces = engine::parse(b, ImageKind::Jpeg)?;
    let mut out = Vec::with_capacity(b.len());
    for p in &pieces {
        let raw = &b[p.start..p.end];
        match p.label.as_str() {
            "APP1 · EXIF" => {
                // An EXIF block we can't understand is dropped rather than left behind with private data in it.
                if let Some(seg) = tiff::remove_fields(&b[p.start + 10..p.end], fields).and_then(|t| container::exif_segment(&t)) {
                    out.extend(seg);
                }
            }
            "APP1 · XMP" => {
                let text = String::from_utf8_lossy(&b[p.start + 4 + 29..p.end]).into_owned();
                let filtered = filter_xmp(&text, fields);
                let mut payload = b"http://ns.adobe.com/xap/1.0/\0".to_vec();
                payload.extend_from_slice(filtered.as_bytes());
                match segment(0xE1, &payload) {
                    Some(s) => out.extend(s),
                    None => out.extend_from_slice(raw),
                }
            }
            "APP13 · Photoshop / IPTC" => {
                let payload = filter_photoshop(&b[p.start + 4..p.end], fields);
                match segment(0xED, &payload) {
                    Some(s) => out.extend(s),
                    None => out.extend_from_slice(raw),
                }
            }
            _ => out.extend_from_slice(raw),
        }
    }
    Ok(out)
}

/// Rebuilds a Photoshop "8BIM" payload with the chosen IPTC datasets removed.
fn filter_photoshop(payload: &[u8], fields: &[PrivateField]) -> Vec<u8> {
    if !payload.starts_with(b"Photoshop 3.0\0") {
        return payload.to_vec();
    }
    let mut out = b"Photoshop 3.0\0".to_vec();
    let mut i = 14;
    while i + 12 <= payload.len() && &payload[i..i + 4] == b"8BIM" {
        let id = u16::from_be_bytes([payload[i + 4], payload[i + 5]]);
        let name_len = payload[i + 6] as usize;
        let mut o = i + 7 + name_len;
        if (1 + name_len) % 2 == 1 {
            o += 1;
        }
        if o + 4 > payload.len() {
            break;
        }
        let size = engine::be32(payload, o);
        let data_start = o + 4;
        let data_end = (data_start + size).min(payload.len());
        let resource_end = data_start + size + (size % 2);
        if id == 0x0404 {
            let kept = filter_iim(&payload[data_start..data_end], fields);
            out.extend_from_slice(&payload[i..o]);
            out.extend_from_slice(&(kept.len() as u32).to_be_bytes());
            out.extend_from_slice(&kept);
            if kept.len() % 2 == 1 {
                out.push(0);
            }
        } else {
            out.extend_from_slice(&payload[i..resource_end.min(payload.len())]);
        }
        i = resource_end;
    }
    out
}

fn filter_iim(d: &[u8], fields: &[PrivateField]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut i = 0;
    while i + 5 <= d.len() && d[i] == 0x1C {
        let size = ((d[i + 3] as usize) << 8) | d[i + 4] as usize;
        let end = i + 5 + size;
        if end > d.len() {
            break;
        }
        let drop = iim_name(d[i + 1], d[i + 2]).is_some_and(|n| any_matches(fields, n));
        if !drop {
            out.extend_from_slice(&d[i..end]);
        }
        i = end;
    }
    out
}

// MARK: XMP

/// Removes XMP properties (attributes and elements) that belong to the chosen fields.
pub fn filter_xmp(xmp: &str, fields: &[PrivateField]) -> String {
    use std::sync::LazyLock;
    static ATTR: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r#"\s+([A-Za-z0-9]+):([A-Za-z0-9_]+)\s*=\s*("[^"]*"|'[^']*')"#).unwrap());
    static OPEN: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r"<([A-Za-z0-9]+):([A-Za-z0-9_]+)\b[^>]*>").unwrap());

    // Attributes first (they live on rdf:Description). Namespace declarations (xmlns:…) are kept.
    let step1 = ATTR.replace_all(xmp, |c: &regex::Captures| {
        if &c[1] == "xmlns" || &c[1] == "rdf" || &c[1] == "x" || !any_matches(fields, &c[2]) {
            c[0].to_string()
        } else {
            String::new()
        }
    });

    // Then elements, matched with their closing tag.
    let text = step1.into_owned();
    let mut out = String::with_capacity(text.len());
    let mut pos = 0;
    while let Some(m) = OPEN.find_at(&text, pos) {
        let caps = OPEN.captures(&text[m.start()..]).unwrap();
        let (prefix, name) = (&caps[1], &caps[2]);
        out.push_str(&text[pos..m.start()]);
        if matches!(prefix, "rdf" | "x") || !any_matches(fields, name) {
            out.push_str(m.as_str());
            pos = m.end();
            continue;
        }
        if m.as_str().ends_with("/>") {
            pos = m.end();
        } else {
            let close = format!("</{prefix}:{name}>");
            match text[m.end()..].find(&close) {
                Some(rel) => pos = m.end() + rel + close.len(),
                None => {
                    out.push_str(m.as_str());
                    pos = m.end();
                }
            }
        }
    }
    out.push_str(&text[pos..]);
    out
}

// MARK: PNG

fn png(b: &[u8], fields: &[PrivateField]) -> CoreResult<Vec<u8>> {
    let pieces = engine::parse(b, ImageKind::Png)?;
    let mut out = Vec::with_capacity(b.len());
    for p in &pieces {
        let raw = &b[p.start..p.end];
        let ty = p.label.get(..4).unwrap_or("");
        match (ty, p.category) {
            ("eXIf", _) => {
                if let Some(t) = tiff::remove_fields(&b[p.start + 8..p.end - 4], fields) {
                    out.extend(container::png_chunk(b"eXIf", &t));
                }
            }
            ("tIME", _) => {
                if !fields.contains(&PrivateField::Dates) {
                    out.extend_from_slice(raw);
                }
            }
            ("tEXt" | "zTXt" | "iTXt", Some(cat)) => {
                let data = &b[p.start + 8..p.end - 4];
                let nul = data.iter().position(|&c| c == 0).unwrap_or(data.len());
                let keyword = String::from_utf8_lossy(&data[..nul]).into_owned();
                let lower = keyword.to_lowercase();
                if keyword == "XML:com.adobe.xmp" {
                    // iTXt: flag, method, language\0, translated keyword\0, text
                    let rest = data.get(nul + 1..).unwrap_or(&[]);
                    let compressed = rest.first().copied().unwrap_or(0) == 1;
                    let mut parts = rest.get(2..).unwrap_or(&[]).splitn(3, |&c| c == 0);
                    let (_, _, body) = (parts.next(), parts.next(), parts.next().unwrap_or(&[]));
                    let text = if compressed {
                        use std::io::Read;
                        let mut v = Vec::new();
                        flate2::read::ZlibDecoder::new(body).read_to_end(&mut v).ok();
                        String::from_utf8_lossy(&v).into_owned()
                    } else {
                        String::from_utf8_lossy(body).into_owned()
                    };
                    let mut d = b"XML:com.adobe.xmp\0\0\0\0\0".to_vec();
                    d.extend_from_slice(filter_xmp(&text, fields).as_bytes());
                    out.extend(container::png_chunk(b"iTXt", &d));
                } else if cat == MetaCategory::Other && !(lower.contains("raw profile") || lower.contains("exif") || lower.contains("iptc")) {
                    // Free-text chunks are removed only when their keyword names a chosen field.
                    if !any_matches(fields, &keyword) {
                        out.extend_from_slice(raw);
                    }
                }
                // Raw EXIF/IPTC profiles (ImageMagick style) can't be edited field by field: removed.
            }
            _ => out.extend_from_slice(raw),
        }
    }
    Ok(out)
}

// MARK: WebP

fn webp(b: &[u8], fields: &[PrivateField]) -> CoreResult<Vec<u8>> {
    let pieces = engine::parse(b, ImageKind::Webp)?;
    let mut body: Vec<u8> = Vec::new();
    let mut has_exif = false;
    let mut has_xmp = false;
    let chunk = |ty: &[u8; 4], data: &[u8]| -> Vec<u8> {
        let mut v = ty.to_vec();
        v.extend_from_slice(&(data.len() as u32).to_le_bytes());
        v.extend_from_slice(data);
        if data.len() % 2 == 1 {
            v.push(0);
        }
        v
    };
    for p in pieces.iter().skip(1) {
        let raw = &b[p.start..p.end];
        match p.label.as_str() {
            "EXIF" => {
                let size = engine::le32(b, p.start + 4);
                let d = &b[p.start + 8..p.start + 8 + size];
                let t = d.strip_prefix(b"Exif\0\0").unwrap_or(d);
                if let Some(t) = tiff::remove_fields(t, fields) {
                    has_exif = true;
                    body.extend(chunk(b"EXIF", &t));
                }
            }
            "XMP" => {
                let size = engine::le32(b, p.start + 4);
                let text = String::from_utf8_lossy(&b[p.start + 8..p.start + 8 + size]).into_owned();
                has_xmp = true;
                body.extend(chunk(b"XMP ", filter_xmp(&text, fields).as_bytes()));
            }
            _ => body.extend_from_slice(raw),
        }
    }
    let mut out = b"RIFF\0\0\0\0WEBP".to_vec();
    out.extend(body);
    let total = (out.len() - 8) as u32;
    out[4..8].copy_from_slice(&total.to_le_bytes());
    if engine::has(&out, 12, "VP8X") && out.len() > 20 {
        let mut flags = out[20];
        flags &= !(0x08 | 0x04);
        if has_exif {
            flags |= 0x08;
        }
        if has_xmp {
            flags |= 0x04;
        }
        out[20] = flags;
    }
    Ok(out)
}

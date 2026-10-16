//! Finds AI-provenance markers and private metadata. Port of `Analyzer.swift`; the readable metadata
//! groups come from our own EXIF / XMP / IPTC / PNG-text readers instead of Apple's ImageIO.

use std::collections::HashSet;
use std::io::{Cursor, Read};
use std::path::Path;
use std::sync::LazyLock;

use regex::Regex;
use serde::Serialize;

use crate::engine::{self, ImageKind, MetaCategory, Piece, Severity};
use crate::error::{CoreError, CoreResult};
use crate::icc;

#[derive(Clone, Debug, Serialize)]
pub struct Indicator {
    pub severity: Severity,
    pub title: String,
    pub detail: String,
    pub source: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct MetaItem {
    pub key: String,
    pub value: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct MetaGroup {
    pub title: String,
    pub items: Vec<MetaItem>,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PrivacyFactKind {
    Location,
    Device,
    Captured,
    Author,
    Software,
    Orientation,
    Dimensions,
}

#[derive(Clone, Debug, Serialize)]
pub struct PrivacyFact {
    pub kind: PrivacyFactKind,
    pub value: String,
    /// When set, the UI shows this translation instead of `value`.
    pub value_key: Option<String>,
    pub severity: Severity,
    pub source: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct Analysis {
    pub kind: ImageKind,
    pub file_size: usize,
    pub width: u32,
    pub height: u32,
    pub has_alpha: bool,
    pub pieces: Vec<Piece>,
    pub indicators: Vec<Indicator>,
    pub privacy_facts: Vec<PrivacyFact>,
    pub groups: Vec<MetaGroup>,
    pub raw_xmp: Option<String>,
    pub has_provenance: bool,
    pub ai_risk: Option<Severity>,
    pub privacy_risk: Option<Severity>,
    pub risk: Option<Severity>,
}

impl Analysis {
    pub fn bytes_in(&self, category: MetaCategory) -> usize {
        self.pieces.iter().filter(|p| p.category == Some(category)).map(Piece::size).sum()
    }

    /// Metadata blocks other than the colour profile.
    pub fn metadata_pieces(&self) -> Vec<Piece> {
        self.pieces
            .iter()
            .filter(|p| p.category.is_some() && p.category != Some(MetaCategory::Icc))
            .cloned()
            .collect()
    }
}

pub fn byte_string(n: usize) -> String {
    let n = n as f64;
    if n < 1000.0 {
        format!("{} bytes", n as usize)
    } else if n < 1_000_000.0 {
        format!("{} KB", (n / 1000.0).round() as usize)
    } else if n < 1_000_000_000.0 {
        trim_decimal(n / 1_000_000.0, "MB")
    } else {
        trim_decimal(n / 1_000_000_000.0, "GB")
    }
}

fn trim_decimal(v: f64, unit: &str) -> String {
    let s = format!("{v:.1}");
    format!("{} {unit}", s.strip_suffix(".0").unwrap_or(&s))
}

// MARK: Entry point

pub fn analyze(path: &Path) -> CoreResult<Analysis> {
    let data = std::fs::read(path).map_err(|_| CoreError::unreadable())?;
    analyze_bytes(&data)
}

pub fn analyze_bytes(b: &[u8]) -> CoreResult<Analysis> {
    let kind = engine::detect(b);
    let pieces = engine::parse(b, kind)?;

    let mut indicators: Vec<Indicator> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut add = |list: Vec<Indicator>, indicators: &mut Vec<Indicator>| {
        for i in list {
            if seen.insert(format!("{}|{}", i.title, i.source)) {
                indicators.push(i);
            }
        }
    };

    if pieces.is_empty() {
        // HEIC, TIFF, GIF … : no block-level parsing, so look through the start of the file.
        let head = engine::latin1(&b[..b.len().min(8_000_000)]);
        add(scan(&head, "File"), &mut indicators);
        let lower = head.to_ascii_lowercase();
        if lower.contains("c2pa") && lower.contains("jumb") {
            indicators.insert(
                0,
                Indicator {
                    severity: Severity::Medium,
                    title: "C2PA Content Credentials found".into(),
                    detail: "Signed provenance manifest embedded in the file.".into(),
                    source: "File".into(),
                },
            );
        }
    } else {
        let c2pa: Vec<&Piece> = pieces.iter().filter(|p| p.category == Some(MetaCategory::C2pa)).collect();
        if !c2pa.is_empty() {
            let text: String = c2pa.iter().map(|p| engine::latin1(&b[p.start..p.end.min(p.start + 2_000_000)])).collect();
            let hints = scan(&text, "C2PA manifest");
            static ACTIONS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)c2pa\.[a-z_]+").unwrap());
            let mut actions: Vec<String> = Vec::new();
            for m in ACTIONS.find_iter(&text) {
                if !actions.iter().any(|a| a.eq_ignore_ascii_case(m.as_str())) {
                    actions.push(m.as_str().to_string());
                }
            }
            actions.truncate(6);
            let mut detail = String::from(
                "Signed provenance manifest. Facebook and Instagram read it to decide on an “AI info” label.",
            );
            if !actions.is_empty() {
                detail.push_str(&format!(" Actions: {}.", actions.join(", ")));
            }
            let size: usize = c2pa.iter().map(|p| p.size()).sum();
            let sev = if hints.iter().any(|h| h.severity == Severity::High) { Severity::High } else { Severity::Medium };
            add(
                vec![Indicator {
                    severity: sev,
                    title: format!("C2PA Content Credentials found ({})", byte_string(size)),
                    detail,
                    source: "C2PA manifest".into(),
                }],
                &mut indicators,
            );
            add(hints, &mut indicators);
        }
        for p in &pieces {
            if p.category.is_some() && p.category != Some(MetaCategory::Icc) && p.category != Some(MetaCategory::C2pa) {
                let text = engine::latin1(&b[p.start..p.end.min(p.start + 2_000_000)]);
                add(scan(&text, &p.label), &mut indicators);
            }
        }
    }
    // Stable sort, highest severity first.
    indicators.sort_by(|a, b| b.severity.cmp(&a.severity));

    let probe = probe(b);
    let icc_profile = icc::extract(b, kind, &pieces);
    let mut groups = readable_groups(b, kind, &pieces, &probe, icc_profile.as_deref());
    if !pieces.is_empty() {
        let blocks: Vec<MetaItem> = pieces
            .iter()
            .filter(|p| p.category.is_some())
            .map(|p| MetaItem {
                key: p.label.clone(),
                value: format!("{}  ·  {}", byte_string(p.size()), p.category.map(|c| c.title()).unwrap_or("")),
            })
            .collect();
        if !blocks.is_empty() {
            groups.push(MetaGroup { title: "Embedded blocks in the file".into(), items: blocks });
        }
    }

    let privacy_facts = privacy_facts(&groups, probe.width, probe.height);
    let ai_risk = indicators.iter().map(|i| i.severity).max();
    let privacy_risk = privacy_facts.iter().map(|f| f.severity).max();
    let risk = ai_risk.into_iter().chain(privacy_risk).max();
    let has_provenance = pieces.iter().any(|p| p.category == Some(MetaCategory::C2pa))
        || indicators.iter().any(|i| i.title.starts_with("C2PA"));

    Ok(Analysis {
        kind,
        file_size: b.len(),
        width: probe.width,
        height: probe.height,
        has_alpha: probe.has_alpha,
        raw_xmp: extract_xmp(b, &pieces),
        pieces,
        indicators,
        privacy_facts,
        groups,
        has_provenance,
        ai_risk,
        privacy_risk,
        risk,
    })
}

// MARK: AI-marker detection

const AI_VALUES: [&str; 4] =
    ["trainedalgorithmicmedia", "compositewithtrainedalgorithmicmedia", "algorithmicmedia", "compositesynthetic"];

const AI_KEYWORDS: &[&str] = &[
    "adobe firefly", "firefly", "dall-e", "dall·e", "dalle", "midjourney", "stable diffusion", "stablediffusion",
    "openai", "chatgpt", "gpt-image", "imagen", "gemini", "made with ai", "ai generated", "ai-generated",
    "generative ai", "generative fill", "generative expand", "generated by ai", "synthid", "sdxl", "comfyui",
    "automatic1111", "novelai", "leonardo.ai", "ideogram", "black forest labs", "bing image creator",
    "microsoft designer", "meta ai", "imagine with meta", "runwayml", "stability ai",
];

static SOURCE_TYPE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)(compositeWithTrainedAlgorithmicMedia|compositeSynthetic|trainedAlgorithmicMedia|algorithmicMedia|algorithmicallyEnhanced|digitalCapture|minorHumanEdits|humanEdits|digitalArt|virtualRecording|screenCapture|composite|softwareImage|dataDrivenMedia)",
    )
    .unwrap()
});

/// Whole-word, case-insensitive keyword matches in order of appearance (the `regex` crate has no
/// look-around, so the word boundary check is done by hand).
fn keyword_matches(text: &str) -> Vec<String> {
    let lower = text.to_ascii_lowercase();
    let lb = lower.as_bytes();
    let is_word = |c: u8| c.is_ascii_lowercase() || c.is_ascii_digit();
    let mut spans: Vec<(usize, usize)> = Vec::new();
    for kw in AI_KEYWORDS.iter() {
        let kw = kw.to_ascii_lowercase();
        for (start, _) in lower.match_indices(&kw) {
            let end = start + kw.len();
            let before_ok = start == 0 || !is_word(lb[start - 1]);
            let after_ok = end >= lb.len() || !is_word(lb[end]);
            if before_ok && after_ok {
                spans.push((start, end));
            }
        }
    }
    // Earliest first; at the same position the longest keyword wins.
    spans.sort_by(|a, b| a.0.cmp(&b.0).then(b.1.cmp(&a.1)));
    let mut out = Vec::new();
    let mut last_end = 0;
    for (s, e) in spans {
        if s >= last_end {
            out.push(text[s..e].to_string());
            last_end = e;
        }
    }
    out
}

pub fn scan(text: &str, source: &str) -> Vec<Indicator> {
    let mut out = Vec::new();
    let lower = text.to_ascii_lowercase();

    if lower.contains("digitalsourcetype") {
        let mut seen = HashSet::new();
        for m in SOURCE_TYPE.find_iter(text) {
            let v = m.as_str();
            if !seen.insert(v.to_lowercase()) {
                continue;
            }
            if AI_VALUES.contains(&v.to_lowercase().as_str()) {
                out.push(Indicator {
                    severity: Severity::High,
                    title: format!("Tagged as AI-generated (DigitalSourceType: {v})"),
                    detail: "Facebook reads this IPTC tag to show an “AI info” label.".into(),
                    source: source.into(),
                });
            } else {
                out.push(Indicator {
                    severity: Severity::Info,
                    title: format!("DigitalSourceType: {v}"),
                    detail: "Declares how the image was made. Not an AI value.".into(),
                    source: source.into(),
                });
            }
        }
    }

    let mut seen = HashSet::new();
    for k in keyword_matches(text) {
        if seen.insert(k.to_lowercase()) {
            out.push(Indicator {
                severity: Severity::High,
                title: format!("Mentions “{k}”"),
                detail: "AI tools and editors leave their name in the file’s metadata.".into(),
                source: source.into(),
            });
        }
    }

    if lower.contains("steps:") && lower.contains("sampler") {
        out.push(Indicator {
            severity: Severity::High,
            title: "Stable Diffusion generation settings".into(),
            detail: "Prompt, seed, model and sampler are stored in this file.".into(),
            source: source.into(),
        });
    }
    if lower.contains("\"class_type\"") {
        out.push(Indicator {
            severity: Severity::High,
            title: "ComfyUI workflow".into(),
            detail: "The full generation graph is stored in this file.".into(),
            source: source.into(),
        });
    }
    out
}

// MARK: XMP

fn extract_xmp(b: &[u8], pieces: &[Piece]) -> Option<String> {
    let ranges: Vec<(usize, usize)> = if pieces.is_empty() {
        vec![(0, b.len().min(8_000_000))]
    } else {
        pieces.iter().filter(|p| p.category == Some(MetaCategory::Xmp)).map(|p| (p.start, p.end)).collect()
    };
    for (s, e) in ranges {
        let slice = &b[s..e];
        let Some(start) = engine::find(slice, "<x:xmpmeta").or_else(|| engine::find(slice, "<?xpacket")) else {
            continue;
        };
        let mut end = slice.len();
        while end > start && matches!(slice[end - 1], 0x00 | 0x20 | 0x0A | 0x0D | 0x09) {
            end -= 1;
        }
        let text = String::from_utf8_lossy(&slice[start..end]).into_owned();
        return Some(if text.chars().count() > 60_000 {
            let cut: String = text.chars().take(60_000).collect();
            format!("{cut}\n… (truncated)")
        } else {
            text
        });
    }
    None
}

/// Properties of the XMP packet, grouped by namespace prefix: [(prefix, [(name, value)])].
fn xmp_properties(xmp: &str) -> Vec<(String, Vec<MetaItem>)> {
    use quick_xml::events::Event;
    let mut reader = quick_xml::Reader::from_str(xmp);
    let mut out: Vec<(String, Vec<MetaItem>)> = Vec::new();
    let skip_prefixes = ["tiff", "exif", "exifEX", "aux", "rdf", "x", "xml", "xmlns"];

    let mut push = |prefix: &str, name: &str, value: String| {
        if skip_prefixes.contains(&prefix) || value.trim().is_empty() {
            return;
        }
        match out.iter_mut().find(|(p, _)| p == prefix) {
            Some((_, items)) => items.push(MetaItem { key: name.to_string(), value }),
            None => out.push((prefix.to_string(), vec![MetaItem { key: name.to_string(), value }])),
        }
    };

    // Stack of property elements currently open (prefix, name, collected text values).
    let mut stack: Vec<(String, String, Vec<String>)> = Vec::new();
    let mut in_li = false;
    let mut li_text = String::new();
    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => {
                let full = e.name().as_ref().to_string();
                let (prefix, name) = full.split_once(':').unwrap_or(("", full.as_str()));
                if full == "rdf:li" {
                    in_li = true;
                    li_text.clear();
                } else if full == "rdf:Description" {
                    for a in e.attributes().flatten() {
                        let key = a.key.as_ref().to_string();
                        if let Some((p, n)) = key.split_once(':') {
                            let value = a.normalized_value(quick_xml::XmlVersion::Implicit1_0).map(|v| v.into_owned()).unwrap_or_default();
                            push(p, n, value);
                        }
                    }
                } else if !matches!(prefix, "rdf" | "x" | "") {
                    stack.push((prefix.to_string(), name.to_string(), Vec::new()));
                }
            }
            Ok(Event::Empty(e)) => {
                let full = e.name().as_ref().to_string();
                if full == "rdf:Description" {
                    for a in e.attributes().flatten() {
                        let key = a.key.as_ref().to_string();
                        if let Some((p, n)) = key.split_once(':') {
                            let value = a.normalized_value(quick_xml::XmlVersion::Implicit1_0).map(|v| v.into_owned()).unwrap_or_default();
                            push(p, n, value);
                        }
                    }
                }
            }
            Ok(Event::Text(t)) => {
                let text = t.xml_content(quick_xml::XmlVersion::Implicit1_0).into_owned();
                if in_li {
                    li_text.push_str(&text);
                } else if let Some(top) = stack.last_mut() {
                    if !text.trim().is_empty() {
                        top.2.push(text.trim().to_string());
                    }
                }
            }
            Ok(Event::End(e)) => {
                let full = e.name().as_ref().to_string();
                if full == "rdf:li" {
                    in_li = false;
                    if let Some(top) = stack.last_mut() {
                        if !li_text.trim().is_empty() {
                            top.2.push(li_text.trim().to_string());
                        }
                    }
                } else if let Some((p, n)) = full.split_once(':') {
                    if !matches!(p, "rdf" | "x") {
                        if let Some(pos) = stack.iter().rposition(|(sp, sn, _)| sp == p && sn == n) {
                            let (sp, sn, values) = stack.remove(pos);
                            push(&sp, &sn, values.join(", "));
                        }
                    }
                }
            }
            Ok(Event::GeneralRef(r)) => {
                let name = r.as_ref().to_string();
                let ch = match name.as_str() {
                    "amp" => Some('&'),
                    "lt" => Some('<'),
                    "gt" => Some('>'),
                    "quot" => Some('"'),
                    "apos" => Some('\''),
                    _ => None,
                };
                if let Some(c) = ch {
                    if in_li {
                        li_text.push(c);
                    } else if let Some(top) = stack.last_mut() {
                        match top.2.last_mut() {
                            Some(last) => last.push(c),
                            None => top.2.push(c.to_string()),
                        }
                    }
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    for (_, items) in out.iter_mut() {
        items.sort_by(|a, b| a.key.cmp(&b.key));
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    out
}

// MARK: Image probe

struct Probe {
    width: u32,
    height: u32,
    has_alpha: bool,
    bit_depth: Option<u32>,
    color_model: Option<&'static str>,
}

fn probe(b: &[u8]) -> Probe {
    use image::{ColorType, ImageDecoder};
    let mut p = Probe { width: 0, height: 0, has_alpha: false, bit_depth: None, color_model: None };
    if let Ok(reader) = image::ImageReader::new(Cursor::new(b)).with_guessed_format() {
        if let Ok(decoder) = reader.into_decoder() {
            let (w, h) = decoder.dimensions();
            p.width = w;
            p.height = h;
            let ct = decoder.color_type();
            p.has_alpha = ct.has_alpha();
            p.bit_depth = Some((ct.bits_per_pixel() / ct.channel_count() as u16) as u32);
            p.color_model = Some(match ct {
                ColorType::L8 | ColorType::L16 | ColorType::La8 | ColorType::La16 => "Gray",
                _ => "RGB",
            });
        }
    }
    p
}

// MARK: Readable metadata groups

fn readable_groups(b: &[u8], kind: ImageKind, pieces: &[Piece], probe: &Probe, icc_profile: Option<&[u8]>) -> Vec<MetaGroup> {
    let mut groups: Vec<MetaGroup> = Vec::new();

    let mut image_items: Vec<MetaItem> = Vec::new();
    let mut item = |k: &str, v: String| image_items.push(MetaItem { key: k.into(), value: v });
    if probe.width > 0 {
        item("Width (px)", probe.width.to_string());
        item("Height (px)", probe.height.to_string());
    }
    if let Some(d) = probe.bit_depth {
        item("Bit depth", d.to_string());
    }
    if let Some(m) = probe.color_model {
        item("Color model", m.into());
    }
    if let Some(name) = icc_profile.and_then(icc::description) {
        item("Color profile", name);
    }
    item("Has transparency", probe.has_alpha.to_string());
    groups.push(MetaGroup { title: "Image".into(), items: image_items });

    // EXIF / TIFF / GPS
    let exif_reader = exif::Reader::new();
    if let Ok(ex) = exif_reader.read_from_container(&mut Cursor::new(b)) {
        let mut tiff = Vec::new();
        let mut exif_items = Vec::new();
        let mut gps = Vec::new();
        let mut interop = Vec::new();
        let mut thumb = Vec::new();
        let mut gps_raw: std::collections::HashMap<String, exif::Value> = Default::default();
        for f in ex.fields() {
            let name = f.tag.to_string();
            let value = match (&f.value, f.tag) {
                // macOS shows the raw numeric orientation; text tags without kamadak's surrounding quotes.
                (v, exif::Tag::Orientation) if v.get_uint(0).is_some() => v.get_uint(0).unwrap().to_string(),
                (exif::Value::Ascii(v), _) => v.iter().map(|s| String::from_utf8_lossy(s).trim().to_string()).collect::<Vec<_>>().join(", "),
                _ => f.display_value().with_unit(&ex).to_string(),
            };
            let mi = MetaItem { key: name.clone(), value };
            if f.ifd_num == exif::In::THUMBNAIL {
                thumb.push(mi);
                continue;
            }
            match f.tag.context() {
                exif::Context::Tiff => tiff.push(mi),
                exif::Context::Exif => exif_items.push(mi),
                exif::Context::Gps => {
                    gps_raw.insert(name.clone(), f.value.clone());
                    gps.push(mi);
                }
                exif::Context::Interop => interop.push(mi),
                _ => exif_items.push(mi),
            }
        }
        let gps = tidy_gps(gps, &gps_raw);
        for (title, mut items) in [
            ("TIFF (camera & software)", tiff),
            ("EXIF", exif_items),
            ("GPS location", gps),
            ("EXIF (interoperability)", interop),
            ("Thumbnail", thumb),
        ] {
            items.sort_by(|a, b| a.key.cmp(&b.key));
            if !items.is_empty() {
                groups.push(MetaGroup { title: title.into(), items });
            }
        }
    }

    // IPTC
    if kind == ImageKind::Jpeg {
        let mut items = Vec::new();
        for p in pieces.iter().filter(|p| p.category == Some(MetaCategory::Iptc)) {
            items.extend(iptc_items(&b[(p.start + 4).min(p.end)..p.end]));
        }
        items.sort_by(|a, b| a.key.cmp(&b.key));
        if !items.is_empty() {
            groups.push(MetaGroup { title: "IPTC".into(), items });
        }
    }

    // JFIF
    if kind == ImageKind::Jpeg {
        if let Some(p) = pieces.iter().find(|p| p.label == "JFIF header") {
            let d = &b[p.start + 4..p.end];
            if d.len() >= 14 && d.starts_with(b"JFIF\0") {
                let units = d[7];
                let xd = u16::from_be_bytes([d[8], d[9]]);
                let yd = u16::from_be_bytes([d[10], d[11]]);
                let unit = match units {
                    1 => " dpi",
                    2 => " dpcm",
                    _ => "",
                };
                groups.push(MetaGroup {
                    title: "JFIF".into(),
                    items: vec![
                        MetaItem { key: "JFIFVersion".into(), value: format!("{}.{:02}", d[5], d[6]) },
                        MetaItem { key: "XDensity".into(), value: format!("{xd}{unit}") },
                        MetaItem { key: "YDensity".into(), value: format!("{yd}{unit}") },
                    ],
                });
            }
        }
    }

    // PNG text
    if kind == ImageKind::Png {
        let items = png_text_items(b, pieces);
        if !items.is_empty() {
            groups.push(MetaGroup { title: "PNG".into(), items });
        }
    }

    // XMP
    if let Some(xmp) = extract_xmp(b, pieces) {
        for (prefix, items) in xmp_properties(&xmp) {
            groups.push(MetaGroup { title: format!("XMP · {prefix}"), items });
        }
    }
    groups
}

/// Replaces the raw degree/minute/second GPS fields by decimal degrees (like macOS shows them).
fn tidy_gps(items: Vec<MetaItem>, raw: &std::collections::HashMap<String, exif::Value>) -> Vec<MetaItem> {
    let decimal = |name: &str| -> Option<f64> {
        match raw.get(name)? {
            exif::Value::Rational(v) if v.len() >= 3 => {
                Some(v[0].to_f64() + v[1].to_f64() / 60.0 + v[2].to_f64() / 3600.0)
            }
            _ => None,
        }
    };
    let ascii = |name: &str| -> Option<String> {
        match raw.get(name)? {
            exif::Value::Ascii(v) => v.first().map(|s| String::from_utf8_lossy(s).trim().to_string()),
            _ => None,
        }
    };
    let mut out: Vec<MetaItem> = Vec::new();
    for it in items {
        let key = match it.key.as_str() {
            "GPSLatitude" | "GPSLongitude" | "GPSLatitudeRef" | "GPSLongitudeRef" => continue,
            k => k.strip_prefix("GPS").unwrap_or(k).to_string(),
        };
        out.push(MetaItem { key, value: it.value });
    }
    if let Some(v) = decimal("GPSLatitude") {
        out.push(MetaItem { key: "Latitude".into(), value: format!("{v:.6}") });
        if let Some(r) = ascii("GPSLatitudeRef") {
            out.push(MetaItem { key: "LatitudeRef".into(), value: r });
        }
    }
    if let Some(v) = decimal("GPSLongitude") {
        out.push(MetaItem { key: "Longitude".into(), value: format!("{v:.6}") });
        if let Some(r) = ascii("GPSLongitudeRef") {
            out.push(MetaItem { key: "LongitudeRef".into(), value: r });
        }
    }
    out
}

fn iptc_items(segment_payload: &[u8]) -> Vec<MetaItem> {
    let mut out = Vec::new();
    let b = segment_payload;
    if !b.starts_with(b"Photoshop 3.0\0") {
        return out;
    }
    let mut i = 14;
    while i + 12 <= b.len() && &b[i..i + 4] == b"8BIM" {
        let id = u16::from_be_bytes([b[i + 4], b[i + 5]]);
        let name_len = b[i + 6] as usize;
        let mut o = i + 7 + name_len;
        if (1 + name_len) % 2 == 1 {
            o += 1;
        }
        if o + 4 > b.len() {
            break;
        }
        let size = engine::be32(b, o);
        let data_start = o + 4;
        let data_end = (data_start + size).min(b.len());
        if id == 0x0404 {
            out.extend(iim_datasets(&b[data_start..data_end]));
        }
        i = data_start + size + (size % 2);
    }
    out
}

/// Name of an IPTC-IIM dataset (record 2 = application record).
pub fn iim_name(record: u8, tag: u8) -> Option<&'static str> {
    if record != 2 {
        return None;
    }
    Some(match tag {
        5 => "ObjectName",
        15 => "Category",
        20 => "SupplementalCategory",
        25 => "Keywords",
        55 => "DateCreated",
        60 => "TimeCreated",
        80 => "By-line",
        85 => "By-lineTitle",
        90 => "City",
        92 => "Sub-location",
        95 => "Province-State",
        101 => "Country-PrimaryLocationName",
        105 => "Headline",
        110 => "Credit",
        115 => "Source",
        116 => "CopyrightNotice",
        120 => "Caption-Abstract",
        122 => "Writer-Editor",
        _ => return None,
    })
}

fn iim_datasets(d: &[u8]) -> Vec<MetaItem> {
    let name = iim_name;
    let mut out: Vec<MetaItem> = Vec::new();
    let mut i = 0;
    while i + 5 <= d.len() && d[i] == 0x1C {
        let (record, tag) = (d[i + 1], d[i + 2]);
        let size = ((d[i + 3] as usize) << 8) | d[i + 4] as usize;
        let end = i + 5 + size;
        if end > d.len() {
            break;
        }
        if let Some(n) = name(record, tag) {
            let value = String::from_utf8_lossy(&d[i + 5..end]).into_owned();
            // Repeating datasets (keywords) are joined into one row.
            match out.iter_mut().find(|m| m.key == n) {
                Some(existing) => existing.value = format!("{}, {}", existing.value, value),
                None => out.push(MetaItem { key: n.to_string(), value }),
            }
        }
        i = end;
    }
    out
}

fn png_text_items(b: &[u8], pieces: &[Piece]) -> Vec<MetaItem> {
    let mut out = Vec::new();
    for p in pieces {
        let ty = &p.label.get(..4).unwrap_or("");
        if !matches!(*ty, "tEXt" | "iTXt" | "zTXt") || p.size() < 12 {
            continue;
        }
        let data = &b[p.start + 8..p.end - 4];
        let Some(nul) = data.iter().position(|&c| c == 0) else { continue };
        let keyword = String::from_utf8_lossy(&data[..nul]).into_owned();
        if keyword == "XML:com.adobe.xmp" {
            continue;
        }
        let rest = &data[nul + 1..];
        let text = match *ty {
            "tEXt" => engine::latin1(rest),
            "zTXt" => inflate(rest.get(1..).unwrap_or(&[])).map(|v| engine::latin1(&v)).unwrap_or_default(),
            _ => {
                // iTXt: compression flag, method, language\0, translated keyword\0, text
                let flag = rest.first().copied().unwrap_or(0);
                let mut parts = rest.get(2..).unwrap_or(&[]).splitn(3, |&c| c == 0);
                let _lang = parts.next();
                let _translated = parts.next();
                let body = parts.next().unwrap_or(&[]);
                if flag == 1 {
                    inflate(body).map(|v| String::from_utf8_lossy(&v).into_owned()).unwrap_or_default()
                } else {
                    String::from_utf8_lossy(body).into_owned()
                }
            }
        };
        if !text.trim().is_empty() {
            let text = if text.chars().count() > 20_000 { text.chars().take(20_000).collect() } else { text };
            out.push(MetaItem { key: keyword, value: text });
        }
    }
    out.sort_by(|a, b| a.key.cmp(&b.key));
    out
}

fn inflate(data: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    flate2::read::ZlibDecoder::new(data).take(4_000_000).read_to_end(&mut out).ok()?;
    Some(out)
}

// MARK: Privacy summary

fn normalized(key: &str) -> String {
    key.to_lowercase().chars().filter(|c| c.is_alphanumeric()).collect()
}

/// Promotes the metadata people care about before sharing into a concise Findings report.
pub fn privacy_facts(groups: &[MetaGroup], width: u32, height: u32) -> Vec<PrivacyFact> {
    struct Entry {
        group: String,
        key: String,
        value: String,
    }
    let entries: Vec<Entry> = groups
        .iter()
        .flat_map(|g| {
            g.items.iter().map(move |i| Entry { group: g.title.to_lowercase(), key: normalized(&i.key), value: i.value.clone() })
        })
        .collect();

    let key_matches = |e: &Entry, keys: &[&str]| keys.iter().any(|k| e.key == *k || e.key.ends_with(k));
    let group_matches = |e: &Entry, hints: &[&str]| hints.is_empty() || hints.iter().any(|h| e.group.contains(h));
    let first = |keys: &[&str], hints: &[&str]| -> Option<&Entry> {
        entries.iter().find(|e| key_matches(e, keys) && group_matches(e, hints) && !e.value.trim().is_empty())
    };
    let values = |keys: &[&str], hints: &[&str]| -> Vec<String> {
        let mut seen = HashSet::new();
        entries
            .iter()
            .filter(|e| key_matches(e, keys) && group_matches(e, hints))
            .filter(|e| seen.insert(e.value.clone()))
            .map(|e| e.value.clone())
            .collect()
    };

    let mut facts = Vec::new();
    let latitude = first(&["latitude"], &["gps"]);
    let longitude = first(&["longitude"], &["gps"]);
    let lat_ref = first(&["latituderef"], &["gps"]).map(|e| e.value.clone()).unwrap_or_default();
    let lon_ref = first(&["longituderef"], &["gps"]).map(|e| e.value.clone()).unwrap_or_default();
    if latitude.is_some() || longitude.is_some() || entries.iter().any(|e| e.group.contains("gps")) {
        let part = |e: Option<&Entry>, r: &str| e.map(|e| format!("{}{}", e.value, if r.is_empty() { String::new() } else { format!("° {r}") }));
        let coordinate = [part(latitude, &lat_ref), part(longitude, &lon_ref)].into_iter().flatten().collect::<Vec<_>>().join(", ");
        facts.push(PrivacyFact {
            kind: PrivacyFactKind::Location,
            value_key: coordinate.is_empty().then(|| "privacy.value.locationPresent".to_string()),
            value: coordinate,
            severity: Severity::High,
            source: "GPS".into(),
        });
    }

    let mut device = values(&["make"], &["tiff", "exif", "maker"]);
    device.extend(values(&["model", "lensmodel", "uniquecameramodel"], &["tiff", "exif", "maker", "dng"]));
    if !device.is_empty() {
        facts.push(PrivacyFact {
            kind: PrivacyFactKind::Device,
            value: device.join(" · "),
            value_key: None,
            severity: Severity::Medium,
            source: "EXIF / TIFF".into(),
        });
    }

    if let Some(date) = first(&["datetimeoriginal", "datetimecreated", "datetime", "createdate", "modifydate"], &[]) {
        facts.push(PrivacyFact {
            kind: PrivacyFactKind::Captured,
            value: date.value.clone(),
            value_key: None,
            severity: Severity::Medium,
            source: date.group.clone(),
        });
    }

    let authors = values(&["artist", "author", "creator", "ownername", "copyright", "byline"], &[]);
    if !authors.is_empty() {
        facts.push(PrivacyFact {
            kind: PrivacyFactKind::Author,
            value: authors.join(" · "),
            value_key: None,
            severity: Severity::High,
            source: "EXIF / IPTC / XMP".into(),
        });
    }

    let software = values(&["software", "processingsoftware", "hostcomputer", "creatortool"], &[]);
    if !software.is_empty() {
        facts.push(PrivacyFact {
            kind: PrivacyFactKind::Software,
            value: software.join(" · "),
            value_key: None,
            severity: Severity::Medium,
            source: "EXIF / XMP".into(),
        });
    }

    if let Some(o) = first(&["orientation"], &[]) {
        facts.push(PrivacyFact {
            kind: PrivacyFactKind::Orientation,
            value: o.value.clone(),
            value_key: None,
            severity: Severity::Info,
            source: o.group.clone(),
        });
    }
    facts.push(PrivacyFact {
        kind: PrivacyFactKind::Dimensions,
        value: format!("{width} × {height} px"),
        value_key: None,
        severity: Severity::Info,
        source: "Image".into(),
    });
    facts
}

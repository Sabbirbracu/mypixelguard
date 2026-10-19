//! End-to-end checks for the metadata engine and the image tools. Fixtures are built in memory.

use std::collections::HashSet;
use std::path::PathBuf;

use image::{DynamicImage, RgbImage};
use mpg_core::analyzer;
use mpg_core::cleaner;
use mpg_core::codec::{self, EncodeOptions, Loaded, OutputFormat};
use mpg_core::compress::{self, CompressSettings};
use mpg_core::container;
use mpg_core::convert::{self, ConvertSettings};
use mpg_core::engine::{self, ImageKind, MetaCategory, Severity};
use mpg_core::export;
use mpg_core::resize::{self, Fit, Mode, ResizeSettings};
use mpg_core::selective;
use mpg_core::tiff::{Entry, Ifd, PrivateField, Tiff};

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("mpg-test-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn ascii(tag: u16, text: &str) -> Entry {
    let mut data = text.as_bytes().to_vec();
    data.push(0);
    Entry { tag, typ: 2, count: data.len() as u32, data }
}
fn short(tag: u16, v: u16) -> Entry {
    Entry { tag, typ: 3, count: 1, data: v.to_le_bytes().to_vec() }
}
fn rational(tag: u16, vals: &[(u32, u32)]) -> Entry {
    let data = vals.iter().flat_map(|(n, d)| n.to_le_bytes().into_iter().chain(d.to_le_bytes())).collect();
    Entry { tag, typ: 5, count: vals.len() as u32, data }
}

/// A realistic EXIF block: camera, author, dates, orientation 6 and a GPS location.
fn sample_exif() -> Vec<u8> {
    let exif_ifd = Ifd { entries: vec![ascii(0x9003, "2025:07:04 18:22:10"), ascii(0xA434, "Lens X")], ..Default::default() };
    let gps = Ifd {
        entries: vec![
            ascii(1, "N"),
            rational(2, &[(23, 1), (48, 1), (37, 1)]),
            ascii(3, "E"),
            rational(4, &[(90, 1), (24, 1), (50, 1)]),
        ],
        ..Default::default()
    };
    let ifd0 = Ifd {
        entries: vec![ascii(0x010F, "Apple"), ascii(0x0110, "iPhone 15 Pro"), short(0x0112, 6), ascii(0x0131, "Photoshop"), ascii(0x013B, "Sabbir")],
        children: vec![(0x8769, exif_ifd), (0x8825, gps)],
        ..Default::default()
    };
    Tiff { little: true, ifd0 }.serialize()
}

fn xmp() -> Vec<u8> {
    br#"<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" xmp:CreatorTool="Adobe Firefly" Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"><dc:creator><rdf:Seq><rdf:li>Sabbir</rdf:li></rdf:Seq></dc:creator><dc:title>Parrot</dc:title></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>"#.to_vec()
}

fn pixels(w: u32, h: u32) -> RgbImage {
    RgbImage::from_fn(w, h, |x, y| image::Rgb([(x * 255 / w) as u8, (y * 255 / h) as u8, ((x + y) * 255 / (w + h)) as u8]))
}

fn loaded(w: u32, h: u32) -> Loaded {
    Loaded { image: DynamicImage::ImageRgb8(pixels(w, h)), icc: None }
}

/// JPEG with EXIF + XMP + IPTC + a comment.
fn jpeg_with_metadata() -> Vec<u8> {
    let mut o = EncodeOptions::new(OutputFormat::Jpeg);
    o.quality = Some(0.9);
    let plain = codec::encode(&loaded(64, 48), &o).unwrap();
    let seg = |marker: u8, payload: &[u8]| {
        let len = payload.len() + 2;
        let mut v = vec![0xFF, marker, (len >> 8) as u8, (len & 0xFF) as u8];
        v.extend_from_slice(payload);
        v
    };
    let mut xmp_payload = b"http://ns.adobe.com/xap/1.0/\0".to_vec();
    xmp_payload.extend(xmp());
    let ds = |tag: u8, text: &str| {
        let mut v = vec![0x1C, 0x02, tag, 0, text.len() as u8];
        v.extend_from_slice(text.as_bytes());
        v
    };
    let mut iim = ds(80, "Sabbir");
    iim.extend(ds(90, "Dhaka"));
    iim.extend(ds(120, "A red parrot"));
    let mut iptc = b"Photoshop 3.0\0".to_vec();
    iptc.extend_from_slice(b"8BIM\x04\x04\x00\x00");
    iptc.extend_from_slice(&(iim.len() as u32).to_be_bytes());
    iptc.extend_from_slice(&iim);
    if iim.len() % 2 == 1 {
        iptc.push(0);
    }
    container::jpeg_insert(
        &plain,
        &[container::exif_segment(&sample_exif()).unwrap(), seg(0xE1, &xmp_payload), seg(0xED, &iptc), seg(0xFE, b"made with midjourney")],
    )
}

fn decoded(bytes: &[u8]) -> Vec<u8> {
    codec::load_from_bytes(bytes, None).unwrap().image.to_rgb8().into_raw()
}

#[test]
fn analyzer_finds_ai_markers_and_private_facts() {
    let a = analyzer::analyze_bytes(&jpeg_with_metadata()).unwrap();
    assert_eq!(a.kind, ImageKind::Jpeg);
    let titles: Vec<&str> = a.indicators.iter().map(|i| i.title.as_str()).collect();
    assert!(titles.iter().any(|t| t.contains("trainedAlgorithmicMedia")), "{titles:?}");
    assert!(titles.contains(&"Mentions “Adobe Firefly”"), "{titles:?}");
    assert!(titles.contains(&"Mentions “midjourney”"), "{titles:?}");
    assert_eq!(a.ai_risk, Some(Severity::High));
    let location = a.privacy_facts.iter().find(|f| f.kind == analyzer::PrivacyFactKind::Location).expect("location fact");
    assert!(location.value.contains("23.81") && location.value.contains("90.41"), "{}", location.value);
    assert!(a.privacy_facts.iter().any(|f| f.kind == analyzer::PrivacyFactKind::Device && f.value.contains("iPhone")));
    assert!(a.groups.iter().any(|g| g.title == "GPS location"));
    assert!(a.groups.iter().any(|g| g.title == "IPTC" && g.items.iter().any(|i| i.key == "City" && i.value == "Dhaka")));
}

#[test]
fn keyword_matching_respects_word_boundaries() {
    assert!(analyzer::scan("made by a firefly in the dark", "t").iter().all(|i| !i.title.contains("Adobe")));
    assert!(analyzer::scan("unfireflyish", "t").is_empty());
    assert!(!analyzer::scan("Created with Firefly!", "t").is_empty());
    // Longest keyword wins at one position.
    let hits = analyzer::scan("Adobe Firefly", "t");
    assert_eq!(hits.len(), 1);
    assert!(hits[0].title.contains("Adobe Firefly"));
}

#[test]
fn cleaning_removes_metadata_but_never_touches_pixels() {
    let src = jpeg_with_metadata();
    let dir = temp_dir("clean");
    let input = dir.join("photo.jpg");
    std::fs::write(&input, &src).unwrap();
    let report = cleaner::clean(&input, &dir.join("out.jpg"), true, &MetaCategory::default_removal(), &Default::default()).unwrap();
    let out = std::fs::read(&report.output).unwrap();

    let after = analyzer::analyze_bytes(&out).unwrap();
    assert!(after.indicators.iter().all(|i| i.severity == Severity::Info), "{:?}", after.indicators);
    assert!(!after.groups.iter().any(|g| g.title == "GPS location"));
    assert_eq!(report.kept_orientation, Some(6), "orientation survives so the photo is not sideways");
    assert!(report.decodes);
    // Pixel data is copied byte-for-byte, so decoding gives identical pixels.
    assert_eq!(decoded(&src), decoded(&out));
    assert!(out.len() < src.len());
    // The original is untouched.
    assert_eq!(std::fs::read(&input).unwrap(), src);
}

#[test]
fn engine_strip_is_idempotent() {
    let src = jpeg_with_metadata();
    let pieces = engine::parse(&src, ImageKind::Jpeg).unwrap();
    let (once, _) = engine::strip(&src, ImageKind::Jpeg, &pieces, &MetaCategory::default_removal());
    let pieces2 = engine::parse(&once, ImageKind::Jpeg).unwrap();
    let (twice, _) = engine::strip(&once, ImageKind::Jpeg, &pieces2, &MetaCategory::default_removal());
    // The second pass re-adds nothing but the tiny orientation block that was already there.
    assert_eq!(once.len(), twice.len());
}

#[test]
fn corrupt_files_are_rejected_cleanly() {
    let mut bad = jpeg_with_metadata();
    bad.truncate(bad.len() / 2);
    // Truncation inside the scan is tolerated; garbage between segments is not.
    let mut garbage = jpeg_with_metadata();
    garbage[2] = 0x00;
    assert!(engine::parse(&garbage, ImageKind::Jpeg).is_err());
    let _ = engine::parse(&bad, ImageKind::Jpeg);
}

#[test]
fn tiff_roundtrip_and_field_removal() {
    let original = sample_exif();
    let t = Tiff::parse(&original).unwrap();
    assert_eq!(t.ifd0.children.len(), 2);
    let again = Tiff::parse(&t.serialize()).unwrap();
    assert_eq!(again.ifd0.entries.len(), t.ifd0.entries.len());

    let no_gps = Tiff::parse(&mpg_core::tiff::remove_fields(&original, &[PrivateField::Location]).unwrap()).unwrap();
    assert!(no_gps.ifd0.children.iter().all(|(tag, _)| *tag != 0x8825));
    assert!(no_gps.ifd0.entries.iter().any(|e| e.tag == 0x010F), "device info stays when only location is removed");

    let no_device = Tiff::parse(&mpg_core::tiff::remove_fields(&original, &[PrivateField::Device]).unwrap()).unwrap();
    assert!(no_device.ifd0.entries.iter().all(|e| e.tag != 0x010F && e.tag != 0x0110));
    assert!(no_device.ifd0.children.iter().any(|(tag, _)| *tag == 0x8825), "GPS stays when only device is removed");
}

#[test]
fn selective_clean_keeps_pixels_and_other_fields() {
    let src = jpeg_with_metadata();
    let dir = temp_dir("selective");
    let input = dir.join("photo.jpg");
    std::fs::write(&input, &src).unwrap();
    let fields: HashSet<PrivateField> = [PrivateField::Location, PrivateField::Author].into_iter().collect();
    let out = selective::process(&input, &fields).unwrap();
    assert_eq!(decoded(&src), decoded(&out.data), "no re-encoding");
    let a = analyzer::analyze_bytes(&out.data).unwrap();
    assert!(!a.groups.iter().any(|g| g.title == "GPS location"));
    let flat: Vec<String> = a.groups.iter().flat_map(|g| g.items.iter().map(|i| format!("{}={}", i.key, i.value))).collect();
    assert!(flat.iter().any(|s| s == "Make=Apple"), "{flat:?}");
    assert!(!flat.iter().any(|s| s.starts_with("Artist=") || s.starts_with("By-line=") || s.starts_with("City=")), "{flat:?}");
    assert!(flat.iter().any(|s| s.starts_with("CreatorTool=")), "software kept");
    assert!(!flat.iter().any(|s| s.starts_with("creator=")), "XMP author removed: {flat:?}");
    // A removed XMP element must not leave the document broken.
    assert!(analyzer::analyze_bytes(&out.data).unwrap().raw_xmp.is_some());
}

#[test]
fn keep_metadata_carries_exif_with_orientation_reset() {
    let src = jpeg_with_metadata();
    let dir = temp_dir("keep");
    let input = dir.join("photo.jpg");
    std::fs::write(&input, &src).unwrap();
    let mut s = ConvertSettings { format: OutputFormat::Png, keep_metadata: true, ..Default::default() };
    let kept = convert::process(&input, &s).unwrap();
    let a = analyzer::analyze_bytes(&kept.data).unwrap();
    assert!(a.groups.iter().any(|g| g.items.iter().any(|i| i.key == "Make" && i.value == "Apple")));
    assert!(a.groups.iter().any(|g| g.items.iter().any(|i| i.key == "Orientation" && i.value == "1")));
    s.keep_metadata = false;
    let stripped = convert::process(&input, &s).unwrap();
    assert!(!export::has_private_metadata(&stripped.data));
}

#[test]
fn convert_flattens_transparency_and_applies_orientation() {
    let rgba = DynamicImage::ImageRgba8(image::RgbaImage::from_fn(10, 10, |x, _| if x < 5 { image::Rgba([255, 0, 0, 255]) } else { image::Rgba([0, 0, 255, 0]) }));
    let l = Loaded { image: rgba, icc: None };
    let mut o = EncodeOptions::new(OutputFormat::Jpeg);
    o.background = [255, 255, 255];
    o.quality = Some(1.0);
    let jpg = codec::encode(&l, &o).unwrap();
    let back = codec::load_from_bytes(&jpg, None).unwrap().image.to_rgb8();
    let p = back.get_pixel(8, 5);
    assert!(p[0] > 240 && p[1] > 240 && p[2] > 240, "transparent area became white: {p:?}");

    // EXIF orientation 6 (rotate 90°) swaps width and height.
    let dir = temp_dir("orient");
    let input = dir.join("o.jpg");
    let plain = codec::encode(&loaded(64, 48), &EncodeOptions::new(OutputFormat::Jpeg)).unwrap();
    let rotated = container::jpeg_insert(&plain, &[container::exif_segment(&sample_exif()).unwrap()]);
    std::fs::write(&input, rotated).unwrap();
    let info = codec::info(&input).unwrap();
    assert_eq!((info.width, info.height), (48, 64));
    let img = codec::load_image(&input, None).unwrap();
    assert_eq!((img.width(), img.height()), (48, 64));
}

#[test]
fn resize_plans_follow_the_mac_rules() {
    let mut s = ResizeSettings { mode: Mode::Pixels, width: 800, lock_aspect: true, ..Default::default() };
    let p = resize::plan((4000, 3000), &s);
    assert_eq!((p.canvas_width, p.canvas_height), (800, 600));
    s.mode = Mode::Percent;
    s.percent = 50.0;
    assert_eq!(resize::plan((4000, 3000), &s).canvas_width, 2000);
    let mut s = ResizeSettings { width: 1000, height: 1000, lock_aspect: false, fit: Fit::Fill, ..Default::default() };
    let p = resize::plan((2000, 1000), &s);
    assert_eq!((p.canvas_width, p.canvas_height), (1000, 1000));
    assert!(p.draw.w > 1000.0 && p.draw.x < 0.0, "fill crops: {:?}", p.draw);
    s.fit = Fit::Fit;
    assert_eq!(resize::plan((2000, 1000), &s).canvas_height, 500);
    s.fit = Fit::Stretch;
    assert_eq!(resize::plan((2000, 1000), &s).canvas_height, 1000);
    s.never_enlarge = true;
    s.width = 5000;
    s.height = 5000;
    assert!(resize::plan((2000, 1000), &s).unchanged, "never enlarge leaves small images alone");
}

#[test]
fn compress_finds_the_best_quality_under_a_target() {
    // Noisy pixels so the size really depends on quality.
    let img = RgbImage::from_fn(256, 256, |x, y| {
        let n = (x.wrapping_mul(2654435761).wrapping_add(y.wrapping_mul(40503)) >> 7) as u8;
        image::Rgb([n, n.wrapping_mul(3), n.wrapping_add(x as u8)])
    });
    let l = Loaded { image: DynamicImage::ImageRgb8(img), icc: None };
    let full = compress::encode(&l, OutputFormat::Jpeg, 1.0, None, [255; 3], None).unwrap();
    let target = full.data.len() / 3;
    let o = compress::encode(&l, OutputFormat::Jpeg, 0.9, Some(target), [255; 3], None).unwrap();
    assert!(o.reached_target && o.data.len() <= target, "{} vs {}", o.data.len(), target);
    assert!(o.quality.unwrap() < 1.0);
    // PNG is lossless, so a target can't be honoured and is reported.
    let png = compress::encode(&l, OutputFormat::Png, 0.5, Some(1000), [255; 3], None).unwrap();
    assert!(!png.reached_target);
    let _ = CompressSettings::default();
}

#[test]
fn export_never_overwrites_and_verifies() {
    let dir = temp_dir("export");
    let input = dir.join("photo.jpg");
    std::fs::write(&input, jpeg_with_metadata()).unwrap();
    let s = ConvertSettings { format: OutputFormat::Png, suffix: "_x".into(), ..Default::default() };
    let first = export::export(&input, &dir, "_x", |p| convert::process(p, &s));
    let second = export::export(&input, &dir, "_x", |p| convert::process(p, &s));
    assert!(first.succeeded() && second.succeeded());
    assert!(first.verified && first.metadata_clean == Some(true));
    assert_ne!(first.output, second.output, "second export gets a new name");
    assert!(second.output.unwrap().ends_with("photo_x 2.png"));
    assert!(export::sanitized_suffix("a/b\\c:d*e") == "abcde");
}

#[test]
fn webp_metadata_helpers_produce_valid_files() {
    let l = loaded(32, 32);
    let mut o = EncodeOptions::new(OutputFormat::Webp);
    o.quality = Some(0.8);
    let exif = sample_exif();
    o.keep_exif = Some(&exif);
    let bytes = codec::encode(&l, &o).unwrap();
    let pieces = engine::parse(&bytes, ImageKind::Webp).unwrap();
    assert!(pieces.iter().any(|p| p.category == Some(MetaCategory::Exif)));
    assert_eq!(codec::load_from_bytes(&bytes, None).unwrap().width(), 32);
}

#[test]
fn clean_removes_chosen_fields_inside_kept_blocks() {
    let src = jpeg_with_metadata();
    let dir = temp_dir("clean-fields");
    let input = dir.join("photo.jpg");
    std::fs::write(&input, &src).unwrap();
    // Keep EXIF as a block, but take the location out of it.
    let remove: HashSet<MetaCategory> = [MetaCategory::C2pa].into_iter().collect();
    let fields: HashSet<PrivateField> = [PrivateField::Location].into_iter().collect();
    assert!(!PrivateField::Location.is_covered_by(&remove));
    let report = cleaner::clean(&input, &dir.join("out.jpg"), true, &remove, &fields).unwrap();
    let after = analyzer::analyze_bytes(&std::fs::read(&report.output).unwrap()).unwrap();
    assert!(!after.groups.iter().any(|g| g.title == "GPS location"), "location removed");
    assert!(after.metadata_pieces().iter().any(|p| p.category == Some(MetaCategory::Exif)), "EXIF block kept");
    assert_eq!(report.before_bytes, src.len());
    assert_eq!(decoded(&src), decoded(&std::fs::read(&report.output).unwrap()));
    // Whole-block removal already covers it.
    assert!(PrivateField::Location.is_covered_by(&MetaCategory::default_removal()));
}

#[test]
fn resize_pad_keeps_the_exact_size_with_edge_borders() {
    let s = ResizeSettings { width: 1000, height: 1000, lock_aspect: false, ..Default::default() };
    assert_eq!(s.fit, Fit::Pad, "Pad is the Resize tab's default");
    let p = resize::plan((2000, 1000), &s);
    assert_eq!((p.canvas_width, p.canvas_height), (1000, 1000));
    assert_eq!((p.draw.x, p.draw.y, p.draw.w, p.draw.h), (0.0, 250.0, 1000.0, 500.0));
    assert_eq!(resize::bars(&p), Some(resize::Bars::TopBottom));

    // A red-top / blue-bottom picture: the top border continues red, the bottom one blue.
    let mut img = RgbImage::new(200, 100);
    for (_, y, px) in img.enumerate_pixels_mut() {
        *px = if y < 50 { image::Rgb([220, 20, 20]) } else { image::Rgb([20, 20, 220]) };
    }
    let src = DynamicImage::ImageRgb8(img);
    let p = resize::plan((200, 100), &ResizeSettings { width: 100, height: 100, lock_aspect: false, ..Default::default() });
    let samples = resize::border_samples(&src, resize::Bars::TopBottom, 12);
    let out = resize::render_with(&src, &p, Some([255, 255, 255]), Some((resize::Bars::TopBottom, &samples))).to_rgb8();
    assert_eq!((out.width(), out.height()), (100, 100));
    let top = out.get_pixel(50, 5).0;
    let bottom = out.get_pixel(50, 95).0;
    assert!(top[0] > 180 && top[2] < 60, "top border is red: {top:?}");
    assert!(bottom[2] > 180 && bottom[0] < 60, "bottom border is blue: {bottom:?}");
}

#[test]
fn resize_fill_anchor_picks_the_visible_part() {
    let mut s = ResizeSettings { width: 1000, height: 1000, lock_aspect: false, fit: Fit::Fill, ..Default::default() };
    s.anchor = [0.0, 0.5];
    assert_eq!(resize::plan((2000, 1000), &s).draw.x, 0.0, "left edge kept");
    s.anchor = [1.0, 0.5];
    assert_eq!(resize::plan((2000, 1000), &s).draw.x, -1000.0, "right edge kept");
    s.anchor = [0.5, 0.0];
    assert_eq!(resize::plan((1000, 2000), &s).draw.y, 0.0, "top kept");
}

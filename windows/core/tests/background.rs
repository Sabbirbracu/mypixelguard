//! Background removal: the compositing must never alter the subject's pixels. The model-based test runs
//! only when the ONNX model is present (set MPG_MODEL or place it in windows/models).

use image::{DynamicImage, RgbImage, RgbaImage};
use mpg_core::background::{self, BackgroundSettings, Fill};

fn noisy(w: u32, h: u32) -> DynamicImage {
    DynamicImage::ImageRgb8(RgbImage::from_fn(w, h, |x, y| {
        let n = x.wrapping_mul(2654435761).wrapping_add(y.wrapping_mul(40503)) >> 5;
        image::Rgb([n as u8, (n >> 3) as u8, (n >> 6) as u8])
    }))
}

#[test]
fn attach_keeps_every_colour_and_uses_the_mask_as_alpha() {
    let img = noisy(64, 48);
    let mask: Vec<u8> = (0..64 * 48).map(|i| ((i % 64) * 4).min(255) as u8).collect();
    let cut = background::attach(&mask, &img).unwrap().to_rgba8();
    let src = img.to_rgb8();
    for (x, y, p) in cut.enumerate_pixels() {
        let s = src.get_pixel(x, y);
        assert_eq!([p[0], p[1], p[2]], [s[0], s[1], s[2]], "colour changed at {x},{y}");
        assert_eq!(p[3], mask[(y * 64 + x) as usize]);
    }
}

#[test]
fn existing_transparency_is_multiplied_not_replaced() {
    let img = DynamicImage::ImageRgba8(RgbaImage::from_fn(4, 1, |x, _| image::Rgba([10, 20, 30, if x < 2 { 255 } else { 0 }])));
    let cut = background::attach(&[255, 128, 255, 255], &img).unwrap().to_rgba8();
    assert_eq!(cut.get_pixel(0, 0)[3], 255);
    assert_eq!(cut.get_pixel(1, 0)[3], 128);
    assert_eq!(cut.get_pixel(2, 0)[3], 0, "already-transparent stays transparent");
}

#[test]
fn edge_smoothing_only_touches_the_boundary() {
    let (w, h) = (400usize, 100usize);
    let mut hard = vec![0u8; w * h];
    for y in 0..h {
        for x in 200..w {
            hard[y * w + x] = 255;
        }
    }
    assert_eq!(background::refine(&hard, w, h, 0.0), hard, "smoothing 0 keeps the raw mask");
    let smooth = background::refine(&hard, w, h, 1.0);
    let ramp = (190..210).filter(|x| (1..=254).contains(&smooth[50 * w + x])).count();
    assert!(ramp >= 1, "boundary is anti-aliased");
    assert_eq!(smooth[50 * w + 100], 0);
    assert_eq!(smooth[50 * w + 300], 255);
}

#[test]
fn format_choice_follows_the_fill() {
    let mut s = BackgroundSettings { format: mpg_core::codec::OutputFormat::Jpeg, ..Default::default() };
    assert!(s.effective_format().supports_alpha(), "transparent fill never picks JPEG");
    s.fill = Fill::Color;
    assert!(s.available_formats().contains(&mpg_core::codec::OutputFormat::Jpeg));
    assert_eq!(s.effective_format(), mpg_core::codec::OutputFormat::Jpeg);
}

#[test]
fn colour_fill_is_opaque_and_replaces_the_background() {
    let img = noisy(16, 16);
    let mut mask = vec![0u8; 16 * 16];
    for y in 0..16 {
        for x in 8..16 {
            mask[y * 16 + x] = 255;
        }
    }
    let s = BackgroundSettings { fill: Fill::Color, color: [0, 200, 0], edge_smoothing: 0.0, ..Default::default() };
    let out = background::cutout_with_mask(&img, &mask, &s).unwrap();
    assert!(!out.color().has_alpha());
    assert_eq!(out.to_rgb8().get_pixel(1, 5).0, [0, 200, 0]);
    assert_eq!(out.to_rgb8().get_pixel(12, 5).0, img.to_rgb8().get_pixel(12, 5).0);
}

/// Needs the model and a photo with a clear subject: `MPG_TEST_IMAGE=photo.jpg cargo test -- --ignored`.
#[test]
#[ignore]
fn model_cutout_keeps_subject_pixels_exact() {
    let image = std::env::var("MPG_TEST_IMAGE").expect("MPG_TEST_IMAGE");
    let model = background::Segmenter::locate(None).expect("model");
    let seg = background::Segmenter::load(&model).unwrap();
    let original = mpg_core::codec::load_image(std::path::Path::new(&image), None).unwrap();
    let cut = background::cutout(&original.image, &seg, &BackgroundSettings::default()).unwrap().to_rgba8();
    let src = original.image.to_rgb8();
    let mut kept = 0;
    for (x, y, p) in cut.enumerate_pixels() {
        if p[3] > 0 {
            kept += 1;
            let s = src.get_pixel(x, y);
            assert_eq!([p[0], p[1], p[2]], [s[0], s[1], s[2]]);
        }
    }
    assert!(kept > 1000, "a subject was found");
}

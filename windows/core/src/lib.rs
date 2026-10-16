//! MyPixelGuard core: metadata engine and image tools. No UI code lives here, so it can be tested
//! on any platform; the Tauri app in `src-tauri` is a thin layer on top.

pub mod ai;
pub mod analyzer;
pub mod background;
pub mod cleaner;
pub mod codec;
pub mod compress;
pub mod container;
pub mod convert;
pub mod engine;
pub mod error;
pub mod export;
pub mod icc;
pub mod recipe;
pub mod redact;
pub mod resize;
pub mod selective;
pub mod tiff;
pub mod visual;
#[cfg(windows)]
pub mod wic;
pub mod yunet;

pub use error::{CoreError, CoreResult, Note};
pub use image;

use image::DynamicImage;

/// High-quality (Lanczos) resize that keeps transparent edges clean (alpha is premultiplied internally).
pub fn resize_pixels(img: &DynamicImage, width: u32, height: u32) -> DynamicImage {
    use fast_image_resize::{FilterType, PixelType, ResizeAlg, ResizeOptions, Resizer, images::Image};
    let (w, h) = (width.max(1), height.max(1));
    if img.width() == w && img.height() == h {
        return img.clone();
    }
    let alpha = img.color().has_alpha();
    let (raw, pixel_type) = if alpha { (img.to_rgba8().into_raw(), PixelType::U8x4) } else { (img.to_rgb8().into_raw(), PixelType::U8x3) };
    let src = Image::from_vec_u8(img.width(), img.height(), raw, pixel_type).expect("valid source buffer");
    let mut dst = Image::new(w, h, pixel_type);
    let options = ResizeOptions::new().resize_alg(ResizeAlg::Convolution(FilterType::Lanczos3));
    Resizer::new().resize(&src, &mut dst, &options).expect("resize");
    if alpha {
        DynamicImage::ImageRgba8(image::RgbaImage::from_raw(w, h, dst.into_vec()).expect("rgba buffer"))
    } else {
        DynamicImage::ImageRgb8(image::RgbImage::from_raw(w, h, dst.into_vec()).expect("rgb buffer"))
    }
}

/// `data:` URL for showing an image in the UI. Opaque photos go out as JPEG (small), others as PNG.
pub fn export_data_url(img: &DynamicImage) -> String {
    use base64::Engine;
    let (mime, bytes) = if img.color().has_alpha() {
        ("image/png", codec::preview_png(img))
    } else {
        ("image/jpeg", codec::preview_jpeg(img, 88))
    };
    format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))
}

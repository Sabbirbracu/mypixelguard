//! Windows-only fallback decoder for formats the `image` crate cannot read (HEIC/HEIF, AVIF, JPEG XR, camera RAW …).
//! It asks the operating system (Windows.Graphics.Imaging) to decode, so nothing is bundled and nothing leaves the PC.
//! Whatever codecs the user's Windows has installed (e.g. the "HEIF Image Extensions") decide what opens.

use crate::codec::{Loaded, SourceInfo};
use crate::engine;
use image::{DynamicImage, RgbaImage};
use std::sync::Once;
use windows::Graphics::Imaging::{BitmapAlphaMode, BitmapDecoder, BitmapPixelFormat, BitmapTransform, ColorManagementMode, ExifOrientationMode};
use windows::Storage::Streams::{Buffer, DataReader, DataWriter, InMemoryRandomAccessStream};
use windows::Win32::System::WinRT::{RO_INIT_MULTITHREADED, RoInitialize};

fn init() {
    static ONCE: Once = Once::new();
    // Safe to ignore the result: it fails harmlessly when the thread already joined an apartment.
    ONCE.call_once(|| unsafe {
        let _ = RoInitialize(RO_INIT_MULTITHREADED);
    });
}

fn open(b: &[u8]) -> Option<BitmapDecoder> {
    init();
    let stream = InMemoryRandomAccessStream::new().ok()?;
    let writer = DataWriter::CreateDataWriter(&stream).ok()?;
    writer.WriteBytes(b).ok()?;
    writer.StoreAsync().ok()?.join().ok()?;
    writer.DetachStream().ok()?;
    stream.Seek(0).ok()?;
    BitmapDecoder::CreateAsync(&stream).ok()?.join().ok()
}

/// Size and alpha of the picture as the OS sees it (EXIF orientation already counted in the size).
pub fn info(b: &[u8], exif: Option<Vec<u8>>, icc: Option<Vec<u8>>) -> Option<SourceInfo> {
    let decoder = open(b)?;
    Some(SourceInfo {
        width: decoder.OrientedPixelWidth().ok()?,
        height: decoder.OrientedPixelHeight().ok()?,
        has_alpha: decoder.BitmapAlphaMode().ok()? != BitmapAlphaMode::Ignore,
        file_size: b.len(),
        format: None,
        is_animated: false,
        exif,
        icc,
    })
}

/// Decoded pixels with the EXIF orientation applied. Colours are left as stored; the embedded profile travels alongside.
pub fn decode(b: &[u8]) -> Option<Loaded> {
    let decoder = open(b)?;
    let transform = BitmapTransform::new().ok()?;
    let bitmap = decoder
        .GetSoftwareBitmapTransformedAsync(BitmapPixelFormat::Rgba8, BitmapAlphaMode::Straight, &transform, ExifOrientationMode::RespectExifOrientation, ColorManagementMode::DoNotColorManage)
        .ok()?
        .join()
        .ok()?;
    let (w, h) = (bitmap.PixelWidth().ok()? as u32, bitmap.PixelHeight().ok()? as u32);
    let len = w.checked_mul(h)?.checked_mul(4)?;
    let buffer = Buffer::Create(len).ok()?;
    bitmap.CopyToBuffer(&buffer).ok()?;
    let mut raw = vec![0u8; len as usize];
    DataReader::FromBuffer(&buffer).ok()?.ReadBytes(&mut raw).ok()?;
    let image = DynamicImage::ImageRgba8(RgbaImage::from_raw(w, h, raw)?);
    let kind = engine::detect(b);
    let pieces = engine::parse(b, kind).unwrap_or_default();
    Some(Loaded { image, icc: crate::icc::extract(b, kind, &pieces) })
}

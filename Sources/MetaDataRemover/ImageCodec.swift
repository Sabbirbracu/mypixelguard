import Foundation
import ImageIO
import CoreGraphics
import UniformTypeIdentifiers

/// Image formats the converter / resizer / compressor can write. Whether a format is actually
/// available is checked against the codecs of the macOS version the app is running on.
enum OutputFormat: String, CaseIterable, Identifiable, Hashable {
    case jpeg, png, heic, tiff, webp

    var id: String { rawValue }

    var utType: UTType {
        switch self {
        case .jpeg: return .jpeg
        case .png:  return .png
        case .heic: return .heic
        case .tiff: return .tiff
        case .webp: return .webP
        }
    }

    var fileExtension: String { self == .jpeg ? "jpg" : rawValue }

    var displayName: String {
        switch self {
        case .jpeg: return "JPEG"
        case .png:  return "PNG"
        case .heic: return "HEIC"
        case .tiff: return "TIFF"
        case .webp: return "WebP"
        }
    }

    var supportsAlpha: Bool { self != .jpeg }
    var isLossy: Bool { self == .jpeg || self == .heic || self == .webp }

    var isAvailable: Bool { ImageCodec.encodableTypes.contains(utType.identifier) }

    static var available: [OutputFormat] { allCases.filter(\.isAvailable) }

    /// The format of an existing file, from its extension.
    init?(url: URL) {
        guard let type = UTType(filenameExtension: url.pathExtension) else { return nil }
        guard let match = Self.allCases.first(where: { type.conforms(to: $0.utType) }) else { return nil }
        self = match
    }
}

enum ImageToolError: LocalizedError {
    case unreadable
    case formatUnavailable(OutputFormat)
    case encodeFailed
    case verifyFailed
    case writeFailed(String)

    var errorDescription: String? {
        switch self {
        case .unreadable:               return t("err.unreadable")
        case .formatUnavailable(let f): return t("err.formatUnavailable", f.displayName)
        case .encodeFailed:             return t("err.encodeFailed")
        case .verifyFailed:             return t("err.verifyFailed")
        case .writeFailed(let why):     return t("err.writeFailed", why)
        }
    }
}

/// What the tools need to know about a file before touching it.
struct SourceInfo {
    var width: Int            // after EXIF orientation is applied
    var height: Int
    var hasAlpha: Bool
    var fileSize: Int
    var format: OutputFormat? // nil for formats we can read but not write (GIF, BMP, AVIF …)
    var frameCount: Int
    var properties: [String: Any]

    var isAnimated: Bool { frameCount > 1 }
}

struct ProcessedImage {
    var data: Data
    var format: OutputFormat
    var width: Int
    var height: Int
    var notes: [String] = []
    /// When set, export verification checks whether private/creator metadata dictionaries remain.
    var expectMetadataClean: Bool? = nil
}

enum ImageCodec {

    // MARK: Capabilities

    static let encodableTypes: Set<String> = {
        Set((CGImageDestinationCopyTypeIdentifiers() as? [String]) ?? [])
    }()

    /// The format to write when the user asks for "same as original".
    static func sameFormat(as info: SourceInfo) -> OutputFormat {
        if let f = info.format, f.isAvailable { return f }
        return info.hasAlpha ? .png : .jpeg
    }

    // MARK: Reading

    static func info(url: URL) throws -> SourceInfo {
        guard let src = CGImageSourceCreateWithURL(url as CFURL, nil), CGImageSourceGetCount(src) > 0 else {
            throw ImageToolError.unreadable
        }
        let props = (CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [String: Any]) ?? [:]
        var w = props[kCGImagePropertyPixelWidth as String] as? Int ?? 0
        var h = props[kCGImagePropertyPixelHeight as String] as? Int ?? 0
        if let o = props[kCGImagePropertyOrientation as String] as? Int, (5...8).contains(o) { swap(&w, &h) }
        guard w > 0, h > 0 else { throw ImageToolError.unreadable }
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        return SourceInfo(width: w, height: h,
                          hasAlpha: props[kCGImagePropertyHasAlpha as String] as? Bool ?? false,
                          fileSize: size, format: OutputFormat(url: url),
                          frameCount: CGImageSourceGetCount(src), properties: props)
    }

    /// Full-size decode with the EXIF orientation already applied to the pixels.
    /// `maxPixel` caps the longest side (for previews); it never enlarges.
    static func loadImage(url: URL, maxPixel: Int? = nil) throws -> CGImage {
        guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { throw ImageToolError.unreadable }
        let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [String: Any]
        var longest = max(props?[kCGImagePropertyPixelWidth as String] as? Int ?? 0,
                          props?[kCGImagePropertyPixelHeight as String] as? Int ?? 0, 1)
        if let maxPixel { longest = min(longest, maxPixel) }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: longest,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(src, 0, options as CFDictionary) else {
            throw ImageToolError.unreadable
        }
        return image
    }

    static func hasAlpha(_ image: CGImage) -> Bool {
        switch image.alphaInfo {
        case .none, .noneSkipFirst, .noneSkipLast: return false
        default: return true
        }
    }

    // MARK: Drawing

    /// Draws `image` into a new bitmap of `width`×`height`. `drawRect` positions the image inside the
    /// bitmap (so a larger rect crops). With `background` the bitmap is opaque.
    static func render(_ image: CGImage, width: Int, height: Int, drawRect: CGRect? = nil, background: CGColor? = nil) -> CGImage? {
        let space: CGColorSpace = {
            if let cs = image.colorSpace, cs.model == .rgb { return cs }
            return CGColorSpace(name: CGColorSpace.sRGB)!
        }()
        let opaque = background != nil
        let bitmapInfo = CGBitmapInfo(rawValue: opaque ? CGImageAlphaInfo.noneSkipLast.rawValue
                                                       : CGImageAlphaInfo.premultipliedLast.rawValue)
        guard let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: space, bitmapInfo: bitmapInfo.rawValue) else { return nil }
        ctx.interpolationQuality = .high
        if let background {
            ctx.setFillColor(background)
            ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
        ctx.draw(image, in: drawRect ?? CGRect(x: 0, y: 0, width: width, height: height))
        return ctx.makeImage()
    }

    // MARK: Writing

    /// Properties worth carrying over when the user chooses to keep metadata. The orientation is dropped
    /// because the pixels are already upright; size fields are dropped because the encoder writes them.
    static func portableProperties(_ props: [String: Any]) -> [String: Any] {
        var out: [String: Any] = [:]
        let keep = [kCGImagePropertyExifDictionary, kCGImagePropertyTIFFDictionary, kCGImagePropertyGPSDictionary,
                    kCGImagePropertyIPTCDictionary, kCGImagePropertyExifAuxDictionary].map { $0 as String }
        for key in keep { if let v = props[key] { out[key] = v } }
        if var tiff = out[kCGImagePropertyTIFFDictionary as String] as? [String: Any] {
            tiff.removeValue(forKey: kCGImagePropertyTIFFOrientation as String)
            out[kCGImagePropertyTIFFDictionary as String] = tiff
        }
        if var exif = out[kCGImagePropertyExifDictionary as String] as? [String: Any] {
            exif.removeValue(forKey: kCGImagePropertyExifPixelXDimension as String)
            exif.removeValue(forKey: kCGImagePropertyExifPixelYDimension as String)
            out[kCGImagePropertyExifDictionary as String] = exif
        }
        return out
    }

    /// Encodes `image`. Formats without transparency (JPEG) get the image flattened onto `background`.
    /// `quality` (0…1) only applies to lossy formats. Without `keepProperties` the output carries no
    /// camera, location or text metadata.
    static func encode(_ image: CGImage, as format: OutputFormat, quality: Double?, background: CGColor,
                       keepProperties: [String: Any]? = nil) throws -> Data {
        guard format.isAvailable else { throw ImageToolError.formatUnavailable(format) }
        var pixels = image
        if !format.supportsAlpha, hasAlpha(image) {
            guard let flat = render(image, width: image.width, height: image.height, background: background) else {
                throw ImageToolError.encodeFailed
            }
            pixels = flat
        }
        let out = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(out, format.utType.identifier as CFString, 1, nil) else {
            throw ImageToolError.encodeFailed
        }
        var props: [String: Any] = [:]
        if let keepProperties { props = portableProperties(keepProperties) }
        if format.isLossy, let quality { props[kCGImageDestinationLossyCompressionQuality as String] = min(max(quality, 0), 1) }
        CGImageDestinationAddImage(dest, pixels, props as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { throw ImageToolError.encodeFailed }
        return out as Data
    }

    /// Reads a finished file back and confirms it decodes at the expected size.
    static func verify(url: URL, width: Int, height: Int) -> Bool {
        guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
              let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { return false }
        return img.width == width && img.height == height
    }

    /// Small decoded preview of encoded bytes, for before/after views.
    static func thumbnail(of data: Data, maxPixel: Int) -> CGImage? {
        guard let src = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
        ]
        return CGImageSourceCreateThumbnailAtIndex(src, 0, options as CFDictionary)
    }
}

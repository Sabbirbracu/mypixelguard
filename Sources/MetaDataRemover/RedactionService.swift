import SwiftUI
import CoreImage
import CoreGraphics
import ImageIO

enum RedactionStyle: String, CaseIterable, Identifiable {
    case blur, pixelate, solid
    var id: String { rawValue }
}

struct RedactionSettings {
    var style: RedactionStyle = .blur
    var strength: Double = 30
    var format: OutputFormat?
    var quality: Double = 0.92
    var cleanMetadata = true
    var suffix = "_redacted"
}

enum RedactionService {
    private static let context = CIContext(options: [.useSoftwareRenderer: false])

    /// Words for how strong a setting is, shared by the slider label and the export summary.
    enum Level: String {
        case light, medium, strong, maximum
        init(strength: Double) {
            switch strength {
            case ..<20: self = .light
            case ..<34: self = .medium
            case ..<48: self = .strong
            default: self = .maximum
            }
        }
        var title: String { t("redact.strength.\(rawValue)") }
    }

    static let strengthRange: ClosedRange<Double> = 8...60

    /// Draws every selected region onto `source`. Strength is relative to each region's size, so a preview
    /// of a downscaled image looks the same as the full-size export.
    static func render(_ source: CGImage, regions: [SensitiveRegion], settings: RedactionSettings) -> CGImage? {
        let bounds = CGRect(x: 0, y: 0, width: source.width, height: source.height)
        var working = CIImage(cgImage: source)

        for region in regions where region.isSelected {
            var rect = CGRect(x: region.rect.minX * bounds.width,
                              y: region.rect.minY * bounds.height,
                              width: region.rect.width * bounds.width,
                              height: region.rect.height * bounds.height).intersection(bounds)
            if region.kind == .face { rect = rect.insetBy(dx: -rect.width * 0.08, dy: -rect.height * 0.08).intersection(bounds) }
            guard !rect.isNull, rect.width > 1, rect.height > 1 else { continue }
            let side = min(rect.width, rect.height)

            let replacement: CIImage?
            switch settings.style {
            case .blur:
                let filter = CIFilter(name: "CIGaussianBlur")
                filter?.setValue(working.clampedToExtent(), forKey: kCIInputImageKey)
                filter?.setValue(max(side * settings.strength / 200, 2), forKey: kCIInputRadiusKey)
                replacement = filter?.outputImage?.cropped(to: rect)
            case .pixelate:
                let filter = CIFilter(name: "CIPixellate")
                filter?.setValue(working, forKey: kCIInputImageKey)
                filter?.setValue(max(side * settings.strength / 200, 4), forKey: kCIInputScaleKey)
                filter?.setValue(CIVector(x: rect.midX, y: rect.midY), forKey: kCIInputCenterKey)
                replacement = filter?.outputImage?.cropped(to: rect)
            case .solid:
                replacement = CIImage(color: CIColor(red: 0.035, green: 0.055, blue: 0.09, alpha: 1)).cropped(to: rect)
            }
            if let replacement { working = replacement.composited(over: working) }
        }
        return context.createCGImage(working, from: bounds)
    }

    /// A screen-sized copy of the image (orientation applied) for live previews.
    static func previewBase(url: URL, maxPixel: Int = 1600) -> CGImage? {
        guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
        ]
        return CGImageSourceCreateThumbnailAtIndex(src, 0, options as CFDictionary)
    }

    static func process(url: URL, regions: [SensitiveRegion], settings: RedactionSettings) throws -> ProcessedImage {
        let info = try ImageCodec.info(url: url)
        let source = try ImageCodec.loadImage(url: url)
        guard let output = render(source, regions: regions, settings: settings) else { throw ImageToolError.encodeFailed }
        let format = settings.format ?? ImageCodec.sameFormat(as: info)
        let data = try ImageCodec.encode(output, as: format, quality: format.isLossy ? settings.quality : nil,
                                         background: CGColor(gray: 1, alpha: 1),
                                         keepProperties: settings.cleanMetadata ? nil : info.properties)
        var notes = [t("redact.note.regions", regions.filter(\.isSelected).count)]
        if settings.cleanMetadata { notes.append(t("redact.note.metadata")) }
        return ProcessedImage(data: data, format: format, width: output.width, height: output.height, notes: notes,
                              expectMetadataClean: settings.cleanMetadata)
    }
}

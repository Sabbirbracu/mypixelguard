import SwiftUI
import CoreGraphics

struct ConvertSettings: Equatable {
    var format: OutputFormat = .jpeg
    var quality: Double = 0.9
    /// Used when transparent pixels have to be flattened (JPEG has no transparency).
    var background: Color = .white
    var keepMetadata = false
    var suffix = ""
}

extension Color {
    var cgColorSRGB: CGColor {
        let ns = NSColor(self).usingColorSpace(.sRGB) ?? .white
        return ns.cgColor
    }
}

enum ImageConversionService {

    static func process(url: URL, settings s: ConvertSettings) throws -> ProcessedImage {
        let info = try ImageCodec.info(url: url)
        let image = try ImageCodec.loadImage(url: url)
        var notes: [String] = []
        if info.isAnimated { notes.append(t("note.animated")) }
        if info.hasAlpha, !s.format.supportsAlpha { notes.append(t("note.flattened")) }
        let data = try ImageCodec.encode(image, as: s.format, quality: s.format.isLossy ? s.quality : nil,
                                         background: s.background.cgColorSRGB,
                                         keepProperties: s.keepMetadata ? info.properties : nil)
        return ProcessedImage(data: data, format: s.format, width: image.width, height: image.height, notes: notes,
                              expectMetadataClean: !s.keepMetadata)
    }

    /// Output size of the first image for the live estimate.
    static func estimate(url: URL, settings s: ConvertSettings) -> Int? {
        (try? process(url: url, settings: s))?.data.count
    }
}

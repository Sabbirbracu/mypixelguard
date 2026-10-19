import SwiftUI
import CoreGraphics

struct CompressSettings: Equatable {
    /// nil keeps each image's own format.
    var format: OutputFormat?
    var quality: Double = 0.75
    var useTargetSize = false
    var targetKB = 200
    var background: Color = .white
    var keepMetadata = false
    var suffix = "_compressed"
}

enum ImageCompressionService {

    struct Outcome {
        var data: Data
        var quality: Double?
        /// False when a target size was requested but could not be reached.
        var reachedTarget: Bool
    }

    /// Encodes at `quality`, or, with `targetBytes`, searches for the highest quality that still fits.
    /// The target is best-effort: it depends on image content and on the format.
    static func encode(_ image: CGImage, format: OutputFormat, quality: Double, targetBytes: Int?,
                       background: CGColor, keep: [String: Any]?) throws -> Outcome {
        guard format.isLossy else {
            let data = try ImageCodec.encode(image, as: format, quality: nil, background: background, keepProperties: keep)
            return Outcome(data: data, quality: nil, reachedTarget: targetBytes.map { data.count <= $0 } ?? true)
        }
        guard let targetBytes else {
            let data = try ImageCodec.encode(image, as: format, quality: quality, background: background, keepProperties: keep)
            return Outcome(data: data, quality: quality, reachedTarget: true)
        }

        var lo = 0.02, hi = 1.0
        var best: (Data, Double)?
        // Highest quality first: if it already fits there's nothing to search.
        let top = try ImageCodec.encode(image, as: format, quality: hi, background: background, keepProperties: keep)
        if top.count <= targetBytes { return Outcome(data: top, quality: hi, reachedTarget: true) }
        for _ in 0..<9 {
            let mid = (lo + hi) / 2
            let data = try ImageCodec.encode(image, as: format, quality: mid, background: background, keepProperties: keep)
            if data.count <= targetBytes { best = (data, mid); lo = mid } else { hi = mid }
        }
        if let best { return Outcome(data: best.0, quality: best.1, reachedTarget: true) }
        let floor = try ImageCodec.encode(image, as: format, quality: 0.02, background: background, keepProperties: keep)
        return Outcome(data: floor, quality: 0.02, reachedTarget: false)
    }

    static func process(url: URL, settings s: CompressSettings) throws -> ProcessedImage {
        let info = try ImageCodec.info(url: url)
        let image = try ImageCodec.loadImage(url: url)
        return try process(info: info, image: image, settings: s)
    }

    static func process(info: SourceInfo, image: CGImage, settings s: CompressSettings) throws -> ProcessedImage {
        let format = s.format ?? ImageCodec.sameFormat(as: info)
        var notes: [String] = []
        if info.isAnimated { notes.append(t("note.animated")) }
        if info.hasAlpha, !format.supportsAlpha { notes.append(t("note.flattened")) }

        let outcome = try encode(image, format: format, quality: s.quality,
                                 targetBytes: s.useTargetSize ? s.targetKB * 1000 : nil,
                                 background: s.background.cgColorSRGB,
                                 keep: s.keepMetadata ? info.properties : nil)
        if s.useTargetSize, !outcome.reachedTarget {
            notes.append(format.isLossy ? t("note.targetMissed", byteString(outcome.data.count))
                                        : t("note.targetLossless"))
        }
        if outcome.data.count >= info.fileSize { notes.append(t("note.notSmaller")) }
        return ProcessedImage(data: outcome.data, format: format, width: image.width, height: image.height, notes: notes,
                              expectMetadataClean: !s.keepMetadata)
    }

    struct Preview {
        var processed: ProcessedImage
        var originalBytes: Int
        var thumbnail: CGImage?
        /// Output size at a few fixed qualities, to show the quality / file-size trade-off.
        var curve: [(quality: Int, bytes: Int)]
    }

    static let curveQualities = [30, 50, 70, 85, 95]

    static func preview(url: URL, settings s: CompressSettings) throws -> Preview {
        let info = try ImageCodec.info(url: url)
        let image = try ImageCodec.loadImage(url: url)
        let processed = try process(info: info, image: image, settings: s)
        var curve: [(Int, Int)] = []
        if processed.format.isLossy {
            for q in curveQualities {
                try Task.checkCancellation()
                let data = try ImageCodec.encode(image, as: processed.format, quality: Double(q) / 100,
                                                 background: s.background.cgColorSRGB,
                                                 keepProperties: s.keepMetadata ? info.properties : nil)
                curve.append((q, data.count))
            }
        }
        return Preview(processed: processed, originalBytes: info.fileSize,
                       thumbnail: ImageCodec.thumbnail(of: processed.data, maxPixel: 900), curve: curve)
    }
}

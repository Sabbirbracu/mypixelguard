import SwiftUI
import CoreGraphics

struct SizePreset: Identifiable, Codable, Equatable, Hashable {
    var id = UUID()
    var name: String
    var width: Int
    var height: Int
    var isBuiltIn = false

    /// Platform sizes change over time, so the built-in list is only a starting point and every value is editable.
    static let builtIn: [SizePreset] = [
        SizePreset(id: UUID(uuidString: "00000000-0000-0000-0000-000000000001")!, name: "Instagram Square", width: 1080, height: 1080, isBuiltIn: true),
        SizePreset(id: UUID(uuidString: "00000000-0000-0000-0000-000000000002")!, name: "Instagram Portrait", width: 1080, height: 1350, isBuiltIn: true),
        SizePreset(id: UUID(uuidString: "00000000-0000-0000-0000-000000000003")!, name: "Facebook Square", width: 1080, height: 1080, isBuiltIn: true),
        SizePreset(id: UUID(uuidString: "00000000-0000-0000-0000-000000000004")!, name: "YouTube Thumbnail", width: 1280, height: 720, isBuiltIn: true),
    ]
}

/// Stores the user's own presets next to the built-in ones.
enum PresetStore {
    private static let key = "customSizePresets"

    static func loadCustom() -> [SizePreset] {
        guard let data = UserDefaults.standard.data(forKey: key),
              let list = try? JSONDecoder().decode([SizePreset].self, from: data) else { return [] }
        return list
    }

    static func saveCustom(_ list: [SizePreset]) {
        UserDefaults.standard.set(try? JSONEncoder().encode(list), forKey: key)
    }
}

struct ResizeSettings: Equatable {
    enum Mode: String, CaseIterable, Identifiable { case pixels, percent; var id: String { rawValue } }
    enum Fit: String, CaseIterable, Identifiable { case fit, fill, stretch; var id: String { rawValue } }
    enum Driver { case width, height }

    var mode: Mode = .pixels
    var width = 1080
    var height = 1080
    var lockAspect = true
    /// With the aspect ratio locked, this is the dimension the user typed; the other follows each image.
    var driver: Driver = .width
    var percent = 50.0
    var fit: Fit = .fit
    var neverEnlarge = false
    /// nil keeps each image's own format.
    var outputFormat: OutputFormat?
    var quality: Double = 0.9
    var background: Color = .white
    var keepMetadata = false
    var suffix = "_resized"
}

enum ImageResizeService {

    struct Plan: Equatable {
        var canvasWidth: Int
        var canvasHeight: Int
        /// Where the source is drawn inside the canvas (bigger than the canvas when cropping).
        var drawRect: CGRect
        var enlarges: Bool
        var unchanged: Bool
    }

    static func plan(original: (width: Int, height: Int), settings s: ResizeSettings) -> Plan {
        let ow = Double(original.width), oh = Double(original.height)
        var cw = ow, ch = oh
        var draw = CGRect(x: 0, y: 0, width: ow, height: oh)
        var scaleUp = false

        switch s.mode {
        case .percent:
            let f = max(s.percent, 1) / 100
            cw = ow * f; ch = oh * f
            scaleUp = f > 1
        case .pixels where s.lockAspect:
            let f = s.driver == .width ? Double(s.width) / ow : Double(s.height) / oh
            cw = ow * f; ch = oh * f
            scaleUp = f > 1
        case .pixels:
            let tw = Double(max(s.width, 1)), th = Double(max(s.height, 1))
            switch s.fit {
            case .fit:
                let f = min(tw / ow, th / oh)
                cw = ow * f; ch = oh * f
                scaleUp = f > 1
            case .fill:
                let f = max(tw / ow, th / oh)
                cw = tw; ch = th
                draw = CGRect(x: (tw - ow * f) / 2, y: (th - oh * f) / 2, width: ow * f, height: oh * f)
                scaleUp = f > 1
            case .stretch:
                cw = tw; ch = th
                scaleUp = tw > ow || th > oh
            }
        }

        if scaleUp, s.neverEnlarge {
            return Plan(canvasWidth: original.width, canvasHeight: original.height,
                        drawRect: CGRect(x: 0, y: 0, width: ow, height: oh), enlarges: false, unchanged: true)
        }
        let w = max(Int(cw.rounded()), 1), h = max(Int(ch.rounded()), 1)
        if draw.width == ow, draw.height == oh, draw.origin == .zero { draw = CGRect(x: 0, y: 0, width: w, height: h) }
        return Plan(canvasWidth: w, canvasHeight: h, drawRect: draw, enlarges: scaleUp,
                    unchanged: w == original.width && h == original.height)
    }

    static func process(url: URL, settings s: ResizeSettings) throws -> ProcessedImage {
        let info = try ImageCodec.info(url: url)
        let source = try ImageCodec.loadImage(url: url)
        let plan = plan(original: (source.width, source.height), settings: s)
        var notes: [String] = []
        if info.isAnimated { notes.append(t("note.animated")) }
        if plan.unchanged, s.neverEnlarge { notes.append(t("note.notEnlarged")) }

        let format = s.outputFormat ?? ImageCodec.sameFormat(as: info)
        if info.hasAlpha, !format.supportsAlpha { notes.append(t("note.flattened")) }

        let resized: CGImage
        if plan.unchanged {
            resized = source
        } else {
            // Fill/crop on a format without transparency can leave no gaps, so only flatten when needed.
            let bg: CGColor? = format.supportsAlpha ? nil : s.background.cgColorSRGB
            guard let r = ImageCodec.render(source, width: plan.canvasWidth, height: plan.canvasHeight,
                                            drawRect: plan.drawRect, background: bg) else {
                throw ImageToolError.encodeFailed
            }
            resized = r
        }
        let data = try ImageCodec.encode(resized, as: format, quality: format.isLossy ? s.quality : nil,
                                         background: s.background.cgColorSRGB,
                                         keepProperties: s.keepMetadata ? info.properties : nil)
        return ProcessedImage(data: data, format: format, width: resized.width, height: resized.height, notes: notes,
                              expectMetadataClean: !s.keepMetadata)
    }
}

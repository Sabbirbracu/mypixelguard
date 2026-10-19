import Foundation
import ImageIO
import CoreGraphics
import SwiftUI
import UniformTypeIdentifiers

/// `MetaDataRemover --cli selftest` — regression checks that don't need Xcode or XCTest.
enum SelfTest {
    nonisolated(unsafe) private static var failures = 0

    private static func check(_ ok: Bool, _ name: String, _ detail: @autoclosure () -> String = "") {
        print("\(ok ? "PASS" : "FAIL")  \(name)\(ok ? "" : "  — \(detail())")")
        if !ok { failures += 1 }
    }

    static func run() -> Int32 {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("selftest-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }

        print("Writable formats on this Mac: " + OutputFormat.allCases.map { "\($0.displayName)=\($0.isAvailable ? "yes" : "no")" }.joined(separator: " "))
        localization()
        orientationAndMetadata(dir)
        transparency(dir)
        resizing(dir)
        compression(dir)
        advancedTools(dir)
        backgroundRemoval()
        export(dir)
        print(failures == 0 ? "\nALL PASSED" : "\n\(failures) FAILED")
        return failures == 0 ? 0 : 1
    }

    // MARK: Helpers

    private static func makeImage(width: Int, height: Int, alpha: Bool = false, noisy: Bool = false) -> CGImage {
        let space = CGColorSpace(name: CGColorSpace.sRGB)!
        let info = alpha ? CGImageAlphaInfo.premultipliedLast.rawValue : CGImageAlphaInfo.noneSkipLast.rawValue
        let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: space, bitmapInfo: info)!
        if noisy, let p = ctx.data?.assumingMemoryBound(to: UInt8.self) {
            var rng = SystemRandomNumberGenerator()
            for i in 0..<(ctx.bytesPerRow * height) { p[i] = UInt8.random(in: 0...255, using: &rng) }
        } else {
            ctx.setFillColor(CGColor(red: 0.9, green: 0.2, blue: 0.1, alpha: 1))
            ctx.fill(CGRect(x: 0, y: 0, width: width / 2, height: height))      // left half red
            ctx.setFillColor(CGColor(red: 0.1, green: 0.2, blue: 0.9, alpha: 1))
            ctx.fill(CGRect(x: width / 2, y: 0, width: width - width / 2, height: height))
        }
        return ctx.makeImage()!
    }

    private static func write(_ image: CGImage, to url: URL, type: UTType, properties: [String: Any] = [:]) {
        let dest = CGImageDestinationCreateWithURL(url as CFURL, type.identifier as CFString, 1, nil)!
        CGImageDestinationAddImage(dest, image, properties as CFDictionary)
        CGImageDestinationFinalize(dest)
    }

    private static func pixel(_ image: CGImage, x: Int, y: Int) -> (r: Int, g: Int, b: Int, a: Int) {
        var px = [UInt8](repeating: 0, count: 4)
        let ctx = CGContext(data: &px, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.draw(image, in: CGRect(x: -x, y: -(image.height - 1 - y), width: image.width, height: image.height))
        return (Int(px[0]), Int(px[1]), Int(px[2]), Int(px[3]))
    }

    private static func properties(of data: Data) -> [String: Any] {
        guard let s = CGImageSourceCreateWithData(data as CFData, nil) else { return [:] }
        return (CGImageSourceCopyPropertiesAtIndex(s, 0, nil) as? [String: Any]) ?? [:]
    }

    // MARK: Checks

    private static func localization() {
        let en = Set(StringsEN.table.keys), bn = Set(StringsBN.table.keys)
        check(en.subtracting(bn).isEmpty, "Bangla has every English key", "missing in bn: \(en.subtracting(bn).sorted())")
        check(bn.subtracting(en).isEmpty, "Bangla has no unknown keys", "extra in bn: \(bn.subtracting(en).sorted())")
        func placeholders(_ s: String) -> [String] {
            let re = try! NSRegularExpression(pattern: "%(\\d+\\$)?[@d]")
            return re.matches(in: s, range: NSRange(s.startIndex..., in: s)).map { String(s[Range($0.range, in: s)!]) }.map { $0.replacingOccurrences(of: "\\d+\\$", with: "", options: .regularExpression) }.sorted()
        }
        let mismatched = en.filter { k in StringsBN.table[k].map { placeholders($0) != placeholders(StringsEN.table[k]!) } ?? false }
        check(mismatched.isEmpty, "Bangla placeholders match English", "\(mismatched.sorted())")
        Localizer.current = "bn"
        check(t("common.cancel") == "বাতিল", "Language switch changes lookups")
        Localizer.current = "en"
    }

    private static func orientationAndMetadata(_ dir: URL) {
        let url = dir.appendingPathComponent("rotated.jpg")
        let props: [String: Any] = [
            kCGImagePropertyOrientation as String: 6,
            kCGImagePropertyGPSDictionary as String: [kCGImagePropertyGPSLatitude as String: 23.8, kCGImagePropertyGPSLatitudeRef as String: "N"],
            kCGImagePropertyExifDictionary as String: [kCGImagePropertyExifUserComment as String: "secret note"],
            kCGImagePropertyTIFFDictionary as String: [kCGImagePropertyTIFFMake as String: "TestCam"],
        ]
        write(makeImage(width: 40, height: 20), to: url, type: .jpeg, properties: props)
        guard let info = try? ImageCodec.info(url: url), let img = try? ImageCodec.loadImage(url: url) else {
            check(false, "read rotated JPEG"); return
        }
        check(info.width == 20 && info.height == 40, "info() reports oriented size", "\(info.width)×\(info.height)")
        check(img.width == 20 && img.height == 40, "loadImage applies orientation", "\(img.width)×\(img.height)")
        if let analysis = try? Analyzer.analyze(url: url) {
            check(analysis.privacyFacts.contains { $0.kind == .location }, "Findings surfaces GPS location")
            check(analysis.privacyFacts.contains { $0.kind == .device && $0.value.contains("TestCam") },
                  "Findings surfaces camera/device", "\(analysis.privacyFacts.map(\.value))")
            check(analysis.privacyFacts.contains { $0.kind == .orientation }, "Findings surfaces orientation")
        } else {
            check(false, "analyze metadata privacy facts")
        }

        var s = ConvertSettings(); s.format = .png
        if let out = try? ImageConversionService.process(url: url, settings: s) {
            let p = properties(of: out.data)
            check(out.width == 20 && out.height == 40, "convert keeps upright pixels")
            check(p[kCGImagePropertyGPSDictionary as String] == nil, "convert removes GPS by default")
            check((p[kCGImagePropertyOrientation as String] as? Int ?? 1) == 1, "convert does not leave a rotation flag")
        } else { check(false, "convert rotated JPEG→PNG") }

        s.format = .jpeg; s.keepMetadata = true
        if let out = try? ImageConversionService.process(url: url, settings: s) {
            let p = properties(of: out.data)
            check(p[kCGImagePropertyGPSDictionary as String] != nil, "keep-metadata retains GPS")
            check(((p[kCGImagePropertyTIFFDictionary as String] as? [String: Any])?[kCGImagePropertyTIFFMake as String] as? String) == "TestCam", "keep-metadata retains camera make")
            check((p[kCGImagePropertyOrientation as String] as? Int ?? 1) == 1, "keep-metadata drops stale orientation")
            check(out.width == 20 && out.height == 40, "keep-metadata pixels upright")
        } else { check(false, "convert with metadata kept") }

        s.keepMetadata = false
        if let out = try? ImageConversionService.process(url: url, settings: s) {
            let p = properties(of: out.data)
            check(p[kCGImagePropertyGPSDictionary as String] == nil && p[kCGImagePropertyExifDictionary as String].map { ($0 as? [String: Any])?[kCGImagePropertyExifUserComment as String] == nil } ?? true,
                  "JPEG→JPEG without metadata has no GPS or comment")
        }
    }

    private static func transparency(_ dir: URL) {
        let url = dir.appendingPathComponent("alpha.png")
        let space = CGColorSpace(name: CGColorSpace.sRGB)!
        let ctx = CGContext(data: nil, width: 8, height: 8, bitsPerComponent: 8, bytesPerRow: 0, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.clear(CGRect(x: 0, y: 0, width: 8, height: 8))
        write(ctx.makeImage()!, to: url, type: .png)
        var s = ConvertSettings(); s.format = .jpeg; s.background = .white
        if let out = try? ImageConversionService.process(url: url, settings: s), let img = ImageCodec.thumbnail(of: out.data, maxPixel: 8) {
            let p = pixel(img, x: 3, y: 3)
            check(p.r > 240 && p.g > 240 && p.b > 240, "transparent PNG→JPEG flattens onto white", "\(p)")
            check(out.notes.contains(t("note.flattened")), "flatten note is reported")
        } else { check(false, "convert transparent PNG→JPEG") }
        s.background = .black
        if let out = try? ImageConversionService.process(url: url, settings: s), let img = ImageCodec.thumbnail(of: out.data, maxPixel: 8) {
            let p = pixel(img, x: 3, y: 3)
            check(p.r < 15 && p.g < 15 && p.b < 15, "background colour choice is honoured", "\(p)")
        }
        s.format = .png
        if let out = try? ImageConversionService.process(url: url, settings: s), let img = ImageCodec.thumbnail(of: out.data, maxPixel: 8) {
            check(pixel(img, x: 3, y: 3).a == 0, "PNG→PNG keeps transparency")
        }
    }

    private static func resizing(_ dir: URL) {
        func plan(_ w: Int, _ h: Int, _ f: (inout ResizeSettings) -> Void) -> ImageResizeService.Plan {
            var s = ResizeSettings(); f(&s)
            return ImageResizeService.plan(original: (w, h), settings: s)
        }
        var p = plan(2000, 1000) { $0.mode = .percent; $0.percent = 50 }
        check(p.canvasWidth == 1000 && p.canvasHeight == 500, "50% of 2000×1000", "\(p.canvasWidth)×\(p.canvasHeight)")
        p = plan(2000, 1000) { $0.lockAspect = true; $0.driver = .width; $0.width = 800 }
        check(p.canvasWidth == 800 && p.canvasHeight == 400, "locked width 800 → 800×400")
        p = plan(1000, 2000) { $0.lockAspect = true; $0.driver = .width; $0.width = 800 }
        check(p.canvasWidth == 800 && p.canvasHeight == 1600, "locked width follows each image's own ratio")
        p = plan(2000, 1000) { $0.lockAspect = false; $0.width = 1080; $0.height = 1080; $0.fit = .fit }
        check(p.canvasWidth == 1080 && p.canvasHeight == 540, "fit 2000×1000 into 1080² → 1080×540")
        p = plan(2000, 1000) { $0.lockAspect = false; $0.width = 1080; $0.height = 1350; $0.fit = .pad }
        check(p.canvasWidth == 1080 && p.canvasHeight == 1350, "pad gives the exact 1080×1350", "\(p.canvasWidth)×\(p.canvasHeight)")
        check(p.drawRect.width == 1080 && p.drawRect.height == 540 && p.drawRect.minY == 405, "pad centres the whole picture", "\(p.drawRect)")
        p = plan(2000, 1000) { $0.lockAspect = false; $0.width = 1080; $0.height = 1080; $0.fit = .fill }
        check(p.canvasWidth == 1080 && p.canvasHeight == 1080, "fill gives the exact 1080×1080")
        check(p.drawRect.width > 1080 && p.drawRect.height == 1080, "fill crops the overflow", "\(p.drawRect)")
        p = plan(2000, 1000) { $0.lockAspect = false; $0.width = 1080; $0.height = 1080; $0.fit = .fill; $0.anchor = CGPoint(x: 0, y: 0.5) }
        check(p.drawRect.minX == 0, "fill anchored left keeps the left edge", "\(p.drawRect)")
        p = plan(2000, 1000) { $0.lockAspect = false; $0.width = 1080; $0.height = 1080; $0.fit = .fill; $0.anchor = CGPoint(x: 1, y: 0.5) }
        check(abs(p.drawRect.maxX - 1080) < 0.5, "fill anchored right keeps the right edge", "\(p.drawRect)")
        p = plan(2000, 1000) { $0.lockAspect = false; $0.width = 1080; $0.height = 1080; $0.fit = .stretch }
        check(p.canvasWidth == 1080 && p.canvasHeight == 1080, "stretch gives exact size")
        p = plan(500, 500) { $0.lockAspect = true; $0.width = 1000 }
        check(p.enlarges, "enlarging is flagged")
        p = plan(500, 500) { $0.lockAspect = true; $0.width = 1000; $0.neverEnlarge = true }
        check(p.unchanged && p.canvasWidth == 500, "never-enlarge leaves small images alone")

        let url = dir.appendingPathComponent("big.png")
        write(makeImage(width: 300, height: 200), to: url, type: .png)
        var s = ResizeSettings(); s.lockAspect = false; s.width = 100; s.height = 100; s.fit = .fill; s.outputFormat = .jpeg
        if let out = try? ImageResizeService.process(url: url, settings: s) {
            check(out.width == 100 && out.height == 100 && out.format == .jpeg, "resize+fill produces 100×100 JPEG", "\(out.width)×\(out.height)")
            if let img = ImageCodec.thumbnail(of: out.data, maxPixel: 100) {
                check(pixel(img, x: 5, y: 50).r > 180 && pixel(img, x: 95, y: 50).b > 180, "fill keeps both halves of the picture")
            }
        } else { check(false, "resize process") }

        var pad = ResizeSettings(); pad.lockAspect = false; pad.width = 400; pad.height = 200; pad.fit = .pad
        pad.borderAuto = true; pad.outputFormat = .png
        if let out = try? ImageResizeService.process(url: url, settings: pad),
           let img = ImageCodec.thumbnail(of: out.data, maxPixel: 400) {
            check(out.width == 400 && out.height == 200, "pad produces the exact size", "\(out.width)×\(out.height)")
            check(pixel(img, x: 10, y: 100).r > 150 && pixel(img, x: 390, y: 100).b > 150,
                  "auto border continues each side's edge colour", "\(pixel(img, x: 10, y: 100)) \(pixel(img, x: 390, y: 100))")
        } else { check(false, "pad process") }
    }

    private static func compression(_ dir: URL) {
        let url = dir.appendingPathComponent("noisy.png")
        write(makeImage(width: 700, height: 700, noisy: true), to: url, type: .png)
        var s = CompressSettings(); s.format = .jpeg; s.quality = 0.9
        let high = try? ImageCompressionService.process(url: url, settings: s)
        s.quality = 0.3
        let low = try? ImageCompressionService.process(url: url, settings: s)
        check((low?.data.count ?? .max) < (high?.data.count ?? 0), "lower quality gives a smaller file", "\(low?.data.count ?? -1) vs \(high?.data.count ?? -1)")
        s.useTargetSize = true; s.targetKB = 200
        if let out = try? ImageCompressionService.process(url: url, settings: s) {
            check(out.data.count <= 200_000 && out.data.count > 140_000, "target 200 KB lands close below", "\(out.data.count) bytes")
        } else { check(false, "target size compression") }
        s.targetKB = 1
        if let out = try? ImageCompressionService.process(url: url, settings: s) {
            check(!out.notes.isEmpty, "an unreachable target is reported", "\(out.data.count) bytes")
        }
    }

    private static func export(_ dir: URL) {
        let input = dir.appendingPathComponent("photo.png")
        write(makeImage(width: 64, height: 48), to: input, type: .png)
        let out = dir.appendingPathComponent("out"); try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
        var s = ConvertSettings(); s.format = .jpeg; s.suffix = "_x"
        let r1 = ImageExportService.export(input: input, folder: out, suffix: s.suffix) { try ImageConversionService.process(url: $0, settings: s) }
        let r2 = ImageExportService.export(input: input, folder: out, suffix: s.suffix) { try ImageConversionService.process(url: $0, settings: s) }
        check(r1.succeeded && r1.verified && r1.output?.lastPathComponent == "photo_x.jpg", "export writes and verifies", r1.error ?? "\(r1.output?.lastPathComponent ?? "-")")
        check(r2.output?.lastPathComponent == "photo_x 2.jpg", "second export never overwrites", "\(r2.output?.lastPathComponent ?? "-")")
        check(FileManager.default.fileExists(atPath: input.path), "original is untouched")
        let bad = dir.appendingPathComponent("broken.jpg"); try? Data([1, 2, 3, 4]).write(to: bad)
        let r3 = ImageExportService.export(input: bad, folder: out, suffix: "") { try ImageConversionService.process(url: $0, settings: s) }
        check(!r3.succeeded && r3.error != nil, "corrupt input fails with a message", r3.error ?? "")
        let sameName = ImageExportService.export(input: input, folder: dir, suffix: "") { try ImageConversionService.process(url: $0, settings: { var c = ConvertSettings(); c.format = .png; return c }()) }
        check(sameName.output != input && FileManager.default.fileExists(atPath: input.path), "same folder + same name is renamed, not replaced", "\(sameName.output?.lastPathComponent ?? "-")")
    }

    // MARK: Background removal

    /// Straight (non-premultiplied) RGBA bytes of an image built by `BackgroundRemovalService.attach`.
    private static func rawRGBA(_ image: CGImage) -> (bytes: [UInt8], rowBytes: Int)? {
        guard let data = image.dataProvider?.data else { return nil }
        return (Array(CFDataGetBytePtr(data)!.withMemoryRebound(to: UInt8.self, capacity: CFDataGetLength(data)) {
            UnsafeBufferPointer(start: $0, count: CFDataGetLength(data))
        }), image.bytesPerRow)
    }

    private static func backgroundRemoval() {
        let w = 64, h = 48
        let source = makeImage(width: w, height: h, noisy: true)
        // Left third transparent, right third opaque, middle a smooth ramp.
        var mask = [UInt8](repeating: 0, count: w * h)
        for y in 0..<h { for x in 0..<w { mask[y * w + x] = x < w / 3 ? 0 : (x >= 2 * w / 3 ? 255 : UInt8((x - w / 3) * 255 / (w / 3))) } }

        if let cut = BackgroundRemovalService.attach(mask: mask, to: source), let out = rawRGBA(cut),
           let src = rawRGBA(ImageCodec.render(source, width: w, height: h, background: CGColor(gray: 0, alpha: 1))!) {
            check(cut.width == w && cut.height == h, "cut-out keeps the original pixel size")
            var rgbDiff = 0, alphaDiff = 0
            for y in 0..<h { for x in 0..<w {
                let o = y * out.rowBytes + x * 4, s = y * src.rowBytes + x * 4
                for c in 0..<3 { rgbDiff = max(rgbDiff, abs(Int(out.bytes[o + c]) - Int(src.bytes[s + c]))) }
                alphaDiff = max(alphaDiff, abs(Int(out.bytes[o + 3]) - Int(mask[y * w + x])))
            } }
            check(rgbDiff == 0, "background removal leaves subject colors untouched (even where partly transparent)", "max diff \(rgbDiff)")
            check(alphaDiff == 0, "background removal alpha equals the mask", "max diff \(alphaDiff)")
            check(cut.alphaInfo == .last, "cut-out uses straight alpha (no premultiply loss)")
        } else { check(false, "background removal attach") }

        // Edge refinement: off keeps the mask, on smooths a hard edge but never touches distant interior/exterior.
        var hard = [UInt8](repeating: 0, count: 400 * 100)
        for y in 0..<100 { for x in 200..<400 { hard[y * 400 + x] = 255 } }
        check(BackgroundRemovalService.refine(hard, width: 400, height: 100, smoothing: 0) == hard, "edge smoothing 0 keeps the raw mask")
        let smooth = BackgroundRemovalService.refine(hard, width: 400, height: 100, smoothing: 1)
        let ramp = (190..<210).filter { (1...254).contains(Int(smooth[50 * 400 + $0])) }.count
        check(ramp >= 1 && smooth[50 * 400 + 100] == 0 && smooth[50 * 400 + 300] == 255, "edge smoothing anti-aliases only the boundary", "ramp pixels \(ramp)")

        // Format choice follows the fill: transparency needs an alpha-capable format.
        var s = BackgroundRemovalSettings(); s.fill = .transparent; s.format = .jpeg
        check(s.effectiveFormat != .jpeg && s.effectiveFormat.supportsAlpha, "transparent fill never picks JPEG")
        s.fill = .color
        check(s.availableFormats.contains(.jpeg) || !OutputFormat.jpeg.isAvailable, "solid color fill allows JPEG")

        // Every offered transparent format must really keep the alpha channel on this Mac.
        if let cut = BackgroundRemovalService.attach(mask: mask, to: source) {
            for f in BackgroundRemovalSettings().availableFormats {
                let kept = (try? ImageCodec.encode(cut, as: f, quality: 0.9, background: CGColor(gray: 1, alpha: 1)))
                    .flatMap { ImageCodec.thumbnail(of: $0, maxPixel: 64) }.map(ImageCodec.hasAlpha) ?? false
                check(kept, "\(f.displayName) output keeps transparency", "alpha lost")
            }
        }

        // Solid color fill produces an opaque image.
        var fill = BackgroundRemovalSettings(); fill.fill = .color; fill.color = .green
        if let cut = BackgroundRemovalService.attach(mask: mask, to: source),
           let flat = ImageCodec.render(cut, width: w, height: h, background: fill.color.cgColorSRGB) {
            let p = pixel(flat, x: 2, y: 20)
            check(!ImageCodec.hasAlpha(flat) && p.g > 150 && p.r < 100, "solid color replaces the removed background", "\(p)")
        } else { check(false, "solid color fill") }
    }

    private static func advancedTools(_ dir: URL) {
        let input = dir.appendingPathComponent("advanced.jpg")
        let props: [String: Any] = [
            kCGImagePropertyGPSDictionary as String: [kCGImagePropertyGPSLatitude as String: 23.8],
            kCGImagePropertyTIFFDictionary as String: [kCGImagePropertyTIFFMake as String: "Phone"]
        ]
        write(makeImage(width: 120, height: 80), to: input, type: .jpeg, properties: props)

        var redaction = RedactionSettings(); redaction.style = .solid; redaction.format = .png
        let region = SensitiveRegion(kind: .manual, rect: CGRect(x: 0, y: 0, width: 0.5, height: 1), label: "left", confidence: 1)
        if let out = try? RedactionService.process(url: input, regions: [region], settings: redaction),
           let image = ImageCodec.thumbnail(of: out.data, maxPixel: 120) {
            let covered = pixel(image, x: 15, y: 40), untouched = pixel(image, x: 105, y: 40)
            check(covered.r < 50 && untouched.b > 150, "manual solid redaction covers only selected region", "\(covered), \(untouched)")
            check(out.expectMetadataClean == true, "redaction requests metadata verification")
        } else { check(false, "redaction process") }

        // Live preview: blur softens only the marked area, and a higher strength softens it more.
        let noisy = makeImage(width: 300, height: 200, noisy: true)
        let leftHalf = SensitiveRegion(kind: .manual, rect: CGRect(x: 0, y: 0, width: 0.5, height: 1), label: "left", confidence: 1)
        func spread(_ image: CGImage, xs: ClosedRange<Int>) -> Double {
            var values: [Double] = []
            for y in stride(from: 20, to: 180, by: 7) { for x in stride(from: xs.lowerBound, through: xs.upperBound, by: 5) { values.append(Double(pixel(image, x: x, y: y).r)) } }
            let mean = values.reduce(0, +) / Double(values.count)
            return values.reduce(0) { $0 + ($1 - mean) * ($1 - mean) } / Double(values.count)
        }
        var weak = RedactionSettings(); weak.style = .blur; weak.strength = 8
        var strong = RedactionSettings(); strong.style = .blur; strong.strength = 60
        if let a = RedactionService.render(noisy, regions: [leftHalf], settings: weak),
           let b = RedactionService.render(noisy, regions: [leftHalf], settings: strong) {
            let original = spread(noisy, xs: 20...130), weakIn = spread(a, xs: 20...130), strongIn = spread(b, xs: 20...130)
            check(strongIn < weakIn && weakIn < original, "stronger blur softens the region more",
                  "original \(original), weak \(weakIn), strong \(strongIn)")
            check(abs(spread(b, xs: 170...280) - spread(noisy, xs: 170...280)) < 1, "blur leaves the rest of the image untouched")
        } else { check(false, "redaction preview render") }
        check(RedactionService.Level(strength: 10) == .light && RedactionService.Level(strength: 55) == .maximum,
              "strength levels map to words")

        var recipe = ImageRecipe(name: "Test", formatRaw: "jpeg", width: 60, height: 60, targetKB: nil,
                                 quality: 0.8, cleanMetadata: true, suffix: "_recipe")
        recipe.isBuiltIn = false
        if let out = try? RecipeService.process(url: input, recipe: recipe) {
            let p = properties(of: out.data)
            check(out.width == 60 && out.height == 40, "recipe resize keeps aspect and fits bounds", "\(out.width)×\(out.height)")
            check(p[kCGImagePropertyGPSDictionary as String] == nil, "recipe removes GPS")
        } else { check(false, "recipe process") }

        if let out = try? SelectiveMetadataService.process(url: input, removing: [.location]) {
            let p = properties(of: out.data)
            let make = (p[kCGImagePropertyTIFFDictionary as String] as? [String: Any])?[kCGImagePropertyTIFFMake as String] as? String
            check(p[kCGImagePropertyGPSDictionary as String] == nil, "location-only cleaning removes GPS")
            check(make == "Phone", "location-only cleaning keeps device", make ?? "missing")
        } else { check(false, "selective metadata process") }

        var ai = AIImageSettings(); ai.enhance = false; ai.smartCrop = true; ai.cropAspect = .square
        ai.upscale = true; ai.upscaleFactor = 2; ai.format = .png
        if let out = try? AIImageToolsService.process(url: input, settings: ai) {
            check(out.width == 160 && out.height == 160, "smart crop and upscale produce expected dimensions", "\(out.width)×\(out.height)")
        } else { check(false, "local AI crop/upscale") }
    }
}

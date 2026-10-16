import SwiftUI
import Vision
import Accelerate
import CoreGraphics

struct BackgroundRemovalSettings: Equatable {
    enum Fill: String, CaseIterable, Identifiable {
        case transparent, color
        var id: String { rawValue }
    }

    var fill: Fill = .transparent
    /// Used when `fill` is `.color`.
    var color: Color = .white
    var format: OutputFormat = .png
    /// Only applies to lossy formats (HEIC / WebP / JPEG).
    var quality = 0.95
    /// 0 keeps Vision's raw edge; higher values give a smoother, more anti-aliased cut-out edge.
    var edgeSmoothing = 0.4
    var keepMetadata = false
    var suffix = "_nobg"

    /// Formats that can hold the chosen fill: transparency needs an alpha channel, a solid color doesn't.
    var availableFormats: [OutputFormat] {
        OutputFormat.available.filter { fill == .color || $0.supportsAlpha }
    }

    var effectiveFormat: OutputFormat {
        availableFormats.contains(format) ? format : (availableFormats.first ?? .png)
    }
}

enum BackgroundRemovalError: LocalizedError {
    case unsupportedOS
    case noSubject

    var errorDescription: String? {
        switch self {
        case .unsupportedOS: return t("bg.err.unsupported")
        case .noSubject:     return t("bg.err.noSubject")
        }
    }
}

/// Removes the background by adding an alpha channel to the untouched original pixels.
/// The colors and resolution of the subject are never resampled, recolored or recompressed by this step:
/// the only new information is the mask.
enum BackgroundRemovalService {

    static var isSupported: Bool {
        if #available(macOS 14.0, *) { return true }
        return false
    }

    // MARK: Pipeline

    /// The cut-out as a straight-alpha image of the same size and color space as `image`.
    static func cutout(of image: CGImage, settings s: BackgroundRemovalSettings) throws -> CGImage {
        let mask = try subjectMask(for: image)
        let refined = refine(mask, width: image.width, height: image.height, smoothing: s.edgeSmoothing)
        guard let cut = attach(mask: refined, to: image) else { throw ImageToolError.encodeFailed }
        guard s.fill == .color else { return cut }
        guard let flat = ImageCodec.render(cut, width: cut.width, height: cut.height, background: s.color.cgColorSRGB) else {
            throw ImageToolError.encodeFailed
        }
        return flat
    }

    static func process(url: URL, settings s: BackgroundRemovalSettings) throws -> ProcessedImage {
        let info = try ImageCodec.info(url: url)
        let image = try ImageCodec.loadImage(url: url)
        let cut = try cutout(of: image, settings: s)
        let format = s.effectiveFormat
        let data = try ImageCodec.encode(cut, as: format, quality: format.isLossy ? s.quality : nil,
                                         background: s.color.cgColorSRGB,
                                         keepProperties: s.keepMetadata ? info.properties : nil)
        // Never hand back a file that silently lost its transparency (e.g. an encoder that drops alpha).
        if s.fill == .transparent, let check = ImageCodec.thumbnail(of: data, maxPixel: 64), !ImageCodec.hasAlpha(check) {
            throw ImageToolError.encodeFailed
        }
        var notes = [t("bg.note.removed")]
        if info.isAnimated { notes.append(t("note.animated")) }
        if format.isLossy { notes.append(t("bg.note.lossy", format.displayName)) }
        return ProcessedImage(data: data, format: format, width: cut.width, height: cut.height, notes: notes,
                              expectMetadataClean: !s.keepMetadata)
    }

    /// Fast, reduced-size version of the same cut-out for the live before/after view.
    static func preview(url: URL, settings s: BackgroundRemovalSettings) throws -> CGImage {
        try cutout(of: try ImageCodec.loadImage(url: url, maxPixel: 1100), settings: s)
    }

    // MARK: Subject mask

    /// One byte per pixel (255 = subject), exactly `image.width × image.height`.
    static func subjectMask(for image: CGImage) throws -> [UInt8] {
        guard #available(macOS 14.0, *) else { throw BackgroundRemovalError.unsupportedOS }
        let request = VNGenerateForegroundInstanceMaskRequest()
        let handler = VNImageRequestHandler(cgImage: image)
        try handler.perform([request])
        guard let observation = request.results?.first, !observation.allInstances.isEmpty else {
            throw BackgroundRemovalError.noSubject
        }
        let buffer = try observation.generateScaledMaskForImage(forInstances: observation.allInstances, from: handler)
        return try bytes(of: buffer, width: image.width, height: image.height)
    }

    private static func bytes(of buffer: CVPixelBuffer, width: Int, height: Int) throws -> [UInt8] {
        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(buffer) else { throw ImageToolError.encodeFailed }
        let w = CVPixelBufferGetWidth(buffer), h = CVPixelBufferGetHeight(buffer)
        let rowBytes = CVPixelBufferGetBytesPerRow(buffer)
        var out = [UInt8](repeating: 0, count: w * h)
        switch CVPixelBufferGetPixelFormatType(buffer) {
        case kCVPixelFormatType_OneComponent32Float:
            for y in 0..<h {
                let row = base.advanced(by: y * rowBytes).assumingMemoryBound(to: Float.self)
                for x in 0..<w { out[y * w + x] = UInt8(max(0, min(255, (row[x] * 255).rounded()))) }
            }
        case kCVPixelFormatType_OneComponent8:
            for y in 0..<h {
                let row = base.advanced(by: y * rowBytes).assumingMemoryBound(to: UInt8.self)
                for x in 0..<w { out[y * w + x] = row[x] }
            }
        default:
            throw ImageToolError.encodeFailed
        }
        return (w == width && h == height) ? out : try resample(out, from: (w, h), to: (width, height))
    }

    private static func resample(_ plane: [UInt8], from: (Int, Int), to: (Int, Int)) throws -> [UInt8] {
        var input = plane
        var output = [UInt8](repeating: 0, count: to.0 * to.1)
        let status: vImage_Error = input.withUnsafeMutableBytes { src in
            output.withUnsafeMutableBytes { dst in
                var s = vImage_Buffer(data: src.baseAddress, height: vImagePixelCount(from.1), width: vImagePixelCount(from.0), rowBytes: from.0)
                var d = vImage_Buffer(data: dst.baseAddress, height: vImagePixelCount(to.1), width: vImagePixelCount(to.0), rowBytes: to.0)
                return vImageScale_Planar8(&s, &d, nil, vImage_Flags(kvImageHighQualityResampling))
            }
        }
        guard status == kvImageNoError else { throw ImageToolError.encodeFailed }
        return output
    }

    // MARK: Edge refinement

    /// Softens the mask edge slightly and then re-steepens it, which gives a clean anti-aliased boundary
    /// without halos or jagged steps. The blur radius grows with large images so preview and export look alike.
    static func refine(_ mask: [UInt8], width: Int, height: Int, smoothing: Double) -> [UInt8] {
        let sigma = max(0, smoothing) * max(1, Double(max(width, height)) / 2000)
        let kernel = Int((sigma * 4.9).rounded()) | 1   // tent filter ≈ Gaussian, odd width
        guard kernel >= 3 else { return mask }
        var input = mask
        var output = [UInt8](repeating: 0, count: mask.count)
        let status: vImage_Error = input.withUnsafeMutableBytes { src in
            output.withUnsafeMutableBytes { dst in
                var s = vImage_Buffer(data: src.baseAddress, height: vImagePixelCount(height), width: vImagePixelCount(width), rowBytes: width)
                var d = vImage_Buffer(data: dst.baseAddress, height: vImagePixelCount(height), width: vImagePixelCount(width), rowBytes: width)
                return vImageTentConvolve_Planar8(&s, &d, nil, 0, 0, UInt32(kernel), UInt32(kernel), 0, vImage_Flags(kvImageEdgeExtend))
            }
        }
        guard status == kvImageNoError else { return mask }
        let steepen: [UInt8] = (0..<256).map { UInt8(max(0, min(255, ((Double($0) - 127.5) * 2 + 127.5).rounded()))) }
        for i in output.indices { output[i] = steepen[Int(output[i])] }
        return output
    }

    // MARK: Compositing

    /// Returns `image` with `mask` as its alpha channel. RGB values are copied unchanged (straight alpha,
    /// no premultiplication loss); an alpha channel the image already had is multiplied in.
    static func attach(mask: [UInt8], to image: CGImage) -> CGImage? {
        let w = image.width, h = image.height
        guard mask.count == w * h else { return nil }
        let rgb: CGColorSpace = {
            if let cs = image.colorSpace, cs.model == .rgb { return cs }
            return CGColorSpace(name: CGColorSpace.sRGB)!
        }()
        let layout = CGImageAlphaInfo.premultipliedLast.rawValue
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: rgb, bitmapInfo: layout),
              let pixels = ctx.data else { return nil }
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))

        let rowBytes = ctx.bytesPerRow
        var straight = [UInt8](repeating: 0, count: rowBytes * h)
        let status: vImage_Error = straight.withUnsafeMutableBytes { dst in
            var s = vImage_Buffer(data: pixels, height: vImagePixelCount(h), width: vImagePixelCount(w), rowBytes: rowBytes)
            var d = vImage_Buffer(data: dst.baseAddress, height: vImagePixelCount(h), width: vImagePixelCount(w), rowBytes: rowBytes)
            return vImageUnpremultiplyData_RGBA8888(&s, &d, vImage_Flags(kvImageNoFlags))
        }
        guard status == kvImageNoError else { return nil }

        let opaque = !ImageCodec.hasAlpha(image)
        for y in 0..<h {
            for x in 0..<w {
                let a = y * rowBytes + x * 4 + 3
                let m = Int(mask[y * w + x])
                straight[a] = opaque ? UInt8(m) : UInt8((Int(straight[a]) * m + 127) / 255)
            }
        }
        guard let provider = CGDataProvider(data: Data(straight) as CFData) else { return nil }
        return CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: rowBytes, space: rgb,
                       bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.last.rawValue), provider: provider,
                       decode: nil, shouldInterpolate: false, intent: .defaultIntent)
    }
}

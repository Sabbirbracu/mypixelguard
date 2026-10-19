import SwiftUI
import CoreImage
import Vision

enum CropAspect: String, CaseIterable, Identifiable {
    case square, portrait, landscape
    var id: String { rawValue }
    var ratio: CGFloat {
        switch self { case .square: 1; case .portrait: 4.0 / 5.0; case .landscape: 16.0 / 9.0 }
    }
}

struct AIImageSettings {
    /// True when at least one image tool is switched on.
    var hasTool: Bool { enhance || upscale || smartCrop || removeBackground }
    var enhance = true
    var upscale = false
    var upscaleFactor = 2
    var smartCrop = false
    var cropAspect: CropAspect = .square
    var removeBackground = false
    var format: OutputFormat? = nil
    var quality = 0.92
    var cleanMetadata = true
    var suffix = "_enhanced"
}

enum AIImageToolsService {
    /// A reduced-size render of the enabled tools for the live before/after.
    /// Upscale is left out of the pixels (it only adds detail-free size) and reported through `finalWidth`/`finalHeight`.
    struct Preview {
        var image: CGImage
        var finalWidth: Int
        var finalHeight: Int
        var notes: [String]
    }

    static func preview(url: URL, settings s: AIImageSettings, maxPixel: Int = 900) throws -> Preview {
        let info = try ImageCodec.info(url: url)
        let source = try ImageCodec.loadImage(url: url, maxPixel: maxPixel)
        let (image, notes) = apply(s, to: source, includeUpscale: false)
        guard let output = CIContext().createCGImage(image, from: image.extent.integral) else { throw ImageToolError.encodeFailed }
        let scale = Double(info.width) / Double(max(source.width, 1))
        let factor = s.upscale ? Double(max(2, min(s.upscaleFactor, 4))) : 1
        // Without a crop the final size is exact; with one it is scaled up from the reduced render.
        let width = s.smartCrop ? Double(output.width) * scale : Double(info.width)
        let height = s.smartCrop ? Double(output.height) * scale : Double(info.height)
        return Preview(image: output,
                       finalWidth: Int((width * factor).rounded()),
                       finalHeight: Int((height * factor).rounded()),
                       notes: notes)
    }

    static func process(url: URL, settings s: AIImageSettings) throws -> ProcessedImage {
        let info = try ImageCodec.info(url: url)
        let source = try ImageCodec.loadImage(url: url)
        var (image, notes) = apply(s, to: source, includeUpscale: true)

        let context = CIContext()
        let extent = image.extent.integral
        guard let output = context.createCGImage(image, from: extent) else { throw ImageToolError.encodeFailed }
        var format = s.format ?? ImageCodec.sameFormat(as: info)
        if s.removeBackground, format == .jpeg { format = .png }
        let data = try ImageCodec.encode(output, as: format, quality: format.isLossy ? s.quality : nil,
                                         background: CGColor(gray: 1, alpha: 1),
                                         keepProperties: s.cleanMetadata ? nil : info.properties)
        if s.cleanMetadata { notes.append(t("studio.note.metadata")) }
        return ProcessedImage(data: data, format: format, width: output.width, height: output.height, notes: notes,
                              expectMetadataClean: s.cleanMetadata)
    }

    private static func apply(_ s: AIImageSettings, to source: CGImage, includeUpscale: Bool) -> (CIImage, [String]) {
        var image = CIImage(cgImage: source)
        var notes: [String] = []

        if s.smartCrop {
            let crop = salientCrop(image: source, ratio: s.cropAspect.ratio)
            image = image.cropped(to: crop).transformed(by: .init(translationX: -crop.minX, y: -crop.minY))
            notes.append(t("ai.note.crop"))
        }
        if s.enhance {
            for filter in image.autoAdjustmentFilters(options: [.enhance: true, .redEye: false]) {
                filter.setValue(image, forKey: kCIInputImageKey)
                if let output = filter.outputImage { image = output }
            }
            notes.append(t("ai.note.enhanced"))
        }
        if s.removeBackground {
            if #available(macOS 14.0, *), let masked = foregroundOnly(image: image) {
                image = masked
                notes.append(t("ai.note.background"))
            } else {
                notes.append(t("ai.note.backgroundUnavailable"))
            }
        }
        if s.upscale, includeUpscale {
            let factor = CGFloat(max(2, min(s.upscaleFactor, 4)))
            let filter = CIFilter(name: "CILanczosScaleTransform")
            filter?.setValue(image, forKey: kCIInputImageKey)
            filter?.setValue(factor, forKey: kCIInputScaleKey)
            filter?.setValue(1, forKey: kCIInputAspectRatioKey)
            if let output = filter?.outputImage { image = output }
            notes.append(t("ai.note.upscaled", Int(factor)))
        }
        return (image, notes)
    }

    private static func salientCrop(image: CGImage, ratio: CGFloat) -> CGRect {
        let bounds = CGRect(x: 0, y: 0, width: image.width, height: image.height)
        let request = VNGenerateAttentionBasedSaliencyImageRequest()
        try? VNImageRequestHandler(cgImage: image).perform([request])
        let normalized = request.results?.first?.salientObjects?.reduce(CGRect.null) { $0.union($1.boundingBox) }
        let focus: CGPoint
        if let normalized, !normalized.isNull {
            focus = CGPoint(x: normalized.midX * bounds.width, y: normalized.midY * bounds.height)
        } else { focus = CGPoint(x: bounds.midX, y: bounds.midY) }
        var width = bounds.width, height = width / ratio
        if height > bounds.height { height = bounds.height; width = height * ratio }
        width = floor(width); height = floor(height)
        let x = min(max((focus.x - width / 2).rounded(), 0), bounds.width - width)
        let y = min(max((focus.y - height / 2).rounded(), 0), bounds.height - height)
        return CGRect(x: x, y: y, width: width, height: height)
    }

    @available(macOS 14.0, *)
    private static func foregroundOnly(image: CIImage) -> CIImage? {
        let request = VNGenerateForegroundInstanceMaskRequest()
        let handler = VNImageRequestHandler(ciImage: image)
        guard (try? handler.perform([request])) != nil,
              let observation = request.results?.first,
              let maskBuffer = try? observation.generateScaledMaskForImage(forInstances: observation.allInstances, from: handler) else { return nil }
        let mask = CIImage(cvPixelBuffer: maskBuffer)
        let clear = CIImage(color: .clear).cropped(to: image.extent)
        let filter = CIFilter(name: "CIBlendWithMask")
        filter?.setValue(image, forKey: kCIInputImageKey)
        filter?.setValue(clear, forKey: kCIInputBackgroundImageKey)
        filter?.setValue(mask, forKey: kCIInputMaskImageKey)
        return filter?.outputImage?.cropped(to: image.extent)
    }
}

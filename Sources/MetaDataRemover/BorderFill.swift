import CoreGraphics

/// Border colours that continue the picture's own edge, for the empty space "Fit" leaves around an image.
/// Colours are sampled along the two edges next to the bars, so the border blends in instead of looking like a stripe.
struct BorderSamples {
    /// Along the first edge (left or top), in drawing order.
    var start: [CGColor]
    /// Along the opposite edge (right or bottom).
    var end: [CGColor]
}

enum BorderFill {
    enum Bars {
        /// Empty space at the left and right.
        case sides
        /// Empty space at the top and bottom.
        case topBottom
    }

    static func bars(for plan: ImageResizeService.Plan) -> Bars? {
        if plan.drawRect.width < Double(plan.canvasWidth) - 0.5 { return .sides }
        if plan.drawRect.height < Double(plan.canvasHeight) - 0.5 { return .topBottom }
        return nil
    }

    static func samples(of image: CGImage, bars: Bars, count: Int = 12) -> BorderSamples? {
        let n = 96
        guard let ctx = CGContext(data: nil, width: n, height: n, bitsPerComponent: 8, bytesPerRow: n * 4,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
              let data = ctx.data else { return nil }
        ctx.setFillColor(CGColor(gray: 1, alpha: 1))
        ctx.fill(CGRect(x: 0, y: 0, width: n, height: n))
        ctx.interpolationQuality = .medium
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: n, height: n))
        let px = data.bindMemory(to: UInt8.self, capacity: n * n * 4)

        // Row 0 of the buffer is the top of the picture.
        func average(_ points: [(x: Int, y: Int)]) -> CGColor {
            var r = 0.0, g = 0.0, b = 0.0
            for p in points {
                let i = (p.y * n + p.x) * 4
                r += Double(px[i]); g += Double(px[i + 1]); b += Double(px[i + 2])
            }
            let k = Double(max(points.count, 1)) * 255
            return CGColor(srgbRed: r / k, green: g / k, blue: b / k, alpha: 1)
        }
        let step = max(n / count, 1)
        func along(_ edge: (Int) -> [(x: Int, y: Int)]) -> [CGColor] {
            (0..<count).map { i in average((i * step..<min((i + 1) * step, n)).flatMap(edge)) }
        }
        switch bars {
        case .sides:
            return BorderSamples(start: along { y in [(0, y), (1, y)] }, end: along { y in [(n - 1, y), (n - 2, y)] })
        case .topBottom:
            return BorderSamples(start: along { x in [(x, 0), (x, 1)] }, end: along { x in [(x, n - 1), (x, n - 2)] })
        }
    }

    /// An opaque canvas whose empty space is filled from `samples`, with the picture drawn on top.
    static func renderPadded(_ image: CGImage, width: Int, height: Int, drawRect: CGRect,
                             bars: Bars, samples: BorderSamples) -> CGImage? {
        let space: CGColorSpace = {
            if let cs = image.colorSpace, cs.model == .rgb { return cs }
            return CGColorSpace(name: CGColorSpace.sRGB)!
        }()
        guard let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
        ctx.interpolationQuality = .high
        let w = CGFloat(width), h = CGFloat(height)

        func fill(_ rect: CGRect, colors: [CGColor], from: CGPoint, to: CGPoint) {
            guard rect.width > 0.5, rect.height > 0.5 else { return }
            let srgb = CGColorSpace(name: CGColorSpace.sRGB)!
            guard let gradient = CGGradient(colorsSpace: srgb, colors: colors as CFArray, locations: nil) else { return }
            ctx.saveGState()
            ctx.clip(to: rect)
            ctx.drawLinearGradient(gradient, start: from, end: to, options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
            ctx.restoreGState()
        }
        switch bars {
        case .sides:
            // Top of the picture is the highest y.
            let down: (CGPoint, CGPoint) = (CGPoint(x: 0, y: h), CGPoint(x: 0, y: 0))
            fill(CGRect(x: 0, y: 0, width: drawRect.minX, height: h), colors: samples.start, from: down.0, to: down.1)
            fill(CGRect(x: drawRect.maxX, y: 0, width: w - drawRect.maxX, height: h), colors: samples.end, from: down.0, to: down.1)
        case .topBottom:
            let across: (CGPoint, CGPoint) = (CGPoint(x: 0, y: 0), CGPoint(x: w, y: 0))
            fill(CGRect(x: 0, y: drawRect.maxY, width: w, height: h - drawRect.maxY), colors: samples.start, from: across.0, to: across.1)
            fill(CGRect(x: 0, y: 0, width: w, height: drawRect.minY), colors: samples.end, from: across.0, to: across.1)
        }
        ctx.draw(image, in: drawRect)
        return ctx.makeImage()
    }
}

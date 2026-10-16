import AppKit

/// Original vector interpretation of the supplied MyPixelGuard board.
/// Shared geometry keeps the UI mark, Dock icon, and exported assets consistent.
enum BrandArtwork {
    enum Command {
        case move(CGFloat, CGFloat), line(CGFloat, CGFloat)
        case curve(CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat)
        case close
    }

    private static let shield: [Command] = [
        .move(46, 8), .line(64, 15), .line(64, 25), .line(46, 18),
        .line(18, 29), .line(18, 49),
        .curve(18, 68, 27, 82, 46, 91),
        .curve(65, 82, 74, 68, 74, 49),
        .line(74, 38), .line(84, 38), .line(84, 49),
        .curve(84, 73, 71, 91, 46, 102),
        .curve(21, 91, 8, 73, 8, 49),
        .line(8, 22), .close
    ]
    private static let pixels: [CGRect] = [
        CGRect(x: 65, y: 5, width: 7, height: 7),
        CGRect(x: 77, y: 15, width: 8, height: 8),
        CGRect(x: 90, y: 8, width: 7, height: 7),
        CGRect(x: 65, y: 26, width: 10, height: 10),
        CGRect(x: 87, y: 26, width: 7, height: 7)
    ]

    private static func blade(_ index: Int) -> [Command] {
        func point(_ i: Int, radius: CGFloat, rotation: CGFloat) -> CGPoint {
            let angle = CGFloat(i) * .pi / 3 + rotation
            return CGPoint(x: 46 + cos(angle) * radius, y: 54 + sin(angle) * radius)
        }
        // A twisted inner hexagon creates the open camera aperture.
        let points = [point(index, radius: 24, rotation: -.pi / 2),
                      point(index + 1, radius: 24, rotation: -.pi / 2),
                      point(index + 1, radius: 10, rotation: -.pi / 6),
                      point(index, radius: 10, rotation: -.pi / 6)]
        return [.move(points[0].x, points[0].y)] + points.dropFirst().map { .line($0.x, $0.y) } + [.close]
    }

    private static func bladeColors(dark: Bool) -> [UInt32] {
        dark ? [0xFF7A00, 0xF8FAFC, 0xDCE4ED, 0x6B7280, 0xD95700, 0xFF9829]
             : [0xD95700, 0x111827, 0x293445, 0x526174, 0x8C3600, 0xFF7A00]
    }

    static func color(_ hex: UInt32) -> NSColor {
        NSColor(srgbRed: CGFloat((hex >> 16) & 255) / 255,
                green: CGFloat((hex >> 8) & 255) / 255,
                blue: CGFloat(hex & 255) / 255, alpha: 1)
    }

    private static func path(_ commands: [Command]) -> NSBezierPath {
        let p = NSBezierPath()
        for command in commands {
            switch command {
            case let .move(x, y): p.move(to: CGPoint(x: x, y: y))
            case let .line(x, y): p.line(to: CGPoint(x: x, y: y))
            case let .curve(x1, y1, x2, y2, x, y):
                p.curve(to: CGPoint(x: x, y: y), controlPoint1: CGPoint(x: x1, y: y1), controlPoint2: CGPoint(x: x2, y: y2))
            case .close: p.close()
            }
        }
        return p
    }

    /// Coordinates start at the top left.
    static func drawMark(in rect: CGRect, dark: Bool) {
        NSGraphicsContext.saveGraphicsState()
        let transform = NSAffineTransform()
        transform.translateX(by: rect.minX, yBy: rect.minY)
        transform.scaleX(by: rect.width / 108, yBy: rect.height / 108)
        transform.concat()
        let gradient = NSGradient(starting: color(0xFF9829), ending: color(0xFF7A00))!
        gradient.draw(in: path(shield), angle: 70)
        for pixel in pixels { gradient.draw(in: NSBezierPath(rect: pixel), angle: 70) }
        let colors = bladeColors(dark: dark)
        for index in 0..<6 {
            color(colors[index]).setFill()
            path(blade(index)).fill()
        }
        NSGraphicsContext.restoreGraphicsState()
    }

    static func mark(dark: Bool) -> NSImage {
        NSImage(size: NSSize(width: 108, height: 108), flipped: true) { rect in
            drawMark(in: rect, dark: dark)
            return true
        }
    }

    static func drawIcon(in rect: CGRect) {
        let body = rect.insetBy(dx: rect.width * 0.055, dy: rect.height * 0.055)
        let background = NSBezierPath(roundedRect: body, xRadius: body.width * 0.225, yRadius: body.height * 0.225)
        NSGradient(starting: color(0x192333), ending: color(0x080D14))!.draw(in: background, angle: 75)
        color(0x293445).setStroke()
        background.lineWidth = max(0.5, rect.width / 600)
        background.stroke()
        drawMark(in: body.insetBy(dx: body.width * 0.14, dy: body.height * 0.14), dark: true)
    }

    static func png(size: Int, icon: Bool, dark: Bool = false) -> Data {
        let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
                                  bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
                                  isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        let context = NSGraphicsContext(bitmapImageRep: rep)!
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = context
        context.cgContext.translateBy(x: 0, y: CGFloat(size))
        context.cgContext.scaleBy(x: 1, y: -1)
        let rect = CGRect(x: 0, y: 0, width: size, height: size)
        if icon { drawIcon(in: rect) } else { drawMark(in: rect, dark: dark) }
        NSGraphicsContext.restoreGraphicsState()
        return rep.representation(using: .png, properties: [:])!
    }

    static func svg(dark: Bool) -> String {
        func data(_ commands: [Command]) -> String {
            commands.map { command in
                switch command {
                case let .move(x, y): return "M\(x),\(y)"
                case let .line(x, y): return "L\(x),\(y)"
                case let .curve(x1, y1, x2, y2, x, y): return "C\(x1),\(y1) \(x2),\(y2) \(x),\(y)"
                case .close: return "Z"
                }
            }.joined(separator: " ")
        }
        var elements = ["<path fill=\"url(#orange)\" d=\"\(data(shield))\"/>"]
        elements += pixels.map { "<rect fill=\"url(#orange)\" x=\"\($0.minX)\" y=\"\($0.minY)\" width=\"\($0.width)\" height=\"\($0.height)\"/>" }
        let colors = bladeColors(dark: dark)
        elements += (0..<6).map { "<path fill=\"\(String(format: "#%06X", colors[$0]))\" d=\"\(data(blade($0)))\"/>" }
        return """
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" role="img" aria-labelledby="title">
          <title id="title">MyPixelGuard — shield, aperture and pixels</title>
          <defs><linearGradient id="orange" x1="0" y1="0" x2="0.35" y2="1"><stop stop-color="#FF9829"/><stop offset="1" stop-color="#FF7A00"/></linearGradient></defs>
          \(elements.joined(separator: "\n  "))
        </svg>
        """
    }
}

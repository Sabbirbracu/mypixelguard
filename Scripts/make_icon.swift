// Compile together with BrandArtwork.swift. See build_app.sh.
import AppKit

@main
struct MakeBrandAssets {
    static func main() throws {
        guard CommandLine.arguments.count == 3 else {
            fatalError("Usage: make-brand-assets <out.iconset> <brand-assets-directory>")
        }
        let iconset = URL(fileURLWithPath: CommandLine.arguments[1])
        let assets = URL(fileURLWithPath: CommandLine.arguments[2])
        for directory in [iconset, assets] {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        }
        let names: [(String, Int)] = [
            ("icon_16x16", 16), ("icon_16x16@2x", 32), ("icon_32x32", 32), ("icon_32x32@2x", 64),
            ("icon_128x128", 128), ("icon_128x128@2x", 256), ("icon_256x256", 256), ("icon_256x256@2x", 512),
            ("icon_512x512", 512), ("icon_512x512@2x", 1024)
        ]
        for (name, pixels) in names {
            try BrandArtwork.png(size: pixels, icon: true).write(to: iconset.appendingPathComponent(name + ".png"))
        }
        try BrandArtwork.png(size: 1024, icon: true).write(to: assets.appendingPathComponent("MyPixelGuard-AppIcon.png"))
        for (name, dark) in [("MyPixelGuard-Mark-Light", false), ("MyPixelGuard-Mark-Dark", true)] {
            try BrandArtwork.png(size: 1024, icon: false, dark: dark).write(to: assets.appendingPathComponent(name + ".png"))
            try BrandArtwork.svg(dark: dark).write(to: assets.appendingPathComponent(name + ".svg"), atomically: true, encoding: .utf8)
        }
    }
}

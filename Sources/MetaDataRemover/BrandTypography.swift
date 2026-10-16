import SwiftUI
import CoreText

/// Sora is bundled for offline use. System fonts supply missing glyphs, including Bangla.
enum BrandTypography {
    private static let registered: Void = {
        // Packaged apps keep resources under Contents/Resources; SwiftPM's default
        // accessor otherwise looks beside the executable or in the developer's build tree.
        let resources = Bundle.main.url(forResource: "MetaDataRemover_MetaDataRemover", withExtension: "bundle")
            .flatMap { Bundle(url: $0) } ?? Bundle.module
        for weight in ["Regular", "SemiBold", "Bold"] {
            if let url = resources.url(forResource: "Sora-\(weight)", withExtension: "ttf", subdirectory: "Fonts") {
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
        }
    }()

    static func font(size: CGFloat, weight: Font.Weight = .regular) -> Font {
        _ = registered
        let name = weight == .bold || weight == .heavy ? "Sora-Bold" : weight == .semibold || weight == .medium ? "Sora-SemiBold" : "Sora-Regular"
        return .custom(name, size: size)
    }
}

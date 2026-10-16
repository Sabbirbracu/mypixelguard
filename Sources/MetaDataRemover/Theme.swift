import SwiftUI
import AppKit

/// MyPixelGuard palette, with accessible foregrounds for both appearances.
enum Theme {
    static let orange = Color(hex: 0xFF7A00)
    static let ink = Color(light: 0x111827, dark: 0xF8FAFC)
    static let secondary = Color(light: 0x6B7280, dark: 0xA6AFBD)
    static let canvas = Color(light: 0xF8FAFC, dark: 0x0B111B)
    static let surface = Color(light: 0xFFFFFF, dark: 0x111827)
    static let sidebar = Color(light: 0xF1F5F9, dark: 0x0E1521)
    static let border = Color(light: 0xE2E8F0, dark: 0x293445)
    static let elevatedBorder = Color(light: 0xD8E0EA, dark: 0x344155)
    static let accentText = Color(light: 0xAD4900, dark: 0xFF9A3D)
    static let info = Color(light: 0x526174, dark: 0xA6AFBD)
    static let success = Color(light: 0x1E8E3E, dark: 0x4CC074)
    static let danger = Color(light: 0xC62828, dark: 0xFF6B6B)
    static let warning = Color(light: 0xB26A00, dark: 0xF5B84B)

    /// Navy text on brand orange keeps primary buttons readable in either appearance.
    static let onAccent = Color(hex: 0x111827)
}

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255)
    }

    init(light: UInt32, dark: UInt32) {
        self.init(nsColor: NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
            let hex = isDark ? dark : light
            return NSColor(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
                           green: CGFloat((hex >> 8) & 0xFF) / 255,
                           blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
        })
    }
}

// MARK: - Buttons

struct BrandPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.callout.weight(.semibold))
            .foregroundStyle(isEnabled ? Theme.onAccent : Theme.secondary)
            .padding(.horizontal, 16).padding(.vertical, 9)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(isEnabled ? Theme.orange.opacity(configuration.isPressed ? 0.78 : 1) : Theme.secondary.opacity(0.18))
            )
            .shadow(color: isEnabled ? Theme.orange.opacity(0.16) : .clear, radius: 6, y: 2)
    }
}

/// The one main action on a screen: taller and wider than the regular primary button.
struct BrandLargePrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(BrandTypography.font(size: 16, weight: .semibold))
            .foregroundStyle(isEnabled ? Theme.onAccent : Theme.secondary)
            .padding(.horizontal, 30).padding(.vertical, 14)
            .frame(minWidth: 260)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(isEnabled ? Theme.orange.opacity(configuration.isPressed ? 0.8 : 1) : Theme.secondary.opacity(0.18))
            )
            .shadow(color: isEnabled ? Theme.orange.opacity(0.28) : .clear, radius: 10, y: 4)
    }
}

struct BrandSecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.callout.weight(.medium))
            .foregroundStyle(isEnabled ? Theme.ink : Theme.secondary)
            .padding(.horizontal, 12).padding(.vertical, 7)
            .background(RoundedRectangle(cornerRadius: 9).fill(Theme.surface.opacity(configuration.isPressed ? 0.62 : 1)))
            .overlay(RoundedRectangle(cornerRadius: 9).stroke(isEnabled ? Theme.elevatedBorder : Theme.border))
    }
}

extension ButtonStyle where Self == BrandPrimaryButtonStyle {
    static var brandPrimary: BrandPrimaryButtonStyle { BrandPrimaryButtonStyle() }
}

extension ButtonStyle where Self == BrandLargePrimaryButtonStyle {
    static var brandPrimaryLarge: BrandLargePrimaryButtonStyle { BrandLargePrimaryButtonStyle() }
}

extension ButtonStyle where Self == BrandSecondaryButtonStyle {
    static var brandSecondary: BrandSecondaryButtonStyle { BrandSecondaryButtonStyle() }
}

// MARK: - Cards, chips, titles

struct Card: ViewModifier {
    var padding: CGFloat = 18
    @Environment(\.colorScheme) private var colorScheme
    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.surface))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.border))
            .shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.035), radius: 10, y: 3)
    }
}

extension View {
    func card(padding: CGFloat = 18) -> some View { modifier(Card(padding: padding)) }
}

struct Chip: View {
    let text: String
    var color: Color = Theme.secondary
    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 9).padding(.vertical, 4)
            .background(Capsule().fill(color.opacity(0.15)))
            .foregroundStyle(color)
    }
}

struct SectionTitle: View {
    let text: String
    var body: some View { Text(text).font(.headline) }
}

// MARK: - Logo

/// Vector artwork shared with the icon/export generator; crisp at every size.
struct BrandMark: View {
    @Environment(\.colorScheme) private var colorScheme
    var size: CGFloat = 48

    var body: some View {
        Image(nsImage: BrandArtwork.mark(dark: colorScheme == .dark))
            .resizable()
            .interpolation(.high)
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

struct BrandLogo: View {
    var height: CGFloat = 40

    var body: some View {
        HStack(spacing: height * 0.14) {
            BrandMark(size: height)
            (Text("MyPixel").foregroundColor(Theme.ink) + Text("Guard").foregroundColor(Theme.orange))
                .font(BrandTypography.font(size: height * 0.43, weight: .bold))
                .tracking(-height * 0.015)
                .fixedSize()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("MyPixelGuard")
    }
}

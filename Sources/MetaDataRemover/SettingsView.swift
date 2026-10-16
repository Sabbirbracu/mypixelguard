import SwiftUI

enum AppearanceMode: String, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var title: String { t("appearance.\(rawValue)") }
    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

struct SettingsView: View {
    @EnvironmentObject var lang: LanguageManager
    @AppStorage("appearanceMode") private var appearance = AppearanceMode.system.rawValue

    var body: some View {
        TabView {
            general
                .tabItem { Label(t("settings.general"), systemImage: "gearshape") }
            privacy
                .tabItem { Label(t("settings.privacy"), systemImage: "lock.shield") }
        }
        .frame(width: 520, height: 360)
        .background(Theme.canvas)
        .font(BrandTypography.font(size: 13))
        .foregroundStyle(Theme.ink)
        .tint(Theme.orange)
        .id(lang.code)
    }

    private var general: some View {
        Form {
            Picker(t("settings.language"), selection: $lang.code) {
                ForEach(Localizer.languages) { Text($0.nativeName).tag($0.code) }
            }
            .pickerStyle(.radioGroup)
            Text(t("settings.language.note")).font(.caption).foregroundStyle(Theme.secondary)

            Divider()

            Picker(t("settings.appearance"), selection: $appearance) {
                ForEach(AppearanceMode.allCases) { Text($0.title).tag($0.rawValue) }
            }
            .pickerStyle(.segmented)
        }
        .padding(24)
    }

    private var privacy: some View {
        VStack(alignment: .leading, spacing: 12) {
            BrandLogo(height: 44)
            Text(t("brand.tagline")).font(.caption).foregroundStyle(Theme.secondary)
            Text(t("settings.privacy.title")).font(.headline)
            Text(t("settings.privacy.body")).foregroundStyle(Theme.secondary).fixedSize(horizontal: false, vertical: true)
            Spacer()
            Text(t("settings.version", Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev"))
                .font(.caption).foregroundStyle(Theme.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(24)
    }
}

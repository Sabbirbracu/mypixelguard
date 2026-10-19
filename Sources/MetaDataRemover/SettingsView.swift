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
    @ObservedObject private var services = AppServices.shared

    var body: some View {
        TabView {
            general
                .tabItem { Label(t("settings.general"), systemImage: "gearshape") }
            privacy
                .tabItem { Label(t("settings.privacy"), systemImage: "lock.shield") }
        }
        .frame(width: 540, height: 500)
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

            Divider().padding(.vertical, 2)

            if !services.isAppStoreBuild {
                Toggle(t("settings.updates.toggle"), isOn: $services.checkUpdates)
                Text(t("settings.updates.note")).font(.caption).foregroundStyle(Theme.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Toggle(t("settings.usage.toggle"), isOn: $services.shareUsage)
            Text(t("settings.usage.note")).font(.caption).foregroundStyle(Theme.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if services.shareUsage {
                Text(t("settings.usage.pending", pendingText)).font(.caption).foregroundStyle(Theme.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer()
            HStack {
                Text(t("settings.version", Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev"))
                    .font(.caption).foregroundStyle(Theme.secondary)
                Spacer()
                Button(t("settings.feedback")) { services.showFeedback = true }
                    .buttonStyle(.brandSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(24)
    }

    /// The next weekly report, in words — so people can see exactly what would be sent.
    private var pendingText: String {
        let p = services.pendingSummary
        let tools = p.filter { $0.key.hasPrefix("tool.") }
            .sorted { $0.value > $1.value }
            .compactMap { k, v in Tool(rawValue: String(k.dropFirst(5))).map { "\($0.title) \(v)" } }
        return ([t("settings.usage.opens", p["opens"] ?? 0), t("settings.usage.saved", p["saved"] ?? 0)] + tools).joined(separator: " · ")
    }
}

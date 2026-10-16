import SwiftUI

/// A language the app can show. To add a language: create `Strings_<code>.swift` with a
/// `[String: String]` table, then register it in `Localizer.languages` and `Localizer.tables`.
struct AppLanguage: Identifiable, Hashable {
    let code: String
    let nativeName: String
    var id: String { code }
}

enum Localizer {
    static let languages = [
        AppLanguage(code: "en", nativeName: "English"),
        AppLanguage(code: "bn", nativeName: "বাংলা (Bangla)"),
    ]

    static let tables: [String: [String: String]] = [
        "en": StringsEN.table,
        "bn": StringsBN.table,
    ]

    /// Read from any thread (error messages are built off the main thread).
    nonisolated(unsafe) static var current = LanguageManager.storedCode()

    static func string(_ key: String, language: String = Localizer.current) -> String {
        tables[language]?[key] ?? tables["en"]?[key] ?? key
    }
}

/// Explicit in-app language preference, independent from the system language.
final class LanguageManager: ObservableObject {
    static let shared = LanguageManager()
    private static let defaultsKey = "appLanguage"

    @Published var code: String {
        didSet {
            UserDefaults.standard.set(code, forKey: Self.defaultsKey)
            Localizer.current = code
        }
    }

    init() { code = Self.storedCode() }

    static func storedCode() -> String {
        if let saved = UserDefaults.standard.string(forKey: defaultsKey),
           Localizer.languages.contains(where: { $0.code == saved }) { return saved }
        let preferred = Locale.preferredLanguages.first ?? "en"
        return Localizer.languages.first { preferred.hasPrefix($0.code) }?.code ?? "en"
    }
}

/// Looks up `key` in the active language, falling back to English. `args` fill `%@`, `%d` placeholders.
func t(_ key: String, _ args: CVarArg...) -> String {
    let format = Localizer.string(key)
    return args.isEmpty ? format : String(format: format, arguments: args)
}

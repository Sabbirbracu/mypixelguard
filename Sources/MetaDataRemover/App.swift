import SwiftUI

final class AppDelegate: NSObject, NSApplicationDelegate {
    func application(_ application: NSApplication, open urls: [URL]) {
        Task { @MainActor in AppModel.shared.add(urls: urls) }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

@main
struct MetaDataRemoverApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var model = AppModel.shared
    @StateObject private var lang = LanguageManager.shared
    @AppStorage("appearanceMode") private var appearance = AppearanceMode.system.rawValue

    init() {
        let args = CommandLine.arguments
        if args.count > 1, args[1] == "--cli" {
            CLI.run(Array(args.dropFirst(2)))
            exit(0)
        }
    }

    private var colorScheme: ColorScheme? { AppearanceMode(rawValue: appearance)?.colorScheme }

    var body: some Scene {
        Window(t("app.name"), id: "main") {
            ContentView()
                .environmentObject(model)
                .environmentObject(lang)
                .preferredColorScheme(colorScheme)
        }
        .windowToolbarStyle(.unifiedCompact)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button(t("action.addImages")) { model.chooseImages() }
                    .keyboardShortcut("o")
            }
        }

        Settings {
            SettingsView()
                .environmentObject(lang)
                .preferredColorScheme(colorScheme)
        }
    }
}

import SwiftUI

/// The only things the app ever sends over the network, all to the MyPixelGuard website:
/// - an update check: a plain GET of version.json (can be turned off in Settings; skipped in the App Store build),
/// - a weekly anonymous usage report, only after the user said yes (counts of opens and tools used — never images,
///   file names, paths or metadata),
/// - feedback, only when the user writes it and presses Send.
/// Images are never uploaded.
@MainActor
final class AppServices: ObservableObject {
    static let shared = AppServices()

    struct UpdateInfo: Equatable { let version: String; let url: URL; let notes: String }

    @Published var update: UpdateInfo?
    @Published var showConsent = false
    @Published var showFeedback = false

    @Published var checkUpdates: Bool { didSet { defaults.set(checkUpdates, forKey: Key.checkUpdates); if checkUpdates { Task { await checkForUpdate() } } else { update = nil } } }
    @Published var shareUsage: Bool { didSet { setSharing(shareUsage) } }

    private let defaults = UserDefaults.standard
    private var launched = false
    private static let reportInterval: TimeInterval = 7 * 24 * 3600
    private static let firstFeedbackAt = 5

    private enum Key {
        static let launches = "app.launches"
        static let checkUpdates = "updates.check"
        static let dismissedUpdate = "updates.dismissed"
        static let shareUsage = "usage.share"
        static let consentAsked = "usage.asked"
        static let installID = "usage.id"
        static let pending = "usage.pending"
        static let lastReport = "usage.lastReport"
        static let feedbackAt = "feedback.askAt"
        static let feedbackDone = "feedback.done"
        static let feedbackQueue = "feedback.queue"
    }

    /// Website the app talks to. `defaults write <bundle id> serviceBaseURL http://localhost:4173` points it elsewhere for testing.
    private var base: URL {
        URL(string: defaults.string(forKey: "serviceBaseURL") ?? "https://mypixelguard.agentiqbd.com")!
    }
    private var apiBase: URL {
        defaults.string(forKey: "serviceAPIURL").flatMap(URL.init(string:)) ?? base
    }

    /// The App Store updates its own apps, and does not allow apps to point people elsewhere for updates.
    let isAppStoreBuild: Bool = {
        guard let receipt = Bundle.main.appStoreReceiptURL else { return false }
        return FileManager.default.fileExists(atPath: receipt.path)
    }()

    private init() {
        checkUpdates = defaults.object(forKey: Key.checkUpdates) as? Bool ?? true
        shareUsage = defaults.bool(forKey: Key.shareUsage)
    }

    var launches: Int { defaults.integer(forKey: Key.launches) }

    // MARK: Launch

    /// Called once per app launch, from the main window.
    func appLaunched() async {
        guard !launched else { return }
        launched = true

        let count = launches + 1
        defaults.set(count, forKey: Key.launches)
        if shareUsage { bump("opens") }

        if !defaults.bool(forKey: Key.consentAsked) {
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            showConsent = true
        } else if !defaults.bool(forKey: Key.feedbackDone),
                  count >= (defaults.object(forKey: Key.feedbackAt) as? Int ?? Self.firstFeedbackAt) {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            showFeedback = true
        }

        await sendQueuedFeedback()
        await sendReportIfDue()
        await checkForUpdate()
    }

    // MARK: Updates

    func checkForUpdate() async {
        guard checkUpdates, !isAppStoreBuild else { return }
        var request = URLRequest(url: base.appendingPathComponent("version.json"))
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 15
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let mac = root["mac"] as? [String: Any],
              let latest = mac["version"] as? String,
              let link = (mac["url"] as? String).flatMap(URL.init(string:)) else { return }

        let current = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        guard Self.isNewer(latest, than: current), defaults.string(forKey: Key.dismissedUpdate) != latest else { update = nil; return }
        let notes = (mac["notes"] as? [String: String])?[Localizer.current] ?? ""
        update = UpdateInfo(version: latest, url: link, notes: notes)
    }

    func dismissUpdate() {
        if let v = update?.version { defaults.set(v, forKey: Key.dismissedUpdate) }
        update = nil
    }

    static func isNewer(_ a: String, than b: String) -> Bool {
        let x = a.split(separator: ".").map { Int($0) ?? 0 }, y = b.split(separator: ".").map { Int($0) ?? 0 }
        for i in 0..<max(x.count, y.count) {
            let l = i < x.count ? x[i] : 0, r = i < y.count ? y[i] : 0
            if l != r { return l > r }
        }
        return false
    }

    // MARK: Anonymous usage

    func answerConsent(_ yes: Bool) {
        defaults.set(true, forKey: Key.consentAsked)
        shareUsage = yes
        showConsent = false
    }

    private func setSharing(_ on: Bool) {
        defaults.set(on, forKey: Key.shareUsage)
        if on {
            if defaults.string(forKey: Key.installID) == nil { defaults.set(UUID().uuidString, forKey: Key.installID) }
            if defaults.object(forKey: Key.lastReport) == nil { defaults.set(Date(), forKey: Key.lastReport) }
        } else {
            // Turning it off forgets everything collected so far, including the random id.
            defaults.removeObject(forKey: Key.pending)
            defaults.removeObject(forKey: Key.installID)
            defaults.removeObject(forKey: Key.lastReport)
        }
    }

    /// Counts one finished save (or failure) for a tool. Nothing is kept unless the user agreed to share.
    func recordSave(tool: Tool, succeeded: Bool) {
        guard shareUsage else { return }
        bump(succeeded ? "saved" : "failed")
        if succeeded { bump("tool.\(tool.rawValue)") }
    }

    private func bump(_ key: String) {
        var pending = defaults.dictionary(forKey: Key.pending) as? [String: Int] ?? [:]
        pending[key, default: 0] += 1
        defaults.set(pending, forKey: Key.pending)
    }

    private func sendReportIfDue() async {
        guard shareUsage, let id = defaults.string(forKey: Key.installID) else { return }
        let last = defaults.object(forKey: Key.lastReport) as? Date ?? Date()
        guard Date().timeIntervalSince(last) >= Self.reportInterval else { return }

        let pending = defaults.dictionary(forKey: Key.pending) as? [String: Int] ?? [:]
        var tools: [String: Int] = [:]
        for (k, v) in pending where k.hasPrefix("tool.") { tools[String(k.dropFirst(5))] = v }
        let body: [String: Any] = [
            "id": id, "v": appVersion, "os": osVersion, "lang": Localizer.current, "platform": "mac",
            "days": Int(Date().timeIntervalSince(last) / 86400),
            "opens": pending["opens"] ?? 0, "saved": pending["saved"] ?? 0, "failed": pending["failed"] ?? 0, "tools": tools,
        ]
        guard await post("api/app/stats", body) else { return }   // offline: keep counting, try again next launch
        defaults.removeObject(forKey: Key.pending)
        defaults.set(Date(), forKey: Key.lastReport)
    }

    /// Exactly what the next weekly report would contain, for the Settings window.
    var pendingSummary: [String: Int] { defaults.dictionary(forKey: Key.pending) as? [String: Int] ?? [:] }

    // MARK: Feedback

    func feedbackLater() {
        defaults.set(launches + 10, forKey: Key.feedbackAt)
        showFeedback = false
    }

    func feedbackNever() {
        defaults.set(true, forKey: Key.feedbackDone)
        showFeedback = false
    }

    /// Sends now, or keeps it and sends on a later launch when there is no connection. Either way the user is done.
    func sendFeedback(rating: Int, text: String) async {
        defaults.set(true, forKey: Key.feedbackDone)
        let body: [String: Any] = ["rating": rating, "text": text, "v": appVersion, "os": osVersion, "lang": Localizer.current, "platform": "mac"]
        if await post("api/app/feedback", body) { return }
        var queue = defaults.array(forKey: Key.feedbackQueue) as? [Data] ?? []
        if let data = try? JSONSerialization.data(withJSONObject: body) { queue.append(data) }
        defaults.set(Array(queue.suffix(5)), forKey: Key.feedbackQueue)
    }

    private func sendQueuedFeedback() async {
        guard var queue = defaults.array(forKey: Key.feedbackQueue) as? [Data], !queue.isEmpty else { return }
        while let first = queue.first,
              let body = try? JSONSerialization.jsonObject(with: first) as? [String: Any],
              await post("api/app/feedback", body) {
            queue.removeFirst()
        }
        defaults.set(queue, forKey: Key.feedbackQueue)
    }

    // MARK: Helpers

    private var appVersion: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev" }
    private var osVersion: String {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        return "macOS \(v.majorVersion).\(v.minorVersion)"
    }

    private func post(_ path: String, _ body: [String: Any]) async -> Bool {
        var request = URLRequest(url: apiBase.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 20
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        guard let (_, response) = try? await URLSession.shared.data(for: request) else { return false }
        return (response as? HTTPURLResponse)?.statusCode == 200
    }
}

// MARK: - Sidebar update card

struct UpdateBanner: View {
    @ObservedObject var services = AppServices.shared

    var body: some View {
        if let update = services.update {
            HStack(spacing: 9) {
                Button { NSWorkspace.shared.open(update.url) } label: {
                    HStack(spacing: 9) {
                        Image(systemName: "arrow.down.circle.fill")
                            .font(.system(size: 18))
                            .foregroundStyle(Theme.orange)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(t("update.title"))
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(Theme.ink)
                            Text(t("update.body", update.version))
                                .font(.caption2)
                                .foregroundStyle(Theme.accentText)
                        }
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help(update.notes.isEmpty ? t("update.download") : update.notes)
                Button { services.dismissUpdate() } label: {
                    Image(systemName: "xmark").font(.system(size: 9, weight: .bold))
                }
                .buttonStyle(.plain)
                .foregroundStyle(Theme.secondary)
                .help(t("update.dismiss"))
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 12).fill(Theme.orange.opacity(0.10)))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.orange.opacity(0.35)))
        }
    }
}

// MARK: - First-run question about anonymous stats

struct UsageConsentSheet: View {
    @ObservedObject var services = AppServices.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Image(systemName: "chart.bar.xaxis")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(Theme.orange)
                .frame(width: 46, height: 46)
                .background(RoundedRectangle(cornerRadius: 12).fill(Theme.orange.opacity(0.12)))
            Text(t("consent.title")).font(BrandTypography.font(size: 19, weight: .bold))
            Text(t("consent.body")).foregroundStyle(Theme.secondary).fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: 7) {
                consentRow("checkmark.circle.fill", Theme.success, t("consent.yes"))
                consentRow("xmark.circle.fill", Theme.danger, t("consent.never"))
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 12).fill(Theme.surface))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.border))
            Text(t("consent.note")).font(.caption).foregroundStyle(Theme.secondary)
            HStack {
                Button(t("consent.decline")) { services.answerConsent(false) }
                    .buttonStyle(.brandSecondary)
                Spacer()
                Button(t("consent.accept")) { services.answerConsent(true) }
                    .buttonStyle(.brandPrimary)
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(26)
        .frame(width: 460)
        .background(Theme.canvas)
        .interactiveDismissDisabled()
    }

    private func consentRow(_ symbol: String, _ color: Color, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: symbol).foregroundStyle(color)
            Text(text).font(.callout).fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: - Feedback

struct FeedbackSheet: View {
    @ObservedObject var services = AppServices.shared
    @State private var rating = 0
    @State private var text = ""
    @State private var sent = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if sent {
                VStack(spacing: 12) {
                    Image(systemName: "heart.fill").font(.system(size: 30)).foregroundStyle(Theme.orange)
                    Text(t("feedback.thanks")).font(BrandTypography.font(size: 18, weight: .bold))
                    Text(t("feedback.thanks.body")).foregroundStyle(Theme.secondary).multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
            } else {
                Text(t("feedback.title")).font(BrandTypography.font(size: 19, weight: .bold))
                Text(t("feedback.body")).foregroundStyle(Theme.secondary).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    ForEach(1...5, id: \.self) { star in
                        Button { rating = star } label: {
                            Image(systemName: star <= rating ? "star.fill" : "star")
                                .font(.system(size: 26))
                                .foregroundStyle(star <= rating ? Theme.orange : Theme.secondary.opacity(0.6))
                        }
                        .buttonStyle(.plain)
                        .help(t("feedback.stars", star))
                    }
                }
                ZStack(alignment: .topLeading) {
                    TextEditor(text: $text)
                        .font(.body)
                        .scrollContentBackground(.hidden)
                        .padding(8)
                    if text.isEmpty {
                        Text(t("feedback.placeholder"))
                            .foregroundStyle(Theme.secondary)
                            .padding(.horizontal, 13).padding(.vertical, 8)
                            .allowsHitTesting(false)
                    }
                }
                .frame(height: 110)
                .background(RoundedRectangle(cornerRadius: 10).fill(Theme.surface))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.border))
                Text(t("feedback.note")).font(.caption).foregroundStyle(Theme.secondary)
            }
            HStack {
                if sent {
                    Spacer()
                    Button(t("feedback.close")) { services.showFeedback = false }
                        .buttonStyle(.brandPrimary)
                        .keyboardShortcut(.defaultAction)
                } else {
                    Button(t("feedback.never")) { services.feedbackNever() }
                        .buttonStyle(.plain)
                        .foregroundStyle(Theme.secondary)
                    Spacer()
                    Button(t("feedback.later")) { services.feedbackLater() }
                        .buttonStyle(.brandSecondary)
                    Button(t("feedback.send")) {
                        let r = rating, message = text.trimmingCharacters(in: .whitespacesAndNewlines)
                        sent = true
                        Task { await services.sendFeedback(rating: r, text: message) }
                    }
                    .buttonStyle(.brandPrimary)
                    .disabled(rating == 0 && text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .keyboardShortcut(.defaultAction)
                }
            }
        }
        .padding(26)
        .frame(width: 460)
        .background(Theme.canvas)
    }
}

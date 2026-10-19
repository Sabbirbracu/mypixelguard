import SwiftUI

func severityColor(for severity: Severity?) -> Color {
    switch severity {
    case .high: return Theme.accentText
    case .medium: return Theme.warning
    case .info: return Theme.info
    case nil: return Theme.success
    }
}

// MARK: - Root

struct ContentView: View {
    @EnvironmentObject var model: AppModel
    @EnvironmentObject var lang: LanguageManager
    @ObservedObject private var services = AppServices.shared
    @State private var dropTargeted = false

    var body: some View {
        HStack(spacing: 0) {
            NavSidebar()
                .frame(width: 232)
            Rectangle()
                .fill(Theme.border)
                .frame(width: 1)
            VStack(spacing: 0) {
                if model.files.isEmpty {
                    EmptyStateView()
                } else {
                    WorkspaceBar()
                    Rectangle().fill(Theme.border).frame(height: 1)
                    ToolDetail()
                }
            }
            .background(Theme.canvas)
        }
        .frame(minWidth: 980, minHeight: 700)
        .tint(Theme.orange)
        .font(BrandTypography.font(size: 13))
        .foregroundStyle(Theme.ink)
        .onDrop(of: [.fileURL], isTargeted: $dropTargeted) { model.handleDrop($0) }
        .overlay {
            if dropTargeted {
                ZStack {
                    RoundedRectangle(cornerRadius: 18).fill(Theme.orange.opacity(0.10))
                    RoundedRectangle(cornerRadius: 18)
                        .stroke(Theme.orange, style: StrokeStyle(lineWidth: 3, dash: [10, 6]))
                    Label(t("drop.hint"), systemImage: "square.and.arrow.down")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(Theme.accentText)
                }
                .padding(10)
                .allowsHitTesting(false)
            }
        }
        // Rebuild the window content when the language changes so every string is looked up again.
        .id(lang.code)
        .task { await AppServices.shared.appLaunched() }
        .sheet(isPresented: $services.showConsent) { UsageConsentSheet() }
        .sheet(isPresented: $services.showFeedback) { FeedbackSheet() }
    }
}

// MARK: - Navigation sidebar

struct NavSidebar: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            BrandLogo(height: 31)
                .padding(.horizontal, 18)
                .padding(.top, 26).padding(.bottom, 30)

            Text(t("nav.tools"))
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.secondary)
                .padding(.horizontal, 18).padding(.bottom, 8)

            VStack(spacing: 5) {
                ForEach(Array(Tool.allCases.enumerated()), id: \.element) { index, tool in
                    NavRow(tool: tool, shortcut: index + 1)
                }
            }
            .padding(.horizontal, 10)

            Spacer(minLength: 12)

            VStack(alignment: .leading, spacing: 10) {
                UpdateBanner()
                HStack(alignment: .top, spacing: 9) {
                    Image(systemName: "lock.shield.fill")
                        .foregroundStyle(Theme.success)
                        .padding(.top, 1)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(t("privacy.local.title"))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Theme.ink)
                        Text(t("privacy.badge"))
                            .font(.caption2)
                            .foregroundStyle(Theme.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 12).fill(Theme.surface))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.border))
                Group {
                    if #available(macOS 14, *) {
                        SettingsLink {
                            Label(t("nav.settings"), systemImage: "gearshape")
                        }
                    } else {
                        Button {
                            NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
                        } label: {
                            Label(t("nav.settings"), systemImage: "gearshape")
                        }
                    }
                }
                .buttonStyle(.brandSecondary)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(12)
        }
        .frame(maxHeight: .infinity)
        .background(Theme.sidebar)
    }
}

private struct NavRow: View {
    @EnvironmentObject var model: AppModel
    let tool: Tool
    let shortcut: Int

    var body: some View {
        let selected = model.tool == tool
        Button { model.tool = tool } label: {
            HStack(spacing: 10) {
                Image(systemName: tool.symbol)
                    .font(.system(size: 13, weight: .semibold))
                    .frame(width: 28, height: 28)
                    .foregroundStyle(selected ? Theme.onAccent : Theme.secondary)
                    .background(Circle().fill(selected ? Theme.orange : Theme.surface))
                Text(tool.title)
                    .fontWeight(selected ? .semibold : .regular)
                    .foregroundStyle(Theme.ink)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10).padding(.vertical, 7)
            .background(RoundedRectangle(cornerRadius: 10).fill(selected ? Theme.orange.opacity(0.12) : Color.clear))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(selected ? Theme.orange.opacity(0.22) : Color.clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .keyboardShortcut(KeyEquivalent(Character("\(shortcut)")), modifiers: .command)
        .accessibilityAddTraits(selected ? .isSelected : [])
        .help("\(tool.title)  ⌘\(shortcut)")
    }
}

// MARK: - Workspace header

/// Keeps image navigation available without dedicating an entire middle column to it.
struct WorkspaceBar: View {
    @EnvironmentObject var model: AppModel

    private var selectedIndex: Int? {
        guard let selection = model.selection else { return nil }
        return model.files.firstIndex { $0.id == selection }
    }

    var body: some View {
        HStack(spacing: 14) {
            HStack(spacing: 10) {
                thumbnail
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.selected?.url.lastPathComponent ?? t("detail.selectImage"))
                        .font(.callout.weight(.semibold))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Text(t(model.files.count == 1 ? "files.count.one" : "files.count.many", model.files.count))
                        .font(.caption)
                        .foregroundStyle(Theme.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Menu {
                    ForEach(model.files) { item in
                        Button { model.selection = item.id } label: {
                            Label(item.url.lastPathComponent,
                                  systemImage: item.id == model.selection ? "checkmark.circle.fill" : "photo")
                        }
                    }
                } label: {
                    Image(systemName: "photo.stack")
                        .font(.callout.weight(.semibold))
                        .foregroundStyle(Theme.secondary)
                        .frame(width: 26, height: 34)
                }
                .menuStyle(.borderlessButton)
                .fixedSize()
            }
            .padding(.horizontal, 7).padding(.vertical, 5)
            .frame(width: 360, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 10).fill(Theme.surface))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.border))

            HStack(spacing: 4) {
                workspaceIconButton("chevron.left", help: t("action.previousImage"), disabled: selectedIndex == nil || selectedIndex == 0) {
                    moveSelection(-1)
                }
                workspaceIconButton("chevron.right", help: t("action.nextImage"),
                                    disabled: selectedIndex == nil || selectedIndex == model.files.count - 1) {
                    moveSelection(1)
                }
            }

            Spacer(minLength: 20)

            if model.tool == .clean || model.tool == .inspect {
                let flagged = model.files.filter { ($0.analysis?.risk ?? .info) >= .medium && !$0.isCleaned }.count
                if flagged > 0 { Chip(text: t("files.needCleaning", flagged), color: Theme.warning) }
            }

            Button { model.chooseImages() } label: { Image(systemName: "plus").frame(width: 18) }
            .buttonStyle(.brandSecondary)
            .accessibilityLabel(t("action.addImages"))
            .help(t("help.addImages"))

            Menu {
                if let selection = model.selection {
                    Button(t("action.removeFromList"), systemImage: "minus.circle") { model.removeFile(selection) }
                    Divider()
                }
                Button(role: .destructive) { model.clearAll() } label: {
                    Label(t("action.clearList"), systemImage: "trash")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .frame(width: 30, height: 30)
                    .contentShape(Rectangle())
            }
            .menuStyle(.borderlessButton)
            .fixedSize()
            .help(t("workspace.more"))
        }
        .padding(.horizontal, 24)
        .frame(height: 68)
        .background(Theme.surface)
    }

    private var thumbnail: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8).fill(Theme.sidebar)
            if let image = model.selected?.thumb {
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 44, height: 44)
                    .clipped()
            } else {
                Image(systemName: "photo").foregroundStyle(Theme.secondary)
            }
        }
        .frame(width: 44, height: 44)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border))
    }

    private func moveSelection(_ offset: Int) {
        guard let index = selectedIndex else { return }
        let next = index + offset
        guard model.files.indices.contains(next) else { return }
        model.selection = model.files[next].id
    }

    private func workspaceIconButton(_ symbol: String, help: String, disabled: Bool,
                                     action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).frame(width: 28, height: 28)
        }
        .buttonStyle(.plain)
        .background(RoundedRectangle(cornerRadius: 8).fill(Theme.surface))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border))
        .disabled(disabled)
        .help(help)
    }
}

// MARK: - Empty state

struct EmptyStateView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        VStack(spacing: 22) {
            Spacer(minLength: 0)

            VStack(spacing: 9) {
                BrandMark(size: 68)
                    .padding(.bottom, 2)
                Text(t("empty.title")).font(BrandTypography.font(size: 29, weight: .bold)).foregroundStyle(Theme.ink)
                Text(t("empty.subtitle"))
                    .font(.callout)
                    .foregroundStyle(Theme.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 560)
            }

            VStack(spacing: 14) {
                Image(systemName: "photo.on.rectangle.angled")
                    .font(.system(size: 28, weight: .medium))
                    .foregroundStyle(Theme.onAccent)
                    .frame(width: 56, height: 56)
                    .background(Circle().fill(Theme.orange))
                Text(t("empty.drop")).font(.headline)
                Text(t("empty.browse")).font(.callout).foregroundStyle(Theme.secondary)
                Button { model.chooseImages() } label: {
                    Label(t("action.chooseImages"), systemImage: "folder").padding(.horizontal, 6)
                }
                .buttonStyle(.brandPrimary)
                .controlSize(.large)
            }
            .frame(maxWidth: 560)
            .padding(.vertical, 30)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.surface))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(Theme.orange.opacity(0.45), style: StrokeStyle(lineWidth: 1.5, dash: [8, 6])))
            .shadow(color: Color.black.opacity(0.04), radius: 14, y: 4)

            HStack(alignment: .top, spacing: 18) {
                step(1, t("step.add.title"), t("step.add.text"))
                step(2, t("step.choose.title"), t("step.choose.text"))
                step(3, t("step.export.title"), t("step.export.text"))
            }
            .frame(maxWidth: 720)

            Spacer(minLength: 0)
        }
        .padding(36)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func step(_ n: Int, _ title: String, _ text: String) -> some View {
        VStack(spacing: 8) {
            Text(verbatim: "\(n)")
                .font(.headline)
                .frame(width: 30, height: 30)
                .background(Circle().fill(Theme.orange.opacity(0.18)))
                .foregroundStyle(Theme.ink)
            Text(title).font(.headline)
            Text(text).font(.caption).foregroundStyle(Theme.secondary).multilineTextAlignment(.center)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 12).fill(Theme.surface.opacity(0.72)))
        .frame(maxWidth: .infinity)
    }
}

// MARK: - File list

struct FileListColumn: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        List(selection: $model.selection) {
            Section(t("files.section")) {
                ForEach(model.files) { item in
                    FileRow(item: item)
                        .tag(item.id)
                        .contextMenu {
                            Button(t("action.removeFromList")) { model.removeFile(item.id) }
                            Button(t("action.showInFinder")) { NSWorkspace.shared.activateFileViewerSelecting([item.url]) }
                        }
                }
            }
        }
        .listStyle(.inset)
        .scrollContentBackground(.hidden)
        .background(Theme.canvas)
        .safeAreaInset(edge: .bottom) {
            HStack {
                Text(t(model.files.count == 1 ? "files.count.one" : "files.count.many", model.files.count))
                Spacer()
                if model.tool == .clean || model.tool == .inspect {
                    let flagged = model.files.filter { ($0.analysis?.risk ?? .info) >= .medium && !$0.isCleaned }.count
                    if flagged > 0 { Chip(text: t("files.needCleaning", flagged), color: Theme.warning) }
                }
            }
            .font(.caption)
            .foregroundStyle(Theme.secondary)
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(.bar)
        }
    }
}

extension FileItem {
    var isCleaned: Bool { if case .cleaned = status { return true } else { return false } }
    var isFailed: Bool { if case .failed = status { return true } else { return false } }
}

struct FileRow: View {
    let item: FileItem

    private var badge: (text: String, color: Color, symbol: String) {
        switch item.status {
        case .scanning: return (t("badge.scanning"), Theme.secondary, "hourglass")
        case .failed: return (t("badge.cantRead"), Theme.danger, "xmark.octagon.fill")
        case .cleaned: return (t("badge.cleaned"), Theme.success, "checkmark.seal.fill")
        case .ready:
            if item.analysis?.aiRisk == .high {
                return (t("badge.aiLikely"), Theme.accentText, "exclamationmark.triangle.fill")
            }
            if item.analysis?.privacyRisk == .high {
                return (t("badge.privateData"), Theme.warning, "hand.raised.fill")
            }
            switch item.analysis?.aiRisk {
            case .high: return (t("badge.aiLikely"), Theme.accentText, "exclamationmark.triangle.fill")
            case .medium: return (t("badge.credentials"), Theme.warning, "exclamationmark.circle.fill")
            default: return (t("badge.noAI"), Theme.success, "checkmark.circle.fill")
            }
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            Group {
                if let thumb = item.thumb {
                    Image(nsImage: thumb).resizable().scaledToFill()
                } else {
                    Rectangle().fill(.quaternary)
                }
            }
            .frame(width: 46, height: 46)
            .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 3) {
                Text(item.url.lastPathComponent).lineLimit(1).truncationMode(.middle)
                Label(badge.text, systemImage: badge.symbol)
                    .font(.caption)
                    .foregroundStyle(badge.color)
            }
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Tool detail switch

struct ToolDetail: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        switch model.tool {
        case .inspect: DetailView(mode: .inspect)
        case .clean: DetailView(mode: .clean)
        case .redact: RedactView()
        case .convert: ConvertView()
        case .resize: ResizeView()
        case .compress: CompressView()
        case .background: BackgroundRemovalView()
        case .studio: StudioView()
        case .enhance: AIImageToolsView()
        }
    }
}

enum DetailMode { case inspect, clean }

struct DetailView: View {
    @EnvironmentObject var model: AppModel
    let mode: DetailMode

    var body: some View {
        if let item = model.selected {
            ItemDetail(item: item, mode: mode).id(item.id)
        } else {
            Text(t("detail.selectImage")).foregroundStyle(Theme.secondary).frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

struct ItemDetail: View {
    @EnvironmentObject var model: AppModel
    let item: FileItem
    let mode: DetailMode
    @State private var tab: InspectTab = .overview
    @State private var query = ""

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    switch item.status {
                    case .scanning:
                        ProgressView(t("detail.reading")).frame(maxWidth: .infinity).padding(48)
                    default:
                        if let a = item.analysis {
                            switch mode {
                            case .inspect:
                                InspectTabBar(tab: $tab, reviewCount: a.reviewCount)
                                switch tab {
                                case .overview: InspectOverview(item: item, analysis: a)
                                case .metadata: MetadataSection(item: item, analysis: a, query: $query)
                                }
                            case .clean:
                                CleanFileCard(item: item, analysis: a)
                                if item.isCleaned || item.isFailed { StatusBanner(item: item, analysis: a) }
                                if let batch = model.batch, batch.tool == .clean { BatchView(batch: batch) }
                                CleanOptions(item: item, analysis: a)
                            }
                        } else if case .failed(let message) = item.status {
                            Label(message, systemImage: "xmark.octagon.fill").foregroundStyle(Theme.danger).card()
                        } else if let reason = item.analysisError {
                            Label(reason, systemImage: "info.circle").foregroundStyle(Theme.secondary).card()
                        }
                    }
                }
                .padding(.horizontal, 32).padding(.vertical, 28)
                .frame(maxWidth: mode == .inspect ? 1100 : 1040)
                .frame(maxWidth: .infinity)
            }

            if mode == .inspect, item.analysis != nil, !isScanning { InspectFooter() }
            if mode == .clean, let a = item.analysis, !isScanning {
                CleanFooter(item: item, analysis: a)
            }
        }
    }

    private var isScanning: Bool {
        if case .scanning = item.status { return true }
        return false
    }
}

// MARK: - Status banner

struct StatusBanner: View {
    let item: FileItem
    let analysis: Analysis
    @State private var openTopic: PrivacyTopic?

    private static let topicScheme = "mypixelguard-topic"

    var body: some View {
        Group {
            switch item.status {
            case .cleaned(let report): cleaned(report)
            case .failed(let message): failed(message)
            default: found
            }
        }
        .environment(\.openURL, OpenURLAction { url in
            guard url.scheme == Self.topicScheme, let host = url.host, let topic = PrivacyTopic(rawValue: host) else {
                return .systemAction
            }
            openTopic = topic
            return .handled
        })
        .sheet(item: $openTopic) { topic in
            PrivacyDetailSheet(topic: topic, item: item, analysis: analysis)
        }
    }

    /// The banner sentence with each sensitive topic as a bold, clickable word.
    private func linkedSentence(_ key: String, topics: [PrivacyTopic]) -> Text {
        var out = AttributedString()
        let parts = t(key).components(separatedBy: "%@")
        out += AttributedString(parts.first ?? "")
        for (index, topic) in topics.enumerated() {
            var word = AttributedString(topic.word)
            word.link = URL(string: "\(Self.topicScheme)://\(topic.rawValue)")
            word.font = .callout.bold()
            word.underlineStyle = .single
            out += word
            if index < topics.count - 2 { out += AttributedString(t("topic.join.comma")) }
            else if index == topics.count - 2 {
                out += AttributedString(t(topics.count == 2 ? "topic.join.two" : "topic.join.last"))
            }
        }
        if parts.count > 1 { out += AttributedString(parts[1]) }
        return Text(out)
    }

    // Before cleaning
    private var found: some View {
        let risk = analysis.risk
        let privacySentence: Text? = {
            guard analysis.aiRisk != .high, analysis.aiRisk != .medium else { return nil }
            if analysis.privacyRisk == .high {
                let topics = PrivacyTopic.present(in: analysis, severities: [.high])
                return topics.isEmpty ? nil : linkedSentence("banner.privacy.high.sentence", topics: topics)
            }
            if analysis.privacyRisk == .medium {
                let topics = PrivacyTopic.present(in: analysis, severities: [.medium])
                return topics.isEmpty ? nil : linkedSentence("banner.privacy.medium.sentence", topics: topics)
            }
            return nil
        }()
        let (title, subtitle, symbol): (String, String, String) = {
            if analysis.aiRisk == .high {
                return (t("banner.high.title"), t("banner.high.text"), "exclamationmark.triangle.fill")
            }
            if analysis.aiRisk == .medium {
                return (t("banner.medium.title"), t("banner.medium.text"), "exclamationmark.circle.fill")
            }
            if analysis.privacyRisk == .high {
                return (t("banner.privacy.high.title"), t("banner.privacy.high.text"), "hand.raised.fill")
            }
            if analysis.privacyRisk == .medium {
                return (t("banner.privacy.medium.title"), t("banner.privacy.medium.text"), "info.circle.fill")
            }
            return analysis.metadataPieces.isEmpty
                ? (t("banner.none.title"), t("banner.none.text"), "checkmark.shield.fill")
                : (t("banner.noAI.title"), t("banner.noAI.text"), "checkmark.shield.fill")
        }()
        return HStack(alignment: .top, spacing: 14) {
            Image(systemName: symbol)
                .font(.system(size: 30))
                .foregroundStyle(severityColor(for: risk))
            VStack(alignment: .leading, spacing: 6) {
                Text(title).font(.title3.weight(.semibold))
                if let privacySentence {
                    privacySentence.foregroundStyle(Theme.secondary).tint(Theme.accentText)
                    Label(t("banner.privacy.hint"), systemImage: "hand.tap")
                        .font(.caption).foregroundStyle(Theme.secondary)
                } else {
                    Text(subtitle).foregroundStyle(Theme.secondary)
                }
                let top = analysis.indicators.filter { $0.severity != .info }.prefix(4)
                if !top.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(Array(top)) { Chip(text: shortTitle($0), color: severityColor(for: $0.severity)) }
                    }
                    .padding(.top, 2)
                }
            }
            Spacer(minLength: 0)
        }
        .card()
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(severityColor(for: risk).opacity(0.5), lineWidth: 1.5))
    }

    private func shortTitle(_ i: Indicator) -> String {
        if i.title.hasPrefix("C2PA") { return "C2PA Content Credentials" }
        if i.title.hasPrefix("Tagged as AI") { return t("chip.aiSource") }
        if i.title.hasPrefix("Mentions") { return i.title.replacingOccurrences(of: "Mentions ", with: "") }
        return i.title
    }

    // After cleaning
    private func cleaned(_ r: CleanReport) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: "checkmark.seal.fill").font(.system(size: 30)).foregroundStyle(Theme.success)
                VStack(alignment: .leading, spacing: 4) {
                    Text(t("cleaned.title")).font(.title3.weight(.semibold))
                    Text(r.output.lastPathComponent).font(.callout.monospaced()).textSelection(.enabled)
                    Text(r.output.deletingLastPathComponent().path)
                        .font(.caption).foregroundStyle(Theme.secondary).lineLimit(1).truncationMode(.head)
                }
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: 6) {
                    Button { NSWorkspace.shared.activateFileViewerSelecting([r.output]) } label: {
                        Label(t("action.showInFinder"), systemImage: "folder")
                    }
                    Button { NSWorkspace.shared.open(r.output) } label: {
                        Label(t("action.open"), systemImage: "photo")
                    }
                }
                .buttonStyle(.brandSecondary)
            }
            Divider()
            VStack(alignment: .leading, spacing: 5) {
                if r.reencoded {
                    check(true, t("cleaned.reencoded"))
                } else if !r.removed.isEmpty {
                    check(true, t("cleaned.removed", r.removed.map { t("cat.\($0.category.rawValue).short") }.joined(separator: ", "),
                                  byteString(r.beforeBytes), byteString(r.afterBytes)))
                } else {
                    check(true, t("cleaned.nothing"))
                }
                if r.remainingIndicators.isEmpty {
                    check(true, t("cleaned.noneLeft"))
                } else {
                    check(false, t("cleaned.someLeft", r.remainingIndicators.count)
                          + r.remainingIndicators.map(\.displayTitle).joined(separator: "; "))
                }
                if let o = r.keptOrientation { check(true, t("cleaned.orientation", o)) }
                check(r.decodes, r.decodes ? t("cleaned.opens") : t("cleaned.cannotOpen"))
                if r.removed.contains(where: { $0.category == .icc }) == false, analysis.bytes(in: .icc) > 0 {
                    check(true, t("cleaned.iccKept"))
                }
            }
        }
        .card()
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.success.opacity(0.5), lineWidth: 1.5))
    }

    private func failed(_ message: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "xmark.octagon.fill").font(.title).foregroundStyle(Theme.danger)
            VStack(alignment: .leading) {
                Text(t("failed.title")).font(.headline)
                Text(message).foregroundStyle(Theme.secondary)
            }
        }
        .card()
    }

    private func check(_ ok: Bool, _ text: String) -> some View {
        Label {
            Text(text).font(.callout)
        } icon: {
            Image(systemName: ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .foregroundStyle(ok ? Theme.success : Theme.accentText)
        }
    }
}

// MARK: - Removal preview + action bar

extension MetaCategory {
    var rowSymbol: String {
        switch self {
        case .c2pa: "checkmark.seal.fill"
        case .xmp: "doc.text.fill"
        case .iptc: "text.badge.star"
        case .exif: "camera.fill"
        case .other: "text.bubble.fill"
        case .icc: "paintpalette.fill"
        }
    }
}

/// Icon tile + title + one-line description shared by the Clean cards.
struct CardHeader<Trailing: View>: View {
    let symbol: String
    let title: String
    var subtitle: String?
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.accentText)
                .frame(width: 32, height: 32)
                .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Theme.orange.opacity(0.14)))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                if let subtitle { Text(subtitle).font(.caption).foregroundStyle(Theme.secondary) }
            }
            Spacer(minLength: 12)
            trailing
        }
    }
}

extension CardHeader where Trailing == EmptyView {
    init(symbol: String, title: String, subtitle: String? = nil) {
        self.init(symbol: symbol, title: title, subtitle: subtitle) { EmptyView() }
    }
}

/// Pinned to the bottom of a tool page so the main action is always the last thing on screen.
struct ActionFooter<Trailing: View>: View {
    let summary: String
    var hint: String?
    @ViewBuilder var trailing: Trailing

    var body: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Theme.border).frame(height: 1)
            HStack(spacing: 20) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(summary).font(.callout.weight(.semibold))
                    if let hint {
                        Label { Text(hint).lineLimit(2) } icon: { Image(systemName: "info.circle") }
                            .font(.caption)
                            .foregroundStyle(Theme.secondary)
                    }
                }
                Spacer(minLength: 12)
                trailing
            }
            .padding(.horizontal, 32).padding(.vertical, 16)
            .frame(maxWidth: 1040 + 64)
            .frame(maxWidth: .infinity)
        }
        .background(Theme.surface.shadow(.drop(color: .black.opacity(0.06), radius: 12, y: -4)))
    }
}

// MARK: - Findings tab

// MARK: - Metadata list

struct MetadataSection: View {
    @EnvironmentObject var model: AppModel
    let item: FileItem
    let analysis: Analysis
    @Binding var query: String

    private var filtered: [MetaGroup] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return analysis.groups }
        return analysis.groups.compactMap { g in
            let items = g.items.filter { $0.key.lowercased().contains(q) || $0.value.lowercased().contains(q) }
            return items.isEmpty ? nil : MetaGroup(title: g.title, items: items)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundStyle(Theme.secondary)
                    TextField(t("metadata.search"), text: $query).textFieldStyle(.plain)
                    if !query.isEmpty {
                        Button { query = "" } label: { Image(systemName: "xmark.circle.fill") }
                            .buttonStyle(.plain).foregroundStyle(Theme.secondary)
                            .accessibilityLabel(t("common.clear"))
                    }
                }
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(RoundedRectangle(cornerRadius: 8).fill(Theme.surface))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border))

                Button { model.copyMetadata(item) } label: { Label(t("metadata.copyAll"), systemImage: "doc.on.doc") }
                    .buttonStyle(.brandSecondary)
                Button { model.saveMetadata(item) } label: { Label(t("metadata.saveText"), systemImage: "square.and.arrow.down") }
                    .buttonStyle(.brandSecondary)
            }

            if filtered.isEmpty {
                Text(query.isEmpty ? t("metadata.none") : t("metadata.noMatch", query))
                    .foregroundStyle(Theme.secondary).card()
            }

            ForEach(filtered) { group in
                VStack(alignment: .leading, spacing: 8) {
                    Text(group.title).font(.subheadline.weight(.semibold))
                    Divider()
                    ForEach(group.items) { row in
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text(row.key)
                                .foregroundStyle(Theme.secondary)
                                .frame(width: 210, alignment: .leading)
                            Text(row.value.isEmpty ? "—" : row.value)
                                .textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .font(.callout)
                        .contextMenu {
                            Button(t("metadata.copyValue")) { copy(row.value) }
                            Button(t("metadata.copyRow")) { copy("\(row.key): \(row.value)") }
                        }
                    }
                }
                .card()
            }

            if let xmp = analysis.rawXMP, query.isEmpty {
                DisclosureGroup(t("metadata.rawXMP")) {
                    Text(xmp)
                        .font(.system(.caption, design: .monospaced))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 6)
                }
                .card()
            }
        }
    }

    private func copy(_ text: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }
}

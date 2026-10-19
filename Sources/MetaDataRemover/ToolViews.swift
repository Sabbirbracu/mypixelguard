import SwiftUI

// MARK: - Shared building blocks

struct ToolHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            RoundedRectangle(cornerRadius: 2)
                .fill(Theme.orange)
                .frame(width: 4, height: 39)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(BrandTypography.font(size: 25, weight: .bold)).foregroundStyle(Theme.ink)
                Text(subtitle).font(.callout).foregroundStyle(Theme.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// Scroll container shared by the Convert / Resize / Compress panels.
struct ToolScroll<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) { content }
                .padding(.horizontal, 32).padding(.vertical, 28)
                .frame(maxWidth: 1040)
                .frame(maxWidth: .infinity)
        }
    }
}

/// One labelled setting. The label sits beside the control and wraps for long (e.g. Bangla) text.
struct SettingRow<Content: View>: View {
    let label: String
    var hint: String?
    @ViewBuilder var content: Content

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.callout.weight(.medium))
                if let hint { Text(hint).font(.caption).foregroundStyle(Theme.secondary) }
            }
            .frame(width: 180, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
            content.frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct SelectedImageCard: View {
    let item: FileItem
    var extra: String?

    var body: some View {
        HStack(spacing: 14) {
            Group {
                if let thumb = item.thumb { Image(nsImage: thumb).resizable().scaledToFit() }
                else { Rectangle().fill(.quaternary) }
            }
            .frame(width: 84, height: 84)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.border))

            VStack(alignment: .leading, spacing: 6) {
                Text(item.url.lastPathComponent).font(.headline).lineLimit(1).truncationMode(.middle)
                if let info = item.info {
                    HStack(spacing: 6) {
                        Chip(text: info.format?.displayName ?? item.url.pathExtension.uppercased())
                        Chip(text: "\(info.width) × \(info.height)")
                        Chip(text: byteString(info.fileSize))
                        if info.hasAlpha { Chip(text: t("chip.transparency"), color: Theme.warning) }
                    }
                }
                if let extra { Text(extra).font(.callout).foregroundStyle(Theme.secondary) }
            }
            Spacer(minLength: 0)
        }
        .card(padding: 14)
    }
}

/// Lets the user run the tool on every image or only the selected one.
struct ScopeRow: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        let readable = model.files.filter { $0.info != nil }.count
        VStack(alignment: .leading, spacing: 4) {
            if readable > 1 {
                Toggle(t("scope.all", readable), isOn: $model.applyToAll)
            }
            let skipped = model.files.count - readable
            if skipped > 0 {
                Label(t("scope.skipped", skipped), systemImage: "exclamationmark.triangle")
                    .font(.caption).foregroundStyle(Theme.warning)
            }
        }
    }
}

struct SuffixField: View {
    @Binding var suffix: String
    let example: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            TextField("", text: $suffix, prompt: Text(t("common.none")))
                .textFieldStyle(.roundedBorder)
                .frame(maxWidth: 220)
                .accessibilityLabel(t("setting.suffix"))
            Text(t("setting.suffix.example", example)).font(.caption).foregroundStyle(Theme.secondary)
        }
    }
}

struct KeepMetadataRow: View {
    @Binding var keep: Bool
    var body: some View {
        SettingRow(label: t("setting.keepMetadata"), hint: t("setting.keepMetadata.hint")) {
            Toggle("", isOn: $keep).labelsHidden().toggleStyle(.switch)
        }
    }
}

struct QualityRow: View {
    @Binding var quality: Double
    var enabled = true

    var body: some View {
        SettingRow(label: t("setting.quality"), hint: enabled ? nil : t("setting.quality.lossless")) {
            HStack {
                Slider(value: $quality, in: 0.05...1)
                    .disabled(!enabled)
                    .accessibilityLabel(t("setting.quality"))
                Text(verbatim: "\(Int((quality * 100).rounded()))%")
                    .monospacedDigit()
                    .frame(width: 44, alignment: .trailing)
                    .foregroundStyle(enabled ? Theme.ink : Theme.secondary)
            }
        }
    }
}

struct BackgroundRow: View {
    @Binding var color: Color
    var body: some View {
        SettingRow(label: t("setting.background"), hint: t("setting.background.hint")) {
            HStack(spacing: 10) {
                ColorPicker("", selection: $color, supportsOpacity: false).labelsHidden()
                Button(t("setting.background.white")) { color = .white }.buttonStyle(.brandSecondary)
                Button(t("setting.background.black")) { color = .black }.buttonStyle(.brandSecondary)
            }
        }
    }
}

struct NoticeCard: View {
    let text: String
    var systemImage = "info.circle.fill"
    var color: Color = Theme.info

    var body: some View {
        Label { Text(text).font(.callout).fixedSize(horizontal: false, vertical: true) }
            icon: { Image(systemName: systemImage).foregroundStyle(color) }
            .card(padding: 12)
    }
}

/// Shown when any selected image carries Content Credentials, because a new file will not.
struct ProvenanceNotice: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        let n = model.toolTargets.filter { $0.analysis?.hasProvenance == true }.count
        if n > 0 {
            NoticeCard(text: t("notice.provenance", n), systemImage: "exclamationmark.triangle.fill", color: Theme.warning)
        }
    }
}

/// Primary export button plus live progress and the result summary.
struct ExportSection: View {
    @EnvironmentObject var model: AppModel
    let tool: Tool
    let runTitle: String
    /// A tool's main action. Secondary exports (Clean's selective export) are not the main action:
    /// they use the quieter button and leave ⌘↩ to the screen's primary button.
    var prominent = true
    /// Clean shows batch results above the page instead, so they stay in view.
    var showsBatch = true
    let run: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                if prominent {
                    Button(action: run) { Label(runTitle, systemImage: tool.symbol) }
                        .buttonStyle(.brandPrimary)
                        .keyboardShortcut(.return, modifiers: .command)
                        .disabled(model.toolTargets.isEmpty || model.isBatchRunning)
                } else {
                    Button(action: run) { Label(runTitle, systemImage: "square.and.arrow.down") }
                        .buttonStyle(.brandSecondary)
                        .disabled(model.toolTargets.isEmpty || model.isBatchRunning)
                }
                Spacer()
            }
            Label(t("export.hint"), systemImage: "info.circle")
                .font(.caption).foregroundStyle(Theme.secondary)
            if showsBatch, let batch = model.batch, batch.tool == tool { BatchView(batch: batch) }
        }
    }
}

struct BatchView: View {
    @EnvironmentObject var model: AppModel
    let batch: BatchState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !batch.finished {
                ProgressView(value: Double(batch.done), total: Double(max(batch.total, 1)))
                HStack {
                    Text(t("batch.progress", batch.done + 1, batch.total, batch.current))
                        .font(.callout).lineLimit(1).truncationMode(.middle)
                    Spacer()
                    Button(t("common.cancel")) { model.cancelBatch() }.buttonStyle(.brandSecondary)
                }
            } else {
                summary
                ForEach(batch.results) { result in row(result) }
                HStack {
                    Button { NSWorkspace.shared.open(batch.folder) } label: { Label(t("action.openFolder"), systemImage: "folder") }
                    Button(t("common.done")) { model.dismissBatch() }
                }
                .buttonStyle(.brandSecondary)
            }
        }
        .card()
    }

    private var summary: some View {
        let ok = batch.results.filter(\.succeeded).count
        let failed = batch.failures.count
        return VStack(alignment: .leading, spacing: 4) {
            Label(batch.cancelled ? t("batch.cancelled", ok, batch.total) : t("batch.done", ok, batch.total),
                  systemImage: failed == 0 && !batch.cancelled ? "checkmark.seal.fill" : "exclamationmark.triangle.fill")
                .font(.headline)
                .foregroundStyle(failed == 0 && !batch.cancelled ? Theme.success : Theme.warning)
            if ok > 0, batch.tool == .compress {
                let before = batch.results.filter(\.succeeded).reduce(0) { $0 + $1.beforeBytes }
                let after = batch.results.filter(\.succeeded).reduce(0) { $0 + $1.afterBytes }
                Text(t("batch.savedTotal", byteString(before), byteString(after), percentSaved(before, after)))
                    .font(.callout).foregroundStyle(Theme.secondary)
            }
            if failed > 0 {
                Text(t("batch.failedCount", failed)).font(.callout).foregroundStyle(Theme.danger)
            }
        }
    }

    private func row(_ r: BatchResult) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 8) {
                Image(systemName: r.succeeded ? "checkmark.circle.fill" : "xmark.octagon.fill")
                    .foregroundStyle(r.succeeded ? Theme.success : Theme.danger)
                Text(r.succeeded ? (r.output?.lastPathComponent ?? r.inputName) : r.inputName)
                    .lineLimit(1).truncationMode(.middle)
                Spacer()
                if r.succeeded {
                    Text(verbatim: "\(r.formatName) · \(r.width)×\(r.height) · \(byteString(r.beforeBytes)) → \(byteString(r.afterBytes))")
                        .font(.caption).foregroundStyle(Theme.secondary)
                    if let out = r.output {
                        Button { NSWorkspace.shared.activateFileViewerSelecting([out]) } label: { Image(systemName: "magnifyingglass") }
                            .buttonStyle(.plain)
                            .help(t("action.showInFinder"))
                            .accessibilityLabel(t("action.showInFinder"))
                    }
                }
            }
            .font(.callout)
            if r.succeeded, r.verified {
                HStack(spacing: 12) {
                    Label(t("verify.opens"), systemImage: "checkmark.seal.fill")
                    if let clean = r.metadataClean {
                        Label(t(clean ? "verify.metadata.clean" : "verify.metadata.found"),
                              systemImage: clean ? "checkmark.shield.fill" : "exclamationmark.triangle.fill")
                            .foregroundStyle(clean ? Theme.success : Theme.warning)
                    }
                }.font(.caption).foregroundStyle(Theme.success).padding(.leading, 22)
            }
            if let error = r.error { Text(error).font(.caption).foregroundStyle(Theme.danger).padding(.leading, 22) }
            ForEach(r.notes, id: \.self) { Text($0).font(.caption).foregroundStyle(Theme.warning).padding(.leading, 22) }
        }
    }
}

func percentSaved(_ before: Int, _ after: Int) -> Int {
    guard before > 0 else { return 0 }
    return Int((Double(before - after) / Double(before) * 100).rounded())
}

func runTitle(_ base: String, count: Int) -> String {
    t(count == 1 ? "\(base).one" : "\(base).many", count)
}

/// Lists formats the running macOS can't write, so a missing option never looks like a bug.
struct UnavailableFormatsNote: View {
    var body: some View {
        let missing = OutputFormat.allCases.filter { !$0.isAvailable }.map(\.displayName)
        if !missing.isEmpty {
            Text(t("format.unavailable", missing.joined(separator: ", ")))
                .font(.caption).foregroundStyle(Theme.secondary)
        }
    }
}

// MARK: - Convert

struct ConvertView: View {
    @EnvironmentObject var model: AppModel
    @State private var estimate: Int?
    @State private var estimating = false

    private struct EstimateKey: Equatable { var url: URL?; var ready: Bool; var settings: ConvertSettings }

    var body: some View {
        let s = model.convert
        let targets = model.toolTargets
        let anyAlpha = targets.contains { $0.info?.hasAlpha == true }
        ToolScroll {
            ToolHeader(title: t("convert.title"), subtitle: t("convert.subtitle"))
            if let item = model.selected, item.info != nil {
                SelectedImageCard(item: item, extra: estimateText(item))
            }
            ScopeRow()

            VStack(alignment: .leading, spacing: 16) {
                SettingRow(label: t("setting.format")) {
                    Picker("", selection: $model.convert.format) {
                        ForEach(OutputFormat.available) { Text($0.displayName).tag($0) }
                    }
                    .labelsHidden()
                    .pickerStyle(.segmented)
                    .frame(maxWidth: 360)
                }
                QualityRow(quality: $model.convert.quality, enabled: s.format.isLossy)
                if anyAlpha, !s.format.supportsAlpha {
                    NoticeCard(text: t("notice.transparency", s.format.displayName), systemImage: "exclamationmark.triangle.fill", color: Theme.warning)
                    BackgroundRow(color: $model.convert.background)
                }
                KeepMetadataRow(keep: $model.convert.keepMetadata)
                SettingRow(label: t("setting.suffix")) {
                    SuffixField(suffix: $model.convert.suffix,
                                example: exampleName(base: "photo", suffix: s.suffix, ext: s.format.fileExtension))
                }
                UnavailableFormatsNote()
            }
            .card()

            ProvenanceNotice()
            ExportSection(tool: .convert, runTitle: runTitle("convert.run", count: targets.count)) { model.runConvert() }
        }
        .task(id: EstimateKey(url: model.selected?.url, ready: model.selected?.info != nil, settings: s)) { await updateEstimate() }
    }

    private func estimateText(_ item: FileItem) -> String? {
        guard let info = item.info else { return nil }
        guard let estimate else { return t("estimate.calculating") }
        let delta = percentSaved(info.fileSize, estimate)
        return t("estimate.output", byteString(estimate), delta >= 0 ? "−\(delta)%" : "+\(-delta)%")
    }

    private func updateEstimate() async {
        estimate = nil
        guard let url = model.selected?.url, model.selected?.info != nil else { return }
        let s = model.convert
        try? await Task.sleep(nanoseconds: 300_000_000)
        if Task.isCancelled { return }
        let size = await Task.detached(priority: .utility) { ImageConversionService.estimate(url: url, settings: s) }.value
        if !Task.isCancelled { estimate = size }
    }
}

func exampleName(base: String, suffix: String, ext: String) -> String {
    "\(base)\(ImageExportService.sanitizedSuffix(suffix)).\(ext)"
}

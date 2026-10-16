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
private struct UnavailableFormatsNote: View {
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

private func exampleName(base: String, suffix: String, ext: String) -> String {
    "\(base)\(ImageExportService.sanitizedSuffix(suffix)).\(ext)"
}

// MARK: - Resize

struct ResizeView: View {
    @EnvironmentObject var model: AppModel

    private var selectedSize: (width: Int, height: Int)? {
        guard let info = model.selected?.info else { return nil }
        return (info.width, info.height)
    }

    private var matchingPreset: SizePreset? {
        let s = model.resize
        guard !s.lockAspect else { return nil }   // a locked ratio follows each image, so no preset applies
        return model.allPresets.first { $0.width == s.width && $0.height == s.height }
    }

    var body: some View {
        let s = model.resize
        let targets = model.toolTargets
        let enlarged = targets.filter { item in
            guard let info = item.info else { return false }
            return ImageResizeService.plan(original: (info.width, info.height), settings: s).enlarges
        }.count
        let anyAlpha = targets.contains { $0.info?.hasAlpha == true }
        let outFormat = s.outputFormat

        ToolScroll {
            ToolHeader(title: t("resize.title"), subtitle: t("resize.subtitle"))
            if let item = model.selected, item.info != nil {
                SelectedImageCard(item: item, extra: resultText(s))
            }
            ScopeRow()

            VStack(alignment: .leading, spacing: 16) {
                SettingRow(label: t("setting.resizeBy")) {
                    Picker("", selection: $model.resize.mode) {
                        Text(t("resize.mode.pixels")).tag(ResizeSettings.Mode.pixels)
                        Text(t("resize.mode.percent")).tag(ResizeSettings.Mode.percent)
                    }
                    .labelsHidden().pickerStyle(.segmented).frame(maxWidth: 300)
                }

                if s.mode == .pixels { pixelControls(s) } else { percentControls(s) }

                SettingRow(label: t("setting.outputFormat")) {
                    Picker("", selection: Binding(get: { outFormat }, set: { model.resize.outputFormat = $0 })) {
                        Text(t("format.same")).tag(OutputFormat?.none)
                        ForEach(OutputFormat.available) { Text($0.displayName).tag(OutputFormat?.some($0)) }
                    }
                    .labelsHidden().frame(maxWidth: 220)
                }
                if outFormat == nil || outFormat?.isLossy == true {
                    QualityRow(quality: $model.resize.quality)
                }
                if anyAlpha, outFormat == .jpeg {
                    BackgroundRow(color: $model.resize.background)
                }
                KeepMetadataRow(keep: $model.resize.keepMetadata)
                SettingRow(label: t("setting.suffix")) {
                    SuffixField(suffix: $model.resize.suffix, example: exampleName(base: "photo", suffix: s.suffix, ext: outFormat?.fileExtension ?? "jpg"))
                }
                UnavailableFormatsNote()
            }
            .card()

            if enlarged > 0 {
                NoticeCard(text: t("notice.upscale", enlarged), systemImage: "exclamationmark.triangle.fill", color: Theme.warning)
            }
            ProvenanceNotice()
            ExportSection(tool: .resize, runTitle: runTitle("resize.run", count: targets.count)) { model.runResize() }
        }
    }

    @ViewBuilder
    private func pixelControls(_ s: ResizeSettings) -> some View {
        SettingRow(label: t("setting.preset"), hint: t("setting.preset.hint")) {
            VStack(alignment: .leading, spacing: 8) {
                Picker("", selection: Binding<UUID?>(get: { matchingPreset?.id }, set: { applyPreset($0) })) {
                    Text(t("preset.custom")).tag(UUID?.none)
                    ForEach(model.allPresets) { p in
                        Text(verbatim: "\(p.isBuiltIn ? t("preset.\(p.name)") : p.name) · \(p.width)×\(p.height)").tag(UUID?.some(p.id))
                    }
                }
                .labelsHidden().frame(maxWidth: 340)
                HStack {
                    Button(t("preset.save")) { saveCurrentAsPreset() }.buttonStyle(.brandSecondary)
                    if let p = matchingPreset, !p.isBuiltIn {
                        Button(t("preset.delete")) { model.deletePreset(p.id) }.buttonStyle(.brandSecondary)
                    }
                }
            }
        }

        SettingRow(label: t("setting.dimensions")) {
            HStack(spacing: 8) {
                numberField(t("setting.width"), Binding(get: { s.width }, set: { setWidth($0) }))
                Button {
                    model.resize.lockAspect.toggle()
                    if model.resize.lockAspect { syncLockedDimension() }
                } label: {
                    Image(systemName: s.lockAspect ? "lock.fill" : "lock.open")
                        .foregroundStyle(s.lockAspect ? Theme.accentText : Theme.secondary)
                }
                .buttonStyle(.plain)
                .help(t("setting.lock"))
                .accessibilityLabel(t("setting.lock"))
                .accessibilityValue(s.lockAspect ? t("common.on") : t("common.off"))
                numberField(t("setting.height"), Binding(get: { s.height }, set: { setHeight($0) }))
                Text("px").foregroundStyle(Theme.secondary)
            }
        }

        if !s.lockAspect {
            SettingRow(label: t("setting.fit"), hint: t("fit.\(s.fit.rawValue).hint")) {
                Picker("", selection: $model.resize.fit) {
                    Text(t("fit.fit")).tag(ResizeSettings.Fit.fit)
                    Text(t("fit.fill")).tag(ResizeSettings.Fit.fill)
                    Text(t("fit.stretch")).tag(ResizeSettings.Fit.stretch)
                }
                .labelsHidden().pickerStyle(.segmented).frame(maxWidth: 360)
            }
        }
        SettingRow(label: t("setting.neverEnlarge"), hint: t("setting.neverEnlarge.hint")) {
            Toggle("", isOn: $model.resize.neverEnlarge).labelsHidden().toggleStyle(.switch)
        }
    }

    @ViewBuilder
    private func percentControls(_ s: ResizeSettings) -> some View {
        SettingRow(label: t("setting.percent")) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Slider(value: $model.resize.percent, in: 10...300, step: 1)
                        .accessibilityLabel(t("setting.percent"))
                    Text(verbatim: "\(Int(s.percent))%").monospacedDigit().frame(width: 52, alignment: .trailing)
                }
                HStack(spacing: 6) {
                    ForEach([25, 50, 75, 150, 200], id: \.self) { p in
                        Button(String(p) + "%") { model.resize.percent = Double(p) }.buttonStyle(.brandSecondary)
                    }
                }
            }
        }
        SettingRow(label: t("setting.neverEnlarge"), hint: t("setting.neverEnlarge.hint")) {
            Toggle("", isOn: $model.resize.neverEnlarge).labelsHidden().toggleStyle(.switch)
        }
    }

    private func numberField(_ label: String, _ value: Binding<Int>) -> some View {
        TextField(label, value: value, format: .number.grouping(.never))
            .textFieldStyle(.roundedBorder)
            .multilineTextAlignment(.trailing)
            .frame(width: 84)
            .accessibilityLabel(label)
    }

    // Locked aspect ratio follows the selected image; with a batch, each image follows the typed side.
    private func setWidth(_ v: Int) {
        model.resize.width = max(v, 1)
        model.resize.driver = .width
        if model.resize.lockAspect, let sz = selectedSize {
            model.resize.height = max(Int((Double(model.resize.width) * Double(sz.height) / Double(sz.width)).rounded()), 1)
        }
    }

    private func setHeight(_ v: Int) {
        model.resize.height = max(v, 1)
        model.resize.driver = .height
        if model.resize.lockAspect, let sz = selectedSize {
            model.resize.width = max(Int((Double(model.resize.height) * Double(sz.width) / Double(sz.height)).rounded()), 1)
        }
    }

    private func syncLockedDimension() {
        if model.resize.driver == .width { setWidth(model.resize.width) } else { setHeight(model.resize.height) }
    }

    private func applyPreset(_ id: UUID?) {
        guard let id, let p = model.allPresets.first(where: { $0.id == id }) else { return }
        model.resize.width = p.width
        model.resize.height = p.height
        model.resize.lockAspect = false
    }

    private func saveCurrentAsPreset() {
        let s = model.resize
        guard let name = Dialogs.askText(title: t("preset.save.title"), message: t("preset.save.message", s.width, s.height),
                                         placeholder: t("preset.save.placeholder")) else { return }
        model.savePreset(name: name, width: s.width, height: s.height)
    }

    private func resultText(_ s: ResizeSettings) -> String? {
        guard let sz = selectedSize else { return nil }
        let plan = ImageResizeService.plan(original: sz, settings: s)
        if plan.unchanged { return t("resize.result.unchanged", sz.width, sz.height) }
        let cropped = plan.drawRect.width > Double(plan.canvasWidth) + 0.5 || plan.drawRect.height > Double(plan.canvasHeight) + 0.5
        return t(cropped ? "resize.result.cropped" : "resize.result", sz.width, sz.height, plan.canvasWidth, plan.canvasHeight)
    }
}

// MARK: - Compress

struct CompressView: View {
    @EnvironmentObject var model: AppModel
    @State private var preview: ImageCompressionService.Preview?
    @State private var previewError: String?
    @State private var working = false

    private struct PreviewKey: Equatable { var url: URL?; var ready: Bool; var settings: CompressSettings }

    var body: some View {
        let s = model.compress
        let targets = model.toolTargets
        let outFormat = s.format ?? model.selected?.info.map { ImageCodec.sameFormat(as: $0) } ?? .jpeg
        let anyAlpha = targets.contains { $0.info?.hasAlpha == true }

        ToolScroll {
            ToolHeader(title: t("compress.title"), subtitle: t("compress.subtitle"))
            if let item = model.selected, item.info != nil { comparison(item) }
            ScopeRow()

            VStack(alignment: .leading, spacing: 16) {
                SettingRow(label: t("setting.outputFormat")) {
                    Picker("", selection: Binding(get: { s.format }, set: { model.compress.format = $0 })) {
                        Text(t("format.same")).tag(OutputFormat?.none)
                        ForEach(OutputFormat.available) { Text($0.displayName).tag(OutputFormat?.some($0)) }
                    }
                    .labelsHidden().frame(maxWidth: 220)
                }
                QualityRow(quality: $model.compress.quality, enabled: outFormat.isLossy && !s.useTargetSize)

                SettingRow(label: t("setting.targetSize"), hint: t("setting.targetSize.hint")) {
                    HStack(spacing: 10) {
                        Toggle("", isOn: $model.compress.useTargetSize).labelsHidden().toggleStyle(.switch)
                            .disabled(!outFormat.isLossy)
                        TextField("", value: $model.compress.targetKB, format: .number.grouping(.never))
                            .textFieldStyle(.roundedBorder)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 84)
                            .disabled(!s.useTargetSize || !outFormat.isLossy)
                            .accessibilityLabel(t("setting.targetSize"))
                        Text("KB").foregroundStyle(Theme.secondary)
                    }
                }
                if !outFormat.isLossy {
                    Label(t("compress.lossless.note", outFormat.displayName), systemImage: "info.circle")
                        .font(.caption).foregroundStyle(Theme.secondary)
                }
                if anyAlpha, outFormat == .jpeg { BackgroundRow(color: $model.compress.background) }
                KeepMetadataRow(keep: $model.compress.keepMetadata)
                SettingRow(label: t("setting.suffix")) {
                    SuffixField(suffix: $model.compress.suffix, example: exampleName(base: "photo", suffix: s.suffix, ext: outFormat.fileExtension))
                }
                UnavailableFormatsNote()
            }
            .card()

            NoticeCard(text: t("compress.reencode.note"))
            ProvenanceNotice()
            ExportSection(tool: .compress, runTitle: runTitle("compress.run", count: targets.count)) { model.runCompress() }
        }
        .task(id: PreviewKey(url: model.selected?.url, ready: model.selected?.info != nil, settings: s)) { await updatePreview() }
    }

    @ViewBuilder
    private func comparison(_ item: FileItem) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionTitle(text: t("compress.preview.title"))
            HStack(alignment: .top, spacing: 16) {
                pane(title: t("compress.before"), image: item.thumb, bytes: item.info?.fileSize)
                pane(title: t("compress.after"),
                     image: preview?.thumbnail.map { NSImage(cgImage: $0, size: NSSize(width: $0.width, height: $0.height)) },
                     bytes: preview?.processed.data.count, loading: working && preview == nil)
            }
            if let p = preview {
                let saved = percentSaved(p.originalBytes, p.processed.data.count)
                HStack(spacing: 8) {
                    Chip(text: saved >= 0 ? t("compress.saved", saved) : t("compress.larger", -saved),
                         color: saved > 0 ? Theme.success : Theme.warning)
                    Text(verbatim: "\(byteString(p.originalBytes)) → \(byteString(p.processed.data.count))").font(.callout)
                    if working { ProgressView().controlSize(.small) }
                }
                ForEach(p.processed.notes, id: \.self) { Text($0).font(.caption).foregroundStyle(Theme.warning) }
                if !p.curve.isEmpty { curve(p) }
            } else if let previewError {
                Text(previewError).font(.callout).foregroundStyle(Theme.danger)
            }
        }
        .card()
    }

    private func pane(title: String, image: NSImage?, bytes: Int?, loading: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.subheadline.weight(.semibold))
            ZStack {
                Rectangle().fill(Color.black.opacity(0.05))
                if let image { Image(nsImage: image).resizable().scaledToFit() }
                else if loading { ProgressView() }
            }
            .frame(height: 220)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.border))
            if let bytes { Text(byteString(bytes)).font(.callout.monospacedDigit()).foregroundStyle(Theme.secondary) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Output size at fixed quality steps, so the cost of each notch of quality is visible.
    private func curve(_ p: ImageCompressionService.Preview) -> some View {
        let maxBytes = Double(max(p.curve.map(\.bytes).max() ?? 1, p.originalBytes, 1))
        return VStack(alignment: .leading, spacing: 6) {
            Text(t("compress.tradeoff")).font(.subheadline.weight(.semibold))
            ForEach(p.curve, id: \.quality) { point in
                HStack(spacing: 10) {
                    Text(verbatim: "\(point.quality)%").font(.caption.monospacedDigit()).frame(width: 40, alignment: .trailing)
                    GeometryReader { geo in
                        RoundedRectangle(cornerRadius: 4).fill(Theme.orange.opacity(0.75))
                            .frame(width: geo.size.width * Double(point.bytes) / maxBytes)
                    }
                    .frame(height: 10)
                    Text(byteString(point.bytes)).font(.caption.monospacedDigit()).frame(width: 74, alignment: .trailing)
                }
            }
            Text(t("compress.tradeoff.note")).font(.caption).foregroundStyle(Theme.secondary)
        }
        .accessibilityElement(children: .combine)
    }

    private func updatePreview() async {
        previewError = nil
        guard let url = model.selected?.url, model.selected?.info != nil else { preview = nil; return }
        working = true
        defer { working = false }
        let s = model.compress
        try? await Task.sleep(nanoseconds: 350_000_000)
        if Task.isCancelled { return }
        let result = await Task.detached(priority: .utility) {
            Result { try ImageCompressionService.preview(url: url, settings: s) }
        }.value
        if Task.isCancelled { return }
        switch result {
        case .success(let p): preview = p
        case .failure(let e): preview = nil; previewError = e.localizedDescription
        }
    }
}

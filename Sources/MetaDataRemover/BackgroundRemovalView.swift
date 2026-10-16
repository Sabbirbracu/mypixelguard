import SwiftUI

struct BackgroundRemovalView: View {
    @EnvironmentObject var model: AppModel
    @State private var preview: CGImage?
    @State private var previewError: String?
    @State private var working = false

    private struct PreviewKey: Equatable { var url: URL?; var ready: Bool; var settings: BackgroundRemovalSettings }

    var body: some View {
        let s = model.background
        let targets = model.toolTargets
        let format = s.effectiveFormat

        ToolScroll {
            ToolHeader(title: t("bg.title"), subtitle: t("bg.subtitle"))
            if !BackgroundRemovalService.isSupported {
                NoticeCard(text: t("bg.unavailable"), systemImage: "exclamationmark.triangle.fill", color: Theme.warning)
            }
            if let item = model.selected, item.info != nil { comparison(item, settings: s) }
            ScopeRow()

            VStack(alignment: .leading, spacing: 16) {
                SettingRow(label: t("bg.fill")) {
                    Picker("", selection: $model.background.fill) {
                        ForEach(BackgroundRemovalSettings.Fill.allCases) { Text(t("bg.fill.\($0.rawValue)")).tag($0) }
                    }
                    .labelsHidden().pickerStyle(.segmented).frame(maxWidth: 320)
                }
                if s.fill == .color {
                    SettingRow(label: t("bg.color")) {
                        HStack(spacing: 10) {
                            ColorPicker("", selection: $model.background.color, supportsOpacity: false).labelsHidden()
                            Button(t("setting.background.white")) { model.background.color = .white }.buttonStyle(.brandSecondary)
                            Button(t("setting.background.black")) { model.background.color = .black }.buttonStyle(.brandSecondary)
                        }
                    }
                }
                SettingRow(label: t("setting.format")) {
                    Picker("", selection: Binding(get: { format }, set: { model.background.format = $0 })) {
                        ForEach(s.availableFormats) { Text($0.displayName).tag($0) }
                    }
                    .labelsHidden().pickerStyle(.segmented).frame(maxWidth: 360)
                }
                QualityRow(quality: $model.background.quality, enabled: format.isLossy)
                SettingRow(label: t("bg.edge"), hint: t("bg.edge.hint")) {
                    HStack {
                        Slider(value: $model.background.edgeSmoothing, in: 0...1)
                            .accessibilityLabel(t("bg.edge"))
                        Text(verbatim: "\(Int((s.edgeSmoothing * 100).rounded()))%")
                            .monospacedDigit().frame(width: 44, alignment: .trailing)
                    }
                }
                KeepMetadataRow(keep: $model.background.keepMetadata)
                SettingRow(label: t("setting.suffix")) {
                    SuffixField(suffix: $model.background.suffix,
                                example: "photo\(ImageExportService.sanitizedSuffix(s.suffix)).\(format.fileExtension)")
                }
            }
            .card()

            NoticeCard(text: t("bg.quality.note"), systemImage: "checkmark.seal.fill", color: Theme.success)
            ProvenanceNotice()
            ExportSection(tool: .background, runTitle: runTitle("bg.run", count: targets.count)) { model.runBackgroundRemoval() }
        }
        .task(id: PreviewKey(url: model.selected?.url, ready: model.selected?.info != nil, settings: s)) { await updatePreview() }
    }

    // MARK: Preview

    @ViewBuilder
    private func comparison(_ item: FileItem, settings s: BackgroundRemovalSettings) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionTitle(text: t("bg.preview.title"))
            HStack(alignment: .top, spacing: 16) {
                pane(title: t("bg.before"), content: item.thumb.map { Image(nsImage: $0) }, checkerboard: false, loading: false)
                pane(title: t("bg.after"),
                     content: preview.map { Image(decorative: $0, scale: 1) },
                     checkerboard: s.fill == .transparent, loading: working && preview == nil)
            }
            if let previewError {
                Text(previewError).font(.callout).foregroundStyle(Theme.danger)
            }
        }
        .card()
    }

    private func pane(title: String, content: Image?, checkerboard: Bool, loading: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.subheadline.weight(.semibold))
            ZStack {
                if checkerboard { Checkerboard() } else { Rectangle().fill(Color.black.opacity(0.05)) }
                if let content { content.resizable().scaledToFit() }
                else if loading { ProgressView() }
                if working, content != nil, checkerboard {
                    ProgressView().controlSize(.small).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing).padding(8)
                }
            }
            .frame(height: 260)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.border))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func updatePreview() async {
        previewError = nil
        guard BackgroundRemovalService.isSupported, let url = model.selected?.url, model.selected?.info != nil else {
            preview = nil
            return
        }
        working = true
        defer { working = false }
        let s = model.background
        try? await Task.sleep(nanoseconds: 350_000_000)
        if Task.isCancelled { return }
        let result = await Task.detached(priority: .utility) {
            Result { try BackgroundRemovalService.preview(url: url, settings: s) }
        }.value
        if Task.isCancelled { return }
        switch result {
        case .success(let image): preview = image
        case .failure(let error): preview = nil; previewError = error.localizedDescription
        }
    }
}

/// Neutral transparency grid, readable in light and dark mode.
private struct Checkerboard: View {
    var body: some View {
        Canvas { context, size in
            let cell: CGFloat = 12
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(white: 0.97)))
            for row in 0..<Int(ceil(size.height / cell)) {
                for col in 0..<Int(ceil(size.width / cell)) where (row + col) % 2 == 1 {
                    context.fill(Path(CGRect(x: CGFloat(col) * cell, y: CGFloat(row) * cell, width: cell, height: cell)),
                                 with: .color(Color(white: 0.85)))
                }
            }
        }
    }
}

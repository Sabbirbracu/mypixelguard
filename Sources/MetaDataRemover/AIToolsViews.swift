import SwiftUI
import ImageIO

/// AI Tools: a live before/after on the left, one tile per tool on the right, one button at the bottom.
struct AIImageToolsView: View {
    @EnvironmentObject var model: AppModel
    @State private var preview: AIImageToolsService.Preview?
    @State private var previewError: String?
    @State private var working = false
    @State private var beforeImage: NSImage?
    @State private var moreOptions = false

    /// Only what changes the pixels; output format, quality and file name must not re-run Vision.
    private struct PreviewKey: Equatable {
        var url: URL?
        var ready: Bool
        var enhance: Bool, upscale: Bool, factor: Int, smartCrop: Bool, aspect: CropAspect, background: Bool
    }

    private var previewKey: PreviewKey {
        let s = model.aiTools
        return PreviewKey(url: model.selected?.url, ready: model.selected?.info != nil,
                          enhance: s.enhance, upscale: s.upscale, factor: s.upscaleFactor,
                          smartCrop: s.smartCrop, aspect: s.cropAspect, background: s.removeBackground)
    }

    /// The format that will actually be written. Background removal needs alpha, so JPEG becomes PNG.
    private var outFormat: OutputFormat {
        let base = model.aiTools.format ?? model.selected?.info.map { ImageCodec.sameFormat(as: $0) } ?? .png
        return model.aiTools.removeBackground && base == .jpeg ? .png : base
    }

    var body: some View {
        VStack(spacing: 0) {
            if let item = model.selected, item.info != nil {
                HStack(spacing: 0) {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            comparison(item)
                            summaryCard(item)
                        }
                        .padding(16)
                    }
                    .frame(maxWidth: .infinity)
                    Rectangle().fill(Theme.border).frame(width: 1)
                    settingsPanel
                        .frame(width: 340)
                        .background(Theme.surface)
                }
                footer
            } else if model.selected != nil {
                Text(t("compress.unreadable")).foregroundStyle(Theme.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                Text(t("detail.selectImage")).foregroundStyle(Theme.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task(id: previewKey) { await updatePreview() }
        .task(id: model.selected?.url) { await loadBefore() }
    }

    // MARK: Before / after

    private func comparison(_ item: FileItem) -> some View {
        let s = model.aiTools
        return HStack(spacing: 0) {
            pane(title: t("compress.before"), image: beforeImage ?? item.thumb, caption: dimensions(item), highlighted: false,
                 checkerboard: false, loading: false)
            Rectangle().fill(Theme.border).frame(width: 1)
            pane(title: t("compress.after"), image: afterImage, caption: afterCaption(item), highlighted: true,
                 checkerboard: s.removeBackground, loading: working && preview == nil, empty: !s.hasTool)
        }
        .frame(height: 340)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.sidebar))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.border))
    }

    private var afterImage: NSImage? {
        guard model.aiTools.hasTool, let cg = preview?.image else { return nil }
        return NSImage(cgImage: cg, size: NSSize(width: cg.width, height: cg.height))
    }

    private func dimensions(_ item: FileItem) -> String? {
        item.info.map { "\($0.width) × \($0.height)" }
    }

    private func afterCaption(_ item: FileItem) -> String? {
        guard model.aiTools.hasTool, let p = preview else { return nil }
        return "\(p.finalWidth) × \(p.finalHeight)"
    }

    private func pane(title: String, image: NSImage?, caption: String?, highlighted: Bool,
                      checkerboard: Bool, loading: Bool, empty: Bool = false) -> some View {
        ZStack {
            if checkerboard, image != nil { Checkerboard().padding(10).opacity(0.9) }
            if let image {
                Image(nsImage: image).resizable().interpolation(.high).scaledToFit().padding(10)
            } else if empty {
                VStack(spacing: 8) {
                    Image(systemName: "wand.and.stars").font(.system(size: 26)).foregroundStyle(Theme.secondary)
                    Text(t("ai.summary.none")).font(.callout).foregroundStyle(Theme.secondary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(28)
            } else if loading {
                ProgressView()
            }
            VStack {
                HStack {
                    Text(title)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .background(Capsule().fill(highlighted ? Theme.orange : Theme.secondary.opacity(0.85)))
                        .foregroundStyle(highlighted ? Theme.onAccent : .white)
                    Spacer()
                    if highlighted && working && preview != nil { ProgressView().controlSize(.small) }
                }
                Spacer()
                HStack {
                    if let caption {
                        Text(caption)
                            .font(.callout.weight(.semibold).monospacedDigit())
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .background(Capsule().fill(Theme.surface.opacity(0.92)))
                            .overlay(Capsule().stroke(Theme.border))
                    }
                    Spacer()
                }
            }
            .padding(12)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: Summary

    private func summaryCard(_ item: FileItem) -> some View {
        let s = model.aiTools
        return VStack(alignment: .leading, spacing: 14) {
            if let info = item.info, s.hasTool, let p = preview {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(verbatim: "\(info.width) × \(info.height)  →  \(p.finalWidth) × \(p.finalHeight)")
                        .font(BrandTypography.font(size: 22, weight: .bold))
                        .monospacedDigit()
                        .lineLimit(1).minimumScaleFactor(0.7)
                    Spacer(minLength: 8)
                    Chip(text: t("ai.footer.tools", activeSteps.count), color: Theme.success)
                }
            } else if let previewError, s.hasTool {
                Label(previewError, systemImage: "xmark.octagon.fill").font(.callout).foregroundStyle(Theme.danger)
            } else if s.hasTool {
                HStack(spacing: 10) { ProgressView().controlSize(.small); Text(t("compress.calculating")).foregroundStyle(Theme.secondary) }
            } else {
                Label(t("ai.summary.none"), systemImage: "info.circle.fill").font(.callout).foregroundStyle(Theme.info)
            }

            if s.hasTool {
                VStack(alignment: .leading, spacing: 8) {
                    Text(t("ai.summary.title")).font(.caption.weight(.semibold)).foregroundStyle(Theme.secondary)
                    HStack(spacing: 6) {
                        ForEach(Array(activeSteps.enumerated()), id: \.offset) { index, step in
                            if index > 0 {
                                Image(systemName: "chevron.right").font(.caption2.weight(.bold)).foregroundStyle(Theme.secondary)
                            }
                            Label(step.title, systemImage: step.symbol)
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 10).padding(.vertical, 5)
                                .background(Capsule().fill(Theme.orange.opacity(0.14)))
                                .foregroundStyle(Theme.accentText)
                        }
                    }
                }
                if s.upscale {
                    Label(t("ai.preview.note"), systemImage: "info.circle")
                        .font(.caption).foregroundStyle(Theme.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if s.removeBackground, !BackgroundRemovalService.isSupported {
                    Label(t("ai.background.unavailable"), systemImage: "exclamationmark.triangle.fill")
                        .font(.caption).foregroundStyle(Theme.warning)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .card()
    }

    /// The tools in the order the pipeline runs them.
    private var activeSteps: [(title: String, symbol: String)] {
        let s = model.aiTools
        var steps: [(String, String)] = []
        if s.smartCrop { steps.append((t("ai.smartCrop"), "viewfinder")) }
        if s.enhance { steps.append((t("ai.enhance"), "wand.and.rays")) }
        if s.removeBackground { steps.append((t("ai.background"), "person.crop.rectangle")) }
        if s.upscale { steps.append((t("ai.upscale") + " \(s.upscaleFactor)×", "arrow.up.left.and.arrow.down.right")) }
        return steps
    }

    // MARK: Settings panel

    private var settingsPanel: some View {
        let s = model.aiTools
        return ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                if let batch = model.batch, batch.tool == .enhance { BatchView(batch: batch) }
                ScopeRow()

                VStack(alignment: .leading, spacing: 10) {
                    Text(t("ai.tools.title")).font(.title3.weight(.bold))
                    ToolTile(symbol: "wand.and.rays", title: t("ai.enhance"), hint: t("ai.enhance.hint"), isOn: $model.aiTools.enhance)
                    ToolTile(symbol: "viewfinder", title: t("ai.smartCrop"), hint: t("ai.smartCrop.hint"), isOn: $model.aiTools.smartCrop) {
                        aspectPicker
                    }
                    ToolTile(symbol: "person.crop.rectangle", title: t("ai.background"), hint: t("ai.background.hint"), isOn: $model.aiTools.removeBackground) {
                        if !BackgroundRemovalService.isSupported {
                            Label(t("ai.background.unavailable"), systemImage: "exclamationmark.triangle.fill")
                                .font(.caption).foregroundStyle(Theme.warning)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    ToolTile(symbol: "arrow.up.left.and.arrow.down.right", title: t("ai.upscale"), hint: t("ai.upscale.hint"), isOn: $model.aiTools.upscale) {
                        Picker("", selection: $model.aiTools.upscaleFactor) {
                            Text("2×").tag(2); Text("3×").tag(3); Text("4×").tag(4)
                        }
                        .labelsHidden().pickerStyle(.segmented)
                        .accessibilityLabel(t("ai.scale"))
                    }
                }

                Divider()

                VStack(alignment: .leading, spacing: 10) {
                    Text(t("setting.outputFormat")).font(.title3.weight(.bold))
                    Picker("", selection: $model.aiTools.format) {
                        Text(t("format.same")).tag(OutputFormat?.none)
                        ForEach(OutputFormat.available) { Text($0.displayName).tag(OutputFormat?.some($0)) }
                    }
                    .labelsHidden()
                    .frame(maxWidth: .infinity)
                    if s.removeBackground, (s.format ?? model.selected?.info.map { ImageCodec.sameFormat(as: $0) }) == .jpeg {
                        Label(t("ai.format.png"), systemImage: "info.circle")
                            .font(.caption).foregroundStyle(Theme.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                if outFormat.isLossy {
                    qualitySection(s)
                } else {
                    Label(t("setting.quality.lossless"), systemImage: "checkmark.seal.fill")
                        .font(.callout).foregroundStyle(Theme.secondary)
                }

                Divider()
                VStack(alignment: .leading, spacing: 10) {
                    Text(t("setting.keepMetadata")).font(.title3.weight(.bold))
                    HStack(alignment: .top, spacing: 12) {
                        Text(t("setting.keepMetadata.hint")).font(.callout).foregroundStyle(Theme.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 8)
                        Toggle("", isOn: keepMetadata).labelsHidden().toggleStyle(.switch)
                            .accessibilityLabel(t("setting.keepMetadata"))
                    }
                }

                moreSection(s)

                VStack(alignment: .leading, spacing: 10) {
                    ProvenanceNotice()
                    Label(t("ai.local"), systemImage: "laptopcomputer.and.lock")
                        .font(.caption).foregroundStyle(Theme.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(20)
        }
    }

    /// The model stores "strip metadata"; the panel asks "keep metadata", like the other tools.
    private var keepMetadata: Binding<Bool> {
        Binding(get: { !model.aiTools.cleanMetadata }, set: { model.aiTools.cleanMetadata = !$0 })
    }

    private var aspectPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                ForEach(CropAspect.allCases) { aspect in
                    let selected = model.aiTools.cropAspect == aspect
                    Button { model.aiTools.cropAspect = aspect } label: {
                        VStack(spacing: 4) {
                            Image(systemName: aspect.symbol).font(.system(size: 15, weight: .medium))
                            Text(verbatim: aspect.label).font(.caption.weight(selected ? .semibold : .regular))
                        }
                        .foregroundStyle(selected ? Theme.accentText : Theme.ink)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(selected ? Theme.orange.opacity(0.14) : Theme.surface))
                        .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .stroke(selected ? Theme.orange.opacity(0.7) : Theme.border, lineWidth: selected ? 1.5 : 1))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(t("ai.aspect.\(aspect.rawValue)"))
                }
            }
            Text(t("ai.aspect.\(model.aiTools.cropAspect.rawValue)")).font(.caption).foregroundStyle(Theme.secondary)
        }
    }

    private func qualitySection(_ s: AIImageSettings) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(t("setting.quality")).font(.title3.weight(.bold))
                Spacer()
                Text(verbatim: "\(Int((s.quality * 100).rounded()))%")
                    .font(.callout.weight(.bold).monospacedDigit())
                    .foregroundStyle(Theme.accentText)
            }
            Slider(value: $model.aiTools.quality, in: 0.05...1)
                .accessibilityLabel(t("setting.quality"))
            HStack {
                Text(t("compress.quality.smaller")); Spacer(); Text(t("compress.quality.better"))
            }
            .font(.caption).foregroundStyle(Theme.secondary)
        }
    }

    private func moreSection(_ s: AIImageSettings) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Button { withAnimation(.easeInOut(duration: 0.15)) { moreOptions.toggle() } } label: {
                HStack(spacing: 8) {
                    Image(systemName: "chevron.right").font(.caption.weight(.bold))
                        .rotationEffect(.degrees(moreOptions ? 90 : 0))
                    Text(t("compress.more")).font(.callout)
                    Spacer()
                }
                .foregroundStyle(Theme.ink)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if moreOptions {
                VStack(alignment: .leading, spacing: 5) {
                    Text(t("setting.suffix")).font(.caption.weight(.semibold)).foregroundStyle(Theme.secondary)
                    SuffixField(suffix: $model.aiTools.suffix,
                                example: exampleName(base: "photo", suffix: s.suffix, ext: outFormat.fileExtension))
                }
            }
        }
    }

    // MARK: Footer

    private var footer: some View {
        let s = model.aiTools
        let targets = model.toolTargets
        let detail = s.hasTool ? t("ai.footer.tools", activeSteps.count) : t("ai.footer.none")
        return VStack(spacing: 0) {
            Rectangle().fill(Theme.border).frame(height: 1)
            HStack(spacing: 14) {
                Image(systemName: "lock").foregroundStyle(Theme.secondary)
                Text(t("inspect.footer.untouched")).font(.callout).foregroundStyle(Theme.secondary)
                Spacer(minLength: 12)
                Label("\(t(targets.count == 1 ? "files.count.one" : "files.count.many", targets.count)) · \(detail)",
                      systemImage: "photo.stack")
                    .font(.callout.weight(.medium)).lineLimit(1)
                Spacer(minLength: 12)
                if model.isBatchRunning { ProgressView().controlSize(.small) }
                Button { model.runAITools() } label: {
                    Label(runTitle("ai.run", count: targets.count), systemImage: Tool.enhance.symbol)
                }
                .buttonStyle(.brandPrimary)
                .keyboardShortcut(.return, modifiers: .command)
                .disabled(targets.isEmpty || model.isBatchRunning || !s.hasTool)
            }
            .padding(.horizontal, 24).padding(.vertical, 14)
        }
        .background(Theme.surface)
    }

    // MARK: Work

    private func loadBefore() async {
        beforeImage = nil
        guard let url = model.selected?.url else { return }
        beforeImage = await Task.detached(priority: .userInitiated) {
            guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil as NSImage? }
            let options: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 900
            ]
            guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
            return NSImage(cgImage: cg, size: NSSize(width: cg.width, height: cg.height))
        }.value
    }

    private func updatePreview() async {
        previewError = nil
        guard let url = model.selected?.url, model.selected?.info != nil, model.aiTools.hasTool else {
            preview = nil
            return
        }
        working = true
        defer { working = false }
        let s = model.aiTools
        try? await Task.sleep(nanoseconds: 350_000_000)
        if Task.isCancelled { return }
        let result = await Task.detached(priority: .utility) {
            Result { try AIImageToolsService.preview(url: url, settings: s) }
        }.value
        if Task.isCancelled { return }
        switch result {
        case .success(let p): preview = p
        case .failure(let e): preview = nil; previewError = e.localizedDescription
        }
    }
}

private extension CropAspect {
    var symbol: String {
        switch self { case .square: "square"; case .portrait: "rectangle.portrait"; case .landscape: "rectangle" }
    }
    var label: String {
        switch self { case .square: "1:1"; case .portrait: "4:5"; case .landscape: "16:9" }
    }
}

/// One AI tool: an icon, a switch, and its own options once it is on.
private struct ToolTile<Options: View>: View {
    let symbol: String
    let title: String
    let hint: String
    @Binding var isOn: Bool
    @ViewBuilder var options: Options

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: symbol)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(isOn ? Theme.onAccent : Theme.accentText)
                    .frame(width: 32, height: 32)
                    .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(isOn ? Theme.orange : Theme.orange.opacity(0.14)))
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.callout.weight(.semibold))
                    Text(hint).font(.caption).foregroundStyle(Theme.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 6)
                Toggle("", isOn: $isOn).labelsHidden().toggleStyle(.switch)
                    .accessibilityLabel(title)
            }
            if isOn { options }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(isOn ? Theme.orange.opacity(0.07) : Theme.canvas))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
            .stroke(isOn ? Theme.orange.opacity(0.6) : Theme.border, lineWidth: isOn ? 1.5 : 1))
        .animation(.easeInOut(duration: 0.15), value: isOn)
    }
}

private extension ToolTile where Options == EmptyView {
    init(symbol: String, title: String, hint: String, isOn: Binding<Bool>) {
        self.init(symbol: symbol, title: title, hint: hint, isOn: isOn) { EmptyView() }
    }
}

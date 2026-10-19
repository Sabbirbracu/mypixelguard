import SwiftUI
import ImageIO

/// Compress: a live before/after on the left, a short list of choices on the right, one button at the bottom.
struct CompressView: View {
    @EnvironmentObject var model: AppModel
    @State private var preview: ImageCompressionService.Preview?
    @State private var previewError: String?
    @State private var working = false
    @State private var beforeImage: NSImage?
    @State private var moreOptions = false

    private struct PreviewKey: Equatable { var url: URL?; var ready: Bool; var settings: CompressSettings }

    private var outFormat: OutputFormat {
        model.compress.format ?? model.selected?.info.map { ImageCodec.sameFormat(as: $0) } ?? .jpeg
    }

    var body: some View {
        VStack(spacing: 0) {
            if let item = model.selected, item.info != nil {
                HStack(spacing: 0) {
                    ScrollView {
                        VStack(spacing: 16) {
                            comparison(item)
                            resultCard(item)
                            if let preview, !preview.curve.isEmpty { tradeoffCard(preview) }
                        }
                        .padding(16)
                    }
                    .frame(maxWidth: .infinity)
                    Rectangle().fill(Theme.border).frame(width: 1)
                    settingsPanel(item)
                        .frame(width: 330)
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
        .task(id: PreviewKey(url: model.selected?.url, ready: model.selected?.info != nil, settings: model.compress)) {
            await updatePreview()
        }
        .task(id: model.selected?.url) { await loadBefore() }
    }

    // MARK: Before / after

    private func comparison(_ item: FileItem) -> some View {
        let afterImage = preview?.thumbnail.map { NSImage(cgImage: $0, size: NSSize(width: $0.width, height: $0.height)) }
        return HStack(spacing: 0) {
            pane(title: t("compress.before"), image: beforeImage ?? item.thumb, bytes: item.info?.fileSize, highlighted: false)
            Rectangle().fill(Theme.border).frame(width: 1)
            pane(title: t("compress.after"), image: afterImage, bytes: preview?.processed.data.count,
                 highlighted: true, loading: working && preview == nil)
        }
        .frame(height: 330)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.sidebar))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.border))
    }

    private func pane(title: String, image: NSImage?, bytes: Int?, highlighted: Bool, loading: Bool = false) -> some View {
        ZStack {
            if let image {
                Image(nsImage: image).resizable().interpolation(.high).scaledToFit()
                    .padding(10)
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
                    if let bytes {
                        Text(byteString(bytes))
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

    // MARK: Result

    private func resultCard(_ item: FileItem) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if let p = preview {
                let before = p.originalBytes
                let after = p.processed.data.count
                let saved = percentSaved(before, after)
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(verbatim: "\(byteString(before))  →  \(byteString(after))")
                        .font(BrandTypography.font(size: 24, weight: .bold))
                        .monospacedDigit()
                    Spacer()
                    Chip(text: saved >= 0 ? t("compress.saved", saved) : t("compress.larger", -saved),
                         color: saved > 0 ? Theme.success : Theme.warning)
                }
                GeometryReader { geo in
                    let ratio = min(max(Double(after) / Double(max(before, 1)), 0.02), 1)
                    ZStack(alignment: .leading) {
                        Capsule().fill(Theme.secondary.opacity(0.18))
                        Capsule().fill(saved > 0 ? Theme.success : Theme.warning).frame(width: geo.size.width * ratio)
                    }
                }
                .frame(height: 8)
                ForEach(p.processed.notes, id: \.self) {
                    Label($0, systemImage: "exclamationmark.triangle.fill").font(.caption).foregroundStyle(Theme.warning)
                }
            } else if let previewError {
                Label(previewError, systemImage: "xmark.octagon.fill").font(.callout).foregroundStyle(Theme.danger)
            } else {
                HStack(spacing: 10) { ProgressView().controlSize(.small); Text(t("compress.calculating")).foregroundStyle(Theme.secondary) }
            }
        }
        .card()
    }

    /// Output size at fixed quality steps, so the cost of each notch of quality is visible.
    private func tradeoffCard(_ p: ImageCompressionService.Preview) -> some View {
        let maxBytes = Double(max(p.curve.map(\.bytes).max() ?? 1, p.originalBytes, 1))
        let current = Int((model.compress.quality * 100).rounded())
        let nearest = p.curve.min { abs($0.quality - current) < abs($1.quality - current) }?.quality
        return VStack(alignment: .leading, spacing: 12) {
            CardHeader(symbol: "chart.bar.fill", title: t("compress.tradeoff"), subtitle: t("compress.tradeoff.note"))
            VStack(spacing: 8) {
                ForEach(p.curve, id: \.quality) { point in
                    let highlighted = !model.compress.useTargetSize && point.quality == nearest
                    HStack(spacing: 10) {
                        Text(verbatim: "\(point.quality)%").font(.caption.monospacedDigit()).frame(width: 40, alignment: .trailing)
                            .foregroundStyle(highlighted ? Theme.accentText : Theme.secondary)
                        GeometryReader { geo in
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Theme.orange.opacity(highlighted ? 1 : 0.45))
                                .frame(width: geo.size.width * Double(point.bytes) / maxBytes)
                        }
                        .frame(height: 10)
                        Text(byteString(point.bytes)).font(.caption.monospacedDigit()).frame(width: 74, alignment: .trailing)
                    }
                }
            }
            .accessibilityElement(children: .combine)
        }
        .card()
    }

    // MARK: Settings panel

    private func settingsPanel(_ item: FileItem) -> some View {
        let s = model.compress
        let lossy = outFormat.isLossy
        let anyAlpha = model.toolTargets.contains { $0.info?.hasAlpha == true }
        return ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                if let batch = model.batch, batch.tool == .compress { BatchView(batch: batch) }
                ScopeRow()

                section(t("setting.outputFormat")) {
                    Picker("", selection: Binding(get: { s.format }, set: { model.compress.format = $0 })) {
                        Text(t("format.same")).tag(OutputFormat?.none)
                        ForEach(OutputFormat.available) { Text($0.displayName).tag(OutputFormat?.some($0)) }
                    }
                    .labelsHidden()
                    .frame(maxWidth: .infinity)
                }

                Divider()

                if lossy {
                    qualitySection(s)
                    Divider()
                    targetSection(s)
                } else {
                    losslessTile
                }

                Divider()
                section(t("setting.keepMetadata")) {
                    HStack(alignment: .top, spacing: 12) {
                        Text(t("setting.keepMetadata.hint")).font(.callout).foregroundStyle(Theme.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 8)
                        Toggle("", isOn: $model.compress.keepMetadata).labelsHidden().toggleStyle(.switch)
                            .accessibilityLabel(t("setting.keepMetadata"))
                    }
                }

                moreSection(s, anyAlpha: anyAlpha)

                VStack(alignment: .leading, spacing: 10) {
                    ProvenanceNotice()
                    Label(t("compress.reencode.note"), systemImage: "info.circle")
                        .font(.caption).foregroundStyle(Theme.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    UnavailableFormatsNote()
                }
            }
            .padding(20)
        }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.title3.weight(.bold))
            content()
        }
    }

    private func qualitySection(_ s: CompressSettings) -> some View {
        let locked = s.useTargetSize
        let percent = Int((s.quality * 100).rounded())
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(t("setting.quality")).font(.title3.weight(.bold))
                Spacer()
                Text(verbatim: "\(percent)%")
                    .font(.callout.weight(.bold).monospacedDigit())
                    .foregroundStyle(locked ? Theme.secondary : Theme.accentText)
            }
            Slider(value: $model.compress.quality, in: 0.05...1)
                .disabled(locked)
                .accessibilityLabel(t("setting.quality"))
            HStack {
                Text(t("compress.quality.smaller")); Spacer(); Text(t("compress.quality.better"))
            }
            .font(.caption).foregroundStyle(Theme.secondary)
            HStack(spacing: 8) {
                presetChip(t("compress.preset.small"), value: 0.5, current: s.quality, disabled: locked)
                presetChip(t("compress.preset.balanced"), value: 0.75, current: s.quality, disabled: locked)
                presetChip(t("compress.preset.high"), value: 0.9, current: s.quality, disabled: locked)
            }
            if locked {
                Label(t("compress.quality.locked"), systemImage: "lock.fill")
                    .font(.caption).foregroundStyle(Theme.secondary)
            }
        }
    }

    private func presetChip(_ title: String, value: Double, current: Double, disabled: Bool) -> some View {
        let selected = abs(current - value) < 0.005
        return Button { model.compress.quality = value } label: {
            Text(title)
                .font(.callout.weight(selected ? .semibold : .regular))
                .foregroundStyle(selected ? Theme.accentText : Theme.ink)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 7)
                .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(selected ? Theme.orange.opacity(0.14) : Theme.canvas))
                .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .stroke(selected ? Theme.orange.opacity(0.7) : Theme.border, lineWidth: selected ? 1.5 : 1))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.5 : 1)
    }

    private func targetSection(_ s: CompressSettings) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(t("setting.targetSize")).font(.title3.weight(.bold))
                    Text(t("setting.targetSize.hint")).font(.callout).foregroundStyle(Theme.secondary)
                }
                Spacer(minLength: 8)
                Toggle("", isOn: $model.compress.useTargetSize).labelsHidden().toggleStyle(.switch)
                    .accessibilityLabel(t("setting.targetSize"))
            }
            if s.useTargetSize {
                HStack(spacing: 8) {
                    TextField("", value: $model.compress.targetKB, format: .number.grouping(.never))
                        .textFieldStyle(.roundedBorder)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 90)
                        .accessibilityLabel(t("setting.targetSize"))
                    Text("KB").foregroundStyle(Theme.secondary)
                    Spacer()
                    ForEach([100, 500, 1000], id: \.self) { kb in
                        Button(kb == 1000 ? "1 MB" : "\(kb) KB") { model.compress.targetKB = kb }
                            .buttonStyle(.brandSecondary).font(.caption)
                    }
                }
            }
        }
    }

    /// PNG and other lossless formats ignore quality; say so and offer the way out.
    private var losslessTile: some View {
        let alternative: OutputFormat = OutputFormat.available.contains(.webp) ? .webp : .jpeg
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 10) {
                Image(systemName: "exclamationmark")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(Theme.onAccent)
                    .frame(width: 26, height: 26)
                    .background(Circle().fill(Theme.orange))
                Text(t("compress.lossless.title", outFormat.displayName))
                    .font(.callout.weight(.bold))
                    .foregroundStyle(Theme.ink)
            }
            Text(t("compress.lossless.short", outFormat.displayName))
                .font(.callout).foregroundStyle(Theme.ink.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
            Button { model.compress.format = alternative } label: {
                Label(t("compress.switchTo", alternative.displayName), systemImage: "arrow.triangle.2.circlepath")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.brandPrimary)
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.orange.opacity(0.12)))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.orange, lineWidth: 1.5))
        .overlay(alignment: .leading) {
            UnevenRoundedRectangle(topLeadingRadius: 12, bottomLeadingRadius: 12)
                .fill(Theme.orange).frame(width: 5)
        }
        .shadow(color: Theme.orange.opacity(0.18), radius: 8, y: 2)
    }

    private func moreSection(_ s: CompressSettings, anyAlpha: Bool) -> some View {
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
                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(t("setting.suffix")).font(.caption.weight(.semibold)).foregroundStyle(Theme.secondary)
                        SuffixField(suffix: $model.compress.suffix,
                                    example: exampleName(base: "photo", suffix: s.suffix, ext: outFormat.fileExtension))
                    }
                    if anyAlpha, outFormat == .jpeg {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(t("setting.background")).font(.caption.weight(.semibold)).foregroundStyle(Theme.secondary)
                            HStack(spacing: 10) {
                                ColorPicker("", selection: $model.compress.background, supportsOpacity: false).labelsHidden()
                                Button(t("setting.background.white")) { model.compress.background = .white }.buttonStyle(.brandSecondary)
                                Button(t("setting.background.black")) { model.compress.background = .black }.buttonStyle(.brandSecondary)
                            }
                            Text(t("setting.background.hint")).font(.caption).foregroundStyle(Theme.secondary)
                        }
                    }
                }
            }
        }
    }

    // MARK: Footer

    private var footer: some View {
        let s = model.compress
        let targets = model.toolTargets
        let detail: String = {
            guard outFormat.isLossy else { return outFormat.displayName }
            return s.useTargetSize ? "\(outFormat.displayName) · \(t("compress.footer.target", s.targetKB))"
                                   : "\(outFormat.displayName) · \(t("compress.footer.quality", Int((s.quality * 100).rounded())))"
        }()
        return VStack(spacing: 0) {
            Rectangle().fill(Theme.border).frame(height: 1)
            HStack(spacing: 14) {
                Image(systemName: "lock").foregroundStyle(Theme.secondary)
                Text(t("compress.footer.untouched")).font(.callout).foregroundStyle(Theme.secondary)
                Spacer(minLength: 12)
                Label("\(t(targets.count == 1 ? "files.count.one" : "files.count.many", targets.count)) · \(detail)",
                      systemImage: "photo.stack")
                    .font(.callout.weight(.medium)).lineLimit(1)
                Spacer(minLength: 12)
                if model.isBatchRunning { ProgressView().controlSize(.small) }
                Button { model.runCompress() } label: {
                    Label(runTitle("compress.run", count: targets.count), systemImage: "arrow.down.right.and.arrow.up.left")
                }
                .buttonStyle(.brandPrimary)
                .keyboardShortcut(.return, modifiers: .command)
                .disabled(targets.isEmpty || model.isBatchRunning)
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

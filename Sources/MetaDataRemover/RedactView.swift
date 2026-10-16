import SwiftUI

/// Redact & Share Safely: find or draw regions, see the exact result live, then export.
struct RedactView: View {
    @EnvironmentObject var model: AppModel
    @State private var regions: [SensitiveRegion] = []
    @State private var scanning = false
    @State private var hasScanned = false
    @State private var error: String?
    @State private var dragStart: CGPoint?
    @State private var dragRect: CGRect?
    @State private var baseImage: NSImage?
    @State private var baseCG: CGImage?
    @State private var preview: NSImage?
    @State private var showOriginal = false
    @State private var rendering = false
    @State private var renderTask: Task<Void, Never>?
    @State private var moreOptions = false

    private var selectedCount: Int { regions.filter(\.isSelected).count }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    ToolHeader(title: t("redact.title"), subtitle: t("redact.subtitle"))
                    if let item = model.selected {
                        if let batch = model.batch, batch.tool == .redact { BatchView(batch: batch) }
                        findCard(item)
                        canvasCard(item)
                        if !regions.isEmpty { regionsCard }
                        styleCard
                        exportCard(item)
                        NoticeCard(text: t("redact.review"), systemImage: "person.crop.circle.badge.checkmark", color: Theme.warning)
                    } else {
                        NoticeCard(text: t("detail.selectImage"))
                    }
                }
                .padding(.horizontal, 32).padding(.vertical, 28)
                .frame(maxWidth: 1040)
                .frame(maxWidth: .infinity)
            }
            if model.selected != nil { footer }
        }
        .task(id: model.selection) { await loadSelected() }
        .onChange(of: regions) { _ in scheduleRender() }
        .onChange(of: model.redact.style) { _ in scheduleRender() }
        .onChange(of: model.redact.strength) { _ in scheduleRender() }
    }

    // MARK: Step 1 — find

    private func findCard(_ item: FileItem) -> some View {
        let faces = regions.filter { $0.kind == .face }.count
        let text = regions.filter { $0.kind != .face && $0.kind != .manual }.count
        let manual = regions.filter { $0.kind == .manual }.count
        return VStack(alignment: .leading, spacing: 14) {
            CardHeader(symbol: "viewfinder", title: t("redact.step.find"), subtitle: t("redact.step.find.sub")) {
                Button { scan(item.url) } label: {
                    if scanning {
                        HStack(spacing: 8) { ProgressView().controlSize(.small); Text(t("visual.scan.scanning")) }
                    } else {
                        Label(hasScanned ? t("visual.scan.again") : t("redact.scan"), systemImage: "viewfinder")
                    }
                }
                .buttonStyle(.brandPrimary)
                .disabled(scanning)
            }
            if hasScanned, regions.isEmpty, error == nil {
                Label(t("visual.scan.none"), systemImage: "checkmark.circle.fill")
                    .font(.callout).foregroundStyle(Theme.success)
            } else if !regions.isEmpty {
                HStack(spacing: 8) {
                    if faces > 0 { Chip(text: t("visual.scan.faces", faces), color: Theme.warning) }
                    if text > 0 { Chip(text: t("visual.scan.text", text), color: Theme.warning) }
                    if manual > 0 { Chip(text: t("redact.manualCount", manual), color: Theme.info) }
                }
            }
            if let error { Label(error, systemImage: "exclamationmark.triangle.fill").font(.callout).foregroundStyle(Theme.danger) }
            Label(t("visual.scan.local"), systemImage: "lock.shield")
                .font(.caption).foregroundStyle(Theme.secondary)
        }
        .card()
    }

    // MARK: Canvas

    private func canvasCard(_ item: FileItem) -> some View {
        let canCompare = selectedCount > 0 && preview != nil
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Picker("", selection: $showOriginal) {
                    Text(t("redact.view.preview")).tag(false)
                    Text(t("redact.view.original")).tag(true)
                }
                .pickerStyle(.segmented).labelsHidden()
                .frame(maxWidth: 320)
                .disabled(!canCompare)
                Spacer()
                if rendering {
                    HStack(spacing: 6) { ProgressView().controlSize(.small); Text(t("redact.preview.updating")) }
                        .font(.caption).foregroundStyle(Theme.secondary)
                }
            }
            let shown = (!showOriginal && canCompare) ? preview : (baseImage ?? item.thumb)
            canvas(shown, showsFill: showOriginal || preview == nil)
            Label(regions.isEmpty ? t("redact.canvas.empty") : t("redact.canvas.hint"), systemImage: "hand.point.up.left")
                .font(.caption).foregroundStyle(Theme.secondary)
        }
        .card()
    }

    private func canvas(_ image: NSImage?, showsFill: Bool) -> some View {
        GeometryReader { geo in
            let size = image?.size ?? CGSize(width: 4, height: 3)
            let fitted = fitRect(image: size, container: geo.size)
            ZStack(alignment: .topLeading) {
                Color.black.opacity(0.06)
                if let image {
                    Image(nsImage: image).resizable().interpolation(.high).scaledToFit()
                        .frame(width: fitted.width, height: fitted.height)
                        .position(x: fitted.midX, y: fitted.midY)
                }
                ForEach(Array(regions.enumerated()), id: \.element.id) { index, region in
                    regionBox(region, number: index + 1, fitted: fitted, showsFill: showsFill)
                }
                if let dragRect {
                    Rectangle().fill(Theme.orange.opacity(0.14))
                        .overlay(Rectangle().stroke(Theme.orange, style: .init(lineWidth: 2, dash: [5])))
                        .frame(width: dragRect.width, height: dragRect.height)
                        .position(x: dragRect.midX, y: dragRect.midY)
                }
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 6).onChanged { value in
                let start = dragStart ?? value.startLocation
                dragStart = start
                dragRect = CGRect(x: min(start.x, value.location.x), y: min(start.y, value.location.y),
                                  width: abs(value.location.x - start.x), height: abs(value.location.y - start.y)).intersection(fitted)
            }.onEnded { _ in
                if let rect = dragRect, rect.width > 8, rect.height > 8 {
                    let normalized = CGRect(x: (rect.minX - fitted.minX) / fitted.width,
                                            y: 1 - (rect.maxY - fitted.minY) / fitted.height,
                                            width: rect.width / fitted.width, height: rect.height / fitted.height)
                    regions.append(SensitiveRegion(kind: .manual, rect: normalized, label: t("visual.kind.manual"), confidence: 1))
                    showOriginal = false
                }
                dragStart = nil; dragRect = nil
            })
        }
        .frame(height: 440)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.border))
    }

    private func regionBox(_ region: SensitiveRegion, number: Int, fitted: CGRect, showsFill: Bool) -> some View {
        let r = displayRect(region.rect, in: fitted)
        let on = region.isSelected
        return ZStack(alignment: .topLeading) {
            Rectangle().fill(on && showsFill ? Theme.orange.opacity(0.18) : Color.clear)
            Rectangle().stroke(on ? Theme.orange : Color.white.opacity(0.9),
                               style: on ? StrokeStyle(lineWidth: 2.5) : StrokeStyle(lineWidth: 2, dash: [6, 4]))
                .shadow(color: .black.opacity(on ? 0 : 0.5), radius: 1)
            Text("\(number)")
                .font(.system(size: 11, weight: .bold).monospacedDigit())
                .foregroundStyle(on ? Theme.onAccent : Color.white)
                .frame(minWidth: 18, minHeight: 18)
                .background(Capsule().fill(on ? Theme.orange : Color.black.opacity(0.65)))
                .offset(x: 3, y: 3)
        }
        .frame(width: r.width, height: r.height)
        .contentShape(Rectangle())
        .onTapGesture { toggle(region.id) }
        .position(x: r.midX, y: r.midY)
        .help(on ? t("redact.box.skip") : t("redact.box.include"))
        .accessibilityLabel(Text("\(number). \(region.label)"))
        .accessibilityAddTraits(.isButton)
    }

    // MARK: Regions list

    private var regionsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            CardHeader(symbol: "list.number", title: t("redact.regions.title"),
                       subtitle: t("redact.regions.count", selectedCount, regions.count)) {
                HStack(spacing: 8) {
                    Button(t("redact.selectAll")) { for i in regions.indices { regions[i].isSelected = true } }
                        .disabled(selectedCount == regions.count)
                    Button(t("redact.skipAll")) { for i in regions.indices { regions[i].isSelected = false } }
                        .disabled(selectedCount == 0)
                    Button(t("redact.removeAll")) { regions = [] }
                }
                .buttonStyle(.brandSecondary)
            }
            VStack(spacing: 0) {
                ForEach(Array(regions.enumerated()), id: \.element.id) { index, region in
                    regionRow(region, number: index + 1)
                    if index < regions.count - 1 { Divider().padding(.leading, 56) }
                }
            }
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.canvas))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.border))
        }
        .card()
    }

    private func regionRow(_ region: SensitiveRegion, number: Int) -> some View {
        let kindTitle = t("visual.kind.\(region.kind.rawValue)")
        return HStack(spacing: 12) {
            Text("\(number)")
                .font(.caption.weight(.bold).monospacedDigit())
                .foregroundStyle(region.isSelected ? Theme.onAccent : Theme.secondary)
                .frame(width: 24, height: 24)
                .background(Circle().fill(region.isSelected ? Theme.orange : Theme.secondary.opacity(0.18)))
            Image(systemName: region.kind.symbol)
                .foregroundStyle(region.isSelected ? Theme.accentText : Theme.secondary)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(kindTitle).font(.callout.weight(.semibold))
                if region.kind == .manual {
                    Text(t("redact.region.manual")).font(.caption).foregroundStyle(Theme.secondary)
                } else {
                    HStack(spacing: 6) {
                        if region.label != kindTitle {
                            Text(region.label).lineLimit(1).truncationMode(.middle)
                            Text("·")
                        }
                        Text(t("redact.region.match", Int(region.confidence * 100)))
                    }
                    .font(.caption).foregroundStyle(Theme.secondary)
                }
            }
            Spacer(minLength: 8)
            if region.kind == .manual {
                Button { regions.removeAll { $0.id == region.id } } label: { Image(systemName: "trash") }
                    .buttonStyle(.plain).foregroundStyle(Theme.secondary)
                    .help(t("redact.region.delete"))
                    .accessibilityLabel(t("redact.region.delete"))
            }
            Toggle("", isOn: Binding(get: { region.isSelected }, set: { _ in toggle(region.id) }))
                .labelsHidden().toggleStyle(.switch)
                .accessibilityLabel(kindTitle)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .contentShape(Rectangle())
        .opacity(region.isSelected ? 1 : 0.65)
    }

    // MARK: Step 2 — style

    private var styleCard: some View {
        let style = model.redact.style
        let strength = model.redact.strength
        let range = RedactionService.strengthRange
        let level = RedactionService.Level(strength: strength)
        let hasText = regions.contains { $0.isSelected && $0.kind != .face && $0.kind != .manual }
        return VStack(alignment: .leading, spacing: 16) {
            CardHeader(symbol: "paintbrush.pointed.fill", title: t("redact.step.style"), subtitle: t("redact.step.style.sub"))
            HStack(spacing: 12) {
                ForEach(RedactionStyle.allCases) { option in
                    StyleTile(style: option, isSelected: style == option) { model.redact.style = option }
                }
            }
            if style != .solid {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(t("redact.strength")).font(.callout.weight(.semibold))
                        Spacer()
                        Text(level.title).font(.callout.weight(.bold)).foregroundStyle(Theme.accentText)
                        Text("\(Int(((strength - range.lowerBound) / (range.upperBound - range.lowerBound) * 100).rounded()))%")
                            .font(.callout.monospacedDigit()).foregroundStyle(Theme.secondary)
                            .frame(width: 44, alignment: .trailing)
                    }
                    Slider(value: $model.redact.strength, in: range)
                        .accessibilityLabel(t("redact.strength"))
                    HStack {
                        Text(t("redact.strength.light")); Spacer(); Text(t("redact.strength.maximum"))
                    }
                    .font(.caption).foregroundStyle(Theme.secondary)
                    Label(t("redact.strength.hint"), systemImage: "eye")
                        .font(.caption).foregroundStyle(Theme.secondary)
                }
                if level == .light {
                    NoticeCard(text: t("redact.tip.weak"), systemImage: "exclamationmark.triangle.fill", color: Theme.warning)
                } else if hasText {
                    NoticeCard(text: t("redact.tip.solid"), systemImage: "lightbulb.fill", color: Theme.info)
                }
            }
        }
        .card()
    }

    // MARK: Step 3 — export options

    private func exportCard(_ item: FileItem) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            CardHeader(symbol: "square.and.arrow.up", title: t("redact.step.export"))
            SettingRow(label: t("redact.cleanMetadata"), hint: t("redact.cleanMetadata.hint")) {
                Toggle("", isOn: $model.redact.cleanMetadata).labelsHidden().toggleStyle(.switch)
            }
            DisclosureGroup(isExpanded: $moreOptions) {
                VStack(alignment: .leading, spacing: 14) {
                    SettingRow(label: t("setting.outputFormat")) {
                        Picker("", selection: $model.redact.format) {
                            Text(t("format.same")).tag(nil as OutputFormat?)
                            ForEach(OutputFormat.available) { Text($0.displayName).tag(Optional($0)) }
                        }.labelsHidden().frame(maxWidth: 240)
                    }
                    QualityRow(quality: $model.redact.quality,
                               enabled: (model.redact.format ?? item.info?.format ?? .jpeg).isLossy)
                    SettingRow(label: t("setting.suffix")) {
                        SuffixField(suffix: $model.redact.suffix, example: "photo\(model.redact.suffix).jpg")
                    }
                }
                .padding(.top, 12)
            } label: {
                Text(t("redact.moreOptions")).font(.callout.weight(.medium))
            }
        }
        .card()
    }

    // MARK: Footer

    private var footer: some View {
        let style = model.redact.style
        let level = RedactionService.Level(strength: model.redact.strength)
        let detail = style == .solid ? t("redact.style.solid") : "\(t("redact.style.\(style.rawValue)")) · \(level.title)"
        let summary = selectedCount == 0
            ? t("redact.summary.none")
            : "\(t(selectedCount == 1 ? "redact.summary.one" : "redact.summary.many", selectedCount)) · \(detail)"
        return ActionFooter(summary: summary, hint: t("export.hint")) {
            if model.isBatchRunning { ProgressView().controlSize(.small) }
            Button { model.runRedaction(regions: regions) } label: {
                Label(t("redact.run"), systemImage: "eye.slash.fill")
            }
            .buttonStyle(.brandPrimaryLarge)
            .keyboardShortcut(.return, modifiers: .command)
            .disabled(selectedCount == 0 || model.isBatchRunning)
        }
    }

    // MARK: Actions

    private func toggle(_ id: UUID) {
        if let index = regions.firstIndex(where: { $0.id == id }) { regions[index].isSelected.toggle() }
    }

    private func loadSelected() async {
        renderTask?.cancel()
        regions = []; error = nil; dragRect = nil; hasScanned = false
        preview = nil; baseImage = nil; baseCG = nil; showOriginal = false
        guard let url = model.selected?.url else { return }
        let cg = await Task.detached(priority: .userInitiated) { RedactionService.previewBase(url: url) }.value
        guard !Task.isCancelled, let cg else { return }
        baseCG = cg
        baseImage = NSImage(cgImage: cg, size: NSSize(width: cg.width, height: cg.height))
    }

    /// Re-draws the live preview with the exact style and strength used for export. Debounced while dragging the slider.
    private func scheduleRender() {
        renderTask?.cancel()
        guard let base = baseCG, regions.contains(where: \.isSelected) else {
            preview = nil; rendering = false; return
        }
        let regions = regions
        let settings = model.redact
        renderTask = Task {
            try? await Task.sleep(nanoseconds: 80_000_000)
            if Task.isCancelled { return }
            rendering = true
            let image = await Task.detached(priority: .userInitiated) {
                RedactionService.render(base, regions: regions, settings: settings)
            }.value
            if Task.isCancelled { return }
            rendering = false
            preview = image.map { NSImage(cgImage: $0, size: NSSize(width: $0.width, height: $0.height)) }
        }
    }

    private func scan(_ url: URL) {
        scanning = true; error = nil
        Task {
            let result = await Task.detached(priority: .userInitiated) { Result { try VisualPrivacyScanner.scan(url: url) } }.value
            scanning = false
            hasScanned = true
            switch result {
            case .success(let report):
                // Keep anything the user drew by hand.
                regions = regions.filter { $0.kind == .manual } + report.regions
                showOriginal = false
            case .failure(let e): error = e.localizedDescription
            }
        }
    }

    private func fitRect(image: CGSize, container: CGSize) -> CGRect {
        let scale = min(container.width / max(image.width, 1), container.height / max(image.height, 1))
        let size = CGSize(width: image.width * scale, height: image.height * scale)
        return CGRect(x: (container.width - size.width) / 2, y: (container.height - size.height) / 2, width: size.width, height: size.height)
    }

    private func displayRect(_ normalized: CGRect, in image: CGRect) -> CGRect {
        CGRect(x: image.minX + normalized.minX * image.width,
               y: image.minY + (1 - normalized.maxY) * image.height,
               width: normalized.width * image.width, height: normalized.height * image.height)
    }
}

/// One of the three ways to hide a region.
private struct StyleTile: View {
    let style: RedactionStyle
    let isSelected: Bool
    let action: () -> Void

    private var symbol: String {
        switch style {
        case .blur: "camera.filters"
        case .pixelate: "square.grid.3x3.fill"
        case .solid: "rectangle.fill"
        }
    }

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Image(systemName: symbol)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(isSelected ? Theme.accentText : Theme.secondary)
                        .frame(width: 34, height: 34)
                        .background(RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .fill((isSelected ? Theme.orange : Theme.secondary).opacity(0.14)))
                    Spacer()
                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(isSelected ? Theme.accentText : Theme.secondary.opacity(0.6))
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(t("redact.style.\(style.rawValue)")).font(.callout.weight(.semibold))
                    Text(t("redact.style.\(style.rawValue).about")).font(.caption).foregroundStyle(Theme.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(isSelected ? Theme.orange.opacity(0.08) : Theme.canvas))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(isSelected ? Theme.orange.opacity(0.7) : Theme.border, lineWidth: isSelected ? 1.5 : 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

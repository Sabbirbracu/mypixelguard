import SwiftUI

/// Redact & Share Safely: the image on the left, everything you can change on the right.
/// Faces and sensitive text are found automatically; you review them, pick a style, then export.
struct RedactView: View {
    @EnvironmentObject var model: AppModel
    @State private var regions: [SensitiveRegion] = []
    @State private var focusedID: UUID?
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
    @State private var drawMode = true
    @State private var showOutlines = true
    /// Zoom in percent of the original size; nil means fit to window.
    @State private var zoom: Double?
    @State private var viewport: CGSize = .zero

    private var selectedCount: Int { regions.filter(\.isSelected).count }

    var body: some View {
        VStack(spacing: 0) {
            if let item = model.selected {
                HStack(spacing: 0) {
                    canvasColumn(item)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    Rectangle().fill(Theme.border).frame(width: 1)
                    sidePanel(item)
                        .frame(width: 330)
                        .frame(maxHeight: .infinity)
                        .background(Theme.surface)
                }
                footer
            } else {
                Text(t("detail.selectImage")).foregroundStyle(Theme.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task(id: model.selection) { await loadSelected() }
        .onChange(of: regions) { _ in scheduleRender() }
        .onChange(of: model.redact.style) { _ in scheduleRender() }
        .onChange(of: model.redact.strength) { _ in scheduleRender() }
    }

    // MARK: Canvas column

    private func canvasColumn(_ item: FileItem) -> some View {
        let canCompare = selectedCount > 0 && preview != nil
        let showingOriginal = showOriginal || !canCompare
        return VStack(spacing: 12) {
            HStack(spacing: 10) {
                viewToggle(canCompare: canCompare, showingOriginal: showingOriginal)
                Spacer(minLength: 8)
                if rendering {
                    HStack(spacing: 6) { ProgressView().controlSize(.small); Text(t("redact.preview.updating")) }
                        .font(.caption).foregroundStyle(Theme.secondary)
                }
                toolbarButton(t("redact.draw"), symbol: "rectangle.dashed", active: drawMode) { drawMode.toggle() }
                    .help(t("redact.draw.help"))
                toolbarButton(nil, symbol: "square.3.layers.3d", active: showOutlines) { showOutlines.toggle() }
                    .help(t("redact.outlines"))
                    .accessibilityLabel(t("redact.outlines"))
            }

            canvas(showingOriginal ? (baseImage ?? item.thumb) : preview, showsFill: showingOriginal, item: item)

            HStack(spacing: 12) {
                Label(drawMode ? t("redact.canvas.hint.draw") : t("redact.canvas.hint.select"), systemImage: "info.circle")
                    .font(.callout)
                    .foregroundStyle(Theme.secondary)
                    .lineLimit(2)
                Spacer(minLength: 8)
                zoomControls(item)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.surface))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.border))
        }
        .padding(16)
    }

    private func viewToggle(canCompare: Bool, showingOriginal: Bool) -> some View {
        HStack(spacing: 4) {
            segment(t("redact.view.original"), symbol: "eye", selected: showingOriginal, enabled: true) { showOriginal = true }
            segment(t("redact.view.preview"), symbol: "eye.slash", selected: !showingOriginal, enabled: canCompare) { showOriginal = false }
        }
        .padding(4)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.surface))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.border))
    }

    private func segment(_ title: String, symbol: String, selected: Bool, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: symbol)
                .font(.callout.weight(selected ? .semibold : .regular))
                .foregroundStyle(selected ? Theme.ink : Theme.secondary)
                .padding(.horizontal, 14).padding(.vertical, 7)
                .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(selected ? Theme.orange.opacity(0.14) : Color.clear))
                .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).stroke(selected ? Theme.orange.opacity(0.7) : Color.clear, lineWidth: 1.5))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.45)
    }

    private func toolbarButton(_ title: String?, symbol: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: symbol)
                if let title { Text(title) }
            }
            .font(.callout.weight(.medium))
            .foregroundStyle(active ? Theme.accentText : Theme.ink)
            .padding(.horizontal, title == nil ? 11 : 14).padding(.vertical, 9)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(active ? Theme.orange.opacity(0.12) : Theme.surface))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(active ? Theme.orange.opacity(0.6) : Theme.elevatedBorder))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(active ? .isSelected : [])
    }

    // MARK: Zoom

    private func geometry(_ image: NSImage?, item: FileItem) -> (fit: CGFloat, unit: CGFloat) {
        let size = image?.size ?? CGSize(width: 4, height: 3)
        let fit = min(viewport.width / max(size.width, 1), viewport.height / max(size.height, 1))
        let original = CGFloat(item.analysis?.width ?? Int(size.width))
        return (fit.isFinite && fit > 0 ? fit : 1, original / max(size.width, 1))
    }

    private func zoomControls(_ item: FileItem) -> some View {
        let g = geometry(baseImage ?? item.thumb, item: item)
        let percent = zoom ?? Double(g.fit / g.unit * 100)
        return HStack(spacing: 10) {
            Menu {
                Button(t("inspect.zoom.fit")) { zoom = nil }
                ForEach([25.0, 50.0, 100.0, 200.0], id: \.self) { value in
                    Button("\(Int(value))%") { zoom = value }
                }
            } label: {
                Text(zoom == nil ? t("inspect.zoom.fitShort") : t("inspect.zoom.custom")).font(.callout).foregroundStyle(Theme.ink)
            }
            .menuStyle(.borderlessButton)
            .fixedSize()
            .padding(.horizontal, 10).padding(.vertical, 5)
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Theme.elevatedBorder))

            HStack(spacing: 0) {
                zoomButton("minus") { zoom = max(5, percent / 1.25) }
                Text("\(Int(percent.rounded()))%").font(.callout.monospacedDigit()).frame(width: 52)
                zoomButton("plus") { zoom = min(800, percent * 1.25) }
            }
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Theme.elevatedBorder))
        }
    }

    private func zoomButton(_ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.system(size: 11, weight: .bold))
                .frame(width: 30, height: 28).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: Canvas

    private func canvas(_ image: NSImage?, showsFill: Bool, item: FileItem) -> some View {
        GeometryReader { geo in
            let size = image?.size ?? CGSize(width: 4, height: 3)
            let g = geometry(image, item: item)
            let scale = zoom.map { g.unit * CGFloat($0) / 100 } ?? g.fit
            let content = CGSize(width: max(size.width * scale, geo.size.width), height: max(size.height * scale, geo.size.height))
            let fitted = CGRect(x: (content.width - size.width * scale) / 2, y: (content.height - size.height * scale) / 2,
                                width: size.width * scale, height: size.height * scale)
            ScrollView([.horizontal, .vertical], showsIndicators: zoom != nil) {
                ZStack(alignment: .topLeading) {
                    Color.clear
                    if let image {
                        Image(nsImage: image).resizable().interpolation(.high)
                            .frame(width: fitted.width, height: fitted.height)
                            .shadow(color: .black.opacity(0.25), radius: 10, y: 3)
                            .position(x: fitted.midX, y: fitted.midY)
                    } else {
                        ProgressView().position(x: content.width / 2, y: content.height / 2)
                    }
                    if showOutlines {
                        ForEach(Array(regions.enumerated()), id: \.element.id) { index, region in
                            regionBox(region, number: index + 1, fitted: fitted, showsFill: showsFill)
                        }
                    }
                    if let dragRect {
                        Rectangle().fill(Theme.orange.opacity(0.14))
                            .overlay(Rectangle().stroke(Theme.orange, style: .init(lineWidth: 2, dash: [5])))
                            .frame(width: dragRect.width, height: dragRect.height)
                            .position(x: dragRect.midX, y: dragRect.midY)
                    }
                }
                .frame(width: content.width, height: content.height)
                .contentShape(Rectangle())
                .gesture(drawGesture(fitted: fitted), including: drawMode ? .all : .subviews)
            }
            .onAppear { viewport = geo.size }
            .onChange(of: geo.size) { viewport = $0 }
        }
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.sidebar))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.border))
    }

    private func drawGesture(fitted: CGRect) -> some Gesture {
        DragGesture(minimumDistance: 6).onChanged { value in
            let start = dragStart ?? value.startLocation
            dragStart = start
            dragRect = CGRect(x: min(start.x, value.location.x), y: min(start.y, value.location.y),
                              width: abs(value.location.x - start.x), height: abs(value.location.y - start.y)).intersection(fitted)
        }.onEnded { _ in
            if let rect = dragRect, rect.width > 8, rect.height > 8 {
                let normalized = CGRect(x: (rect.minX - fitted.minX) / fitted.width,
                                        y: 1 - (rect.maxY - fitted.minY) / fitted.height,
                                        width: rect.width / fitted.width, height: rect.height / fitted.height)
                let region = SensitiveRegion(kind: .manual, rect: normalized, label: t("visual.kind.manual"), confidence: 1)
                regions.append(region)
                focusedID = region.id
                showOriginal = false
            }
            dragStart = nil; dragRect = nil
        }
    }

    private func regionBox(_ region: SensitiveRegion, number: Int, fitted: CGRect, showsFill: Bool) -> some View {
        let r = displayRect(region.rect, in: fitted)
        let on = region.isSelected
        let focused = focusedID == region.id
        let accent = on && (focused || showsFill)
        return ZStack(alignment: .topLeading) {
            Rectangle().fill(on && showsFill ? Theme.orange.opacity(0.18) : Color.clear)
            Rectangle().stroke(accent ? Theme.orange : (on ? Color.white.opacity(0.35) : Color.white.opacity(0.9)),
                               style: on ? StrokeStyle(lineWidth: focused ? 3 : 2) : StrokeStyle(lineWidth: 2, dash: [6, 4]))
                .shadow(color: .black.opacity(on ? 0 : 0.5), radius: 1)
            Text("\(number)")
                .font(.system(size: 11, weight: .bold).monospacedDigit())
                .foregroundStyle(accent ? Theme.onAccent : Color.white)
                .frame(minWidth: 18, minHeight: 18)
                .background(Capsule().fill(accent ? Theme.orange : Color.black.opacity(0.65)))
                .offset(x: 3, y: 3)
        }
        .frame(width: r.width, height: r.height)
        .contentShape(Rectangle())
        .onTapGesture { focusedID = region.id }
        .position(x: r.midX, y: r.midY)
        .help(t("redact.box.review"))
        .accessibilityLabel(Text("\(number). \(region.label)"))
        .accessibilityAddTraits(.isButton)
    }

    // MARK: Side panel

    private func sidePanel(_ item: FileItem) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                if let batch = model.batch, batch.tool == .redact { BatchView(batch: batch) }
                detectionSection(item)
                Divider()
                regionsSection
                Divider()
                styleSection
                Divider()
                exportSection(item)
                Label(t("redact.detectionNote"), systemImage: "info.circle")
                    .font(.callout)
                    .foregroundStyle(Theme.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(20)
        }
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text).font(.title3.weight(.bold))
    }

    // Detection

    private func detectionSection(_ item: FileItem) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                sectionTitle(t("redact.detection.title"))
                if let error {
                    Label(error, systemImage: "exclamationmark.triangle.fill").font(.callout).foregroundStyle(Theme.danger)
                } else {
                    HStack(spacing: 7) {
                        Circle().fill(scanning ? Theme.warning : Theme.success).frame(width: 8, height: 8)
                        Text(scanning ? t("redact.detection.scanning") : t("redact.detection.status"))
                            .font(.callout).foregroundStyle(Theme.secondary)
                    }
                }
            }
            Spacer(minLength: 6)
            Button { Task { await performScan(item.url) } } label: {
                HStack(spacing: 7) {
                    if scanning { ProgressView().controlSize(.small) } else { Image(systemName: "viewfinder") }
                    Text(t("redact.rescan"))
                }
            }
            .buttonStyle(.brandSecondary)
            .disabled(scanning)
        }
    }

    // Regions

    private var regionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                sectionTitle(t("redact.regions.title"))
                Text("\(regions.count)")
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Capsule().fill(Theme.secondary.opacity(0.2)))
                Spacer()
                Text(t("redact.regions.included", selectedCount, regions.count))
                    .font(.callout).foregroundStyle(Theme.secondary)
            }

            if regions.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Image(systemName: hasScanned ? "checkmark.shield.fill" : "rectangle.dashed")
                        .font(.title2)
                        .foregroundStyle(hasScanned ? Theme.success : Theme.secondary)
                    Text(hasScanned ? t("redact.regions.none") : t("redact.regions.empty"))
                        .font(.callout).foregroundStyle(Theme.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.canvas))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.border))
            } else {
                HStack(spacing: 14) {
                    Spacer()
                    Button(t("redact.selectAll")) { for i in regions.indices { regions[i].isSelected = true } }
                        .disabled(selectedCount == regions.count)
                    Button(t("redact.skipAll")) { for i in regions.indices { regions[i].isSelected = false } }
                        .disabled(selectedCount == 0)
                    Menu {
                        Button(t("redact.removeAll"), role: .destructive) { regions = []; focusedID = nil }
                    } label: {
                        Image(systemName: "ellipsis").frame(width: 24, height: 20).contentShape(Rectangle())
                    }
                    .menuStyle(.borderlessButton)
                    .fixedSize()
                }
                .buttonStyle(.link)
                .font(.callout)

                VStack(spacing: 8) {
                    ForEach(Array(regions.enumerated()), id: \.element.id) { index, region in
                        regionRow(region, number: index + 1)
                    }
                }
            }
        }
    }

    private func regionRow(_ region: SensitiveRegion, number: Int) -> some View {
        let kindTitle = t("visual.kind.\(region.kind.rawValue)")
        let focused = focusedID == region.id
        let subtitle: String = region.kind == .manual ? t("redact.region.drawn")
            : (region.label != kindTitle ? region.label : t("redact.region.detected"))
        return HStack(spacing: 12) {
            Button { toggle(region.id) } label: {
                Image(systemName: region.isSelected ? "checkmark" : "")
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundStyle(Theme.onAccent)
                    .frame(width: 22, height: 22)
                    .background(RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(region.isSelected ? Theme.orange : Color.clear))
                    .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .stroke(region.isSelected ? Theme.orange : Theme.elevatedBorder, lineWidth: 1.5))
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help(region.isSelected ? t("redact.box.skip") : t("redact.box.include"))
            .accessibilityLabel(kindTitle)
            .accessibilityValue(region.isSelected ? t("common.on") : t("common.off"))

            Text("\(number)")
                .font(.caption.weight(.bold).monospacedDigit())
                .foregroundStyle(focused && region.isSelected ? Theme.onAccent : Theme.ink)
                .frame(width: 26, height: 26)
                .background(Circle().fill(focused && region.isSelected ? Theme.orange : Theme.secondary.opacity(0.22)))

            VStack(alignment: .leading, spacing: 1) {
                Text(kindTitle).font(.callout.weight(.semibold)).lineLimit(1)
                Text(subtitle).font(.caption).foregroundStyle(Theme.secondary).lineLimit(1).truncationMode(.middle)
            }
            Spacer(minLength: 6)
            Button {
                regions.removeAll { $0.id == region.id }
                if focused { focusedID = nil }
            } label: {
                Image(systemName: "trash").font(.callout).foregroundStyle(Theme.secondary)
                    .frame(width: 26, height: 26).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help(t("redact.region.delete"))
            .accessibilityLabel(t("redact.region.delete"))
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(focused ? Theme.orange.opacity(0.10) : Theme.canvas))
        .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous)
            .stroke(focused ? Theme.orange.opacity(0.8) : Theme.border, lineWidth: focused ? 1.5 : 1))
        .opacity(region.isSelected ? 1 : 0.7)
        .contentShape(Rectangle())
        .onTapGesture { focusedID = region.id }
    }

    // Style

    private var styleSection: some View {
        let style = model.redact.style
        let strength = model.redact.strength
        let range = RedactionService.strengthRange
        let level = RedactionService.Level(strength: strength)
        let hasText = regions.contains { $0.isSelected && $0.kind != .face && $0.kind != .manual }
        return VStack(alignment: .leading, spacing: 12) {
            sectionTitle(t("redact.style.title"))
            HStack(spacing: 0) {
                ForEach(RedactionStyle.allCases) { option in
                    Button { model.redact.style = option } label: {
                        Text(t("redact.style.\(option.rawValue)"))
                            .font(.callout.weight(style == option ? .semibold : .regular))
                            .foregroundStyle(style == option ? Theme.ink : Theme.secondary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 9)
                            .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(style == option ? Theme.orange.opacity(0.14) : Color.clear))
                            .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).stroke(style == option ? Theme.orange.opacity(0.75) : Color.clear, lineWidth: 1.5))
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(style == option ? .isSelected : [])
                }
            }
            .padding(3)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.canvas))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.border))

            VStack(alignment: .leading, spacing: 3) {
                Text(t("redact.style.\(style.rawValue).about")).font(.callout)
                Text(t("redact.applies")).font(.caption).foregroundStyle(Theme.secondary)
            }
            .fixedSize(horizontal: false, vertical: true)

            if style != .solid {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(t("redact.strength")).font(.callout.weight(.semibold))
                        Spacer()
                        Text(level.title).font(.callout.weight(.bold)).foregroundStyle(Theme.accentText)
                    }
                    Slider(value: $model.redact.strength, in: range)
                        .accessibilityLabel(t("redact.strength"))
                    HStack { Text(t("redact.strength.light")); Spacer(); Text(t("redact.strength.maximum")) }
                        .font(.caption).foregroundStyle(Theme.secondary)
                }
                if level == .light {
                    tip(t("redact.tip.weak"), symbol: "exclamationmark.triangle.fill", color: Theme.warning)
                } else if hasText {
                    tip(t("redact.tip.solid"), symbol: "lightbulb.fill", color: Theme.info)
                }
            }
        }
    }

    private func tip(_ text: String, symbol: String, color: Color) -> some View {
        Label { Text(text).font(.caption).fixedSize(horizontal: false, vertical: true) }
            icon: { Image(systemName: symbol).foregroundStyle(color) }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(color.opacity(0.10)))
    }

    // Export

    private func exportSection(_ item: FileItem) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionTitle(t("redact.export.title"))
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(t("redact.metadata.title")).font(.callout.weight(.semibold))
                    Text(t("redact.metadata.hint")).font(.caption).foregroundStyle(Theme.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                Toggle("", isOn: $model.redact.cleanMetadata).labelsHidden().toggleStyle(.switch)
                    .accessibilityLabel(t("redact.metadata.title"))
            }

            Button { withAnimation(.easeInOut(duration: 0.15)) { moreOptions.toggle() } } label: {
                HStack(spacing: 8) {
                    Image(systemName: "chevron.right").font(.caption.weight(.bold))
                        .rotationEffect(.degrees(moreOptions ? 90 : 0))
                    Text(t("redact.moreOptions")).font(.callout)
                    Spacer()
                }
                .foregroundStyle(Theme.ink)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if moreOptions {
                VStack(alignment: .leading, spacing: 14) {
                    field(t("setting.outputFormat")) {
                        Picker("", selection: $model.redact.format) {
                            Text(t("format.same")).tag(nil as OutputFormat?)
                            ForEach(OutputFormat.available) { Text($0.displayName).tag(Optional($0)) }
                        }.labelsHidden()
                    }
                    let lossy = (model.redact.format ?? item.info?.format ?? .jpeg).isLossy
                    field(t("setting.quality")) {
                        HStack {
                            Slider(value: $model.redact.quality, in: 0.05...1).disabled(!lossy)
                            Text(verbatim: "\(Int((model.redact.quality * 100).rounded()))%")
                                .monospacedDigit().frame(width: 40, alignment: .trailing)
                                .foregroundStyle(lossy ? Theme.ink : Theme.secondary)
                        }
                        if !lossy { Text(t("setting.quality.lossless")).font(.caption).foregroundStyle(Theme.secondary) }
                    }
                    field(t("setting.suffix")) {
                        SuffixField(suffix: $model.redact.suffix, example: "photo\(model.redact.suffix).jpg")
                    }
                }
            }
        }
    }

    private func field<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label).font(.caption.weight(.semibold)).foregroundStyle(Theme.secondary)
            content()
        }
    }

    // MARK: Footer

    private var footer: some View {
        let style = model.redact.style
        let level = RedactionService.Level(strength: model.redact.strength)
        let detail = style == .solid ? t("redact.cover.solid") : "\(t("redact.style.\(style.rawValue)")) · \(level.title)"
        let summary = selectedCount == 0
            ? t("redact.summary.none")
            : "\(t(selectedCount == 1 ? "redact.summary.region.one" : "redact.summary.region.many", selectedCount)) · \(detail)"
        return VStack(spacing: 0) {
            Rectangle().fill(Theme.border).frame(height: 1)
            HStack(spacing: 14) {
                Image(systemName: "lock").foregroundStyle(Theme.secondary)
                Text(t("inspect.footer.untouched")).font(.callout).foregroundStyle(Theme.secondary)
                Spacer(minLength: 12)
                Label(summary, systemImage: "square.grid.3x3.fill").font(.callout.weight(.medium)).lineLimit(1)
                Spacer(minLength: 12)
                if model.isBatchRunning { ProgressView().controlSize(.small) }
                Button { model.runRedaction(regions: regions) } label: {
                    Label(t("redact.run"), systemImage: "eye.slash.fill")
                }
                .buttonStyle(.brandPrimary)
                .keyboardShortcut(.return, modifiers: .command)
                .disabled(selectedCount == 0 || model.isBatchRunning)
            }
            .padding(.horizontal, 24).padding(.vertical, 14)
        }
        .background(Theme.surface)
    }

    // MARK: Actions

    private func toggle(_ id: UUID) {
        if let index = regions.firstIndex(where: { $0.id == id }) { regions[index].isSelected.toggle() }
    }

    private func loadSelected() async {
        renderTask?.cancel()
        regions = []; focusedID = nil; error = nil; dragRect = nil; hasScanned = false
        preview = nil; baseImage = nil; baseCG = nil; showOriginal = false; zoom = nil
        guard let url = model.selected?.url else { return }
        let cg = await Task.detached(priority: .userInitiated) { RedactionService.previewBase(url: url) }.value
        guard !Task.isCancelled, let cg else { return }
        baseCG = cg
        baseImage = NSImage(cgImage: cg, size: NSSize(width: cg.width, height: cg.height))
        await performScan(url)
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

    private func performScan(_ url: URL) async {
        scanning = true; error = nil
        let result = await Task.detached(priority: .userInitiated) { Result { try VisualPrivacyScanner.scan(url: url) } }.value
        guard !Task.isCancelled else { return }
        scanning = false
        hasScanned = true
        switch result {
        case .success(let report):
            // Keep anything the user drew by hand.
            regions = regions.filter { $0.kind == .manual } + report.regions
            focusedID = regions.first?.id
            showOriginal = false
        case .failure(let e): error = e.localizedDescription
        }
    }

    private func displayRect(_ normalized: CGRect, in image: CGRect) -> CGRect {
        CGRect(x: image.minX + normalized.minX * image.width,
               y: image.minY + (1 - normalized.maxY) * image.height,
               width: normalized.width * image.width, height: normalized.height * image.height)
    }
}

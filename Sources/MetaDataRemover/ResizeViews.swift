import SwiftUI
import ImageIO

/// Resize: the original and the result drawn to the same scale on the left, the choices on the right.
struct ResizeView: View {
    @EnvironmentObject var model: AppModel
    @State private var image: NSImage?
    @State private var sideSamples: BorderSamples?
    @State private var topBottomSamples: BorderSamples?
    @State private var panStart: CGPoint?

    private var selectedSize: (width: Int, height: Int)? {
        guard let info = model.selected?.info else { return nil }
        return (info.width, info.height)
    }

    /// The preset the user picked, as long as the numbers still match it.
    private var activePreset: SizePreset? {
        let s = model.resize
        guard !s.lockAspect, let id = s.presetID,
              let preset = model.allPresets.first(where: { $0.id == id }),
              preset.width == s.width, preset.height == s.height else { return nil }
        return preset
    }

    var body: some View {
        VStack(spacing: 0) {
            if let item = model.selected, let size = selectedSize {
                HStack(spacing: 0) {
                    ScrollView {
                        VStack(spacing: 16) {
                            stage(item, size)
                            resultCard(size)
                            outputCard(item)
                            VStack(alignment: .leading, spacing: 10) {
                                ProvenanceNotice()
                                UnavailableFormatsNote()
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
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
        .task(id: model.selected?.url) { await loadImage() }
    }

    // MARK: Preview

    /// Both images use one scale, so a smaller result really looks smaller.
    private func stage(_ item: FileItem, _ size: (width: Int, height: Int)) -> some View {
        let s = model.resize
        let plan = ImageResizeService.plan(original: size, settings: s)
        let ow = CGFloat(size.width), oh = CGFloat(size.height)
        let cw = CGFloat(plan.canvasWidth), ch = CGFloat(plan.canvasHeight)
        let panning = s.mode == .pixels && !s.lockAspect && s.fit == .fill && !plan.unchanged
        return GeometryReader { geo in
            let paneW = geo.size.width / 2 - 28, paneH = geo.size.height - 96
            let scale = min(paneW / max(ow, cw), paneH / max(oh, ch))
            HStack(spacing: 0) {
                pane(title: t("compress.before"), dims: "\(size.width) × \(size.height)", highlighted: false, hint: nil) {
                    frame(width: ow * scale, height: oh * scale, draw: CGRect(x: 0, y: 0, width: ow, height: oh),
                          scale: scale, canvas: CGSize(width: ow, height: oh), fill: Theme.canvas, bars: nil, dimOutside: false)
                }
                Rectangle().fill(Theme.border).frame(width: 1)
                pane(title: t("compress.after"), dims: "\(plan.canvasWidth) × \(plan.canvasHeight)", highlighted: true,
                     hint: panning ? t("resize.pan.hint") : nil) {
                    frame(width: cw * scale, height: ch * scale, draw: plan.drawRect, scale: scale,
                          canvas: CGSize(width: cw, height: ch), fill: padFill(item), bars: padBars(item, plan), dimOutside: panning)
                        .gesture(panning ? panGesture(plan: plan, scale: scale) : nil)
                        .help(panning ? t("resize.pan.hint") : "")
                }
            }
        }
        .frame(height: 380)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.sidebar))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.border))
    }

    /// Drag the picture inside the frame to choose which part of it "Fill" keeps.
    private func panGesture(plan: ImageResizeService.Plan, scale: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0).onChanged { value in
            let start = panStart ?? model.resize.anchor
            panStart = start
            let overflowX = (plan.drawRect.width - CGFloat(plan.canvasWidth)) * scale
            let overflowY = (plan.drawRect.height - CGFloat(plan.canvasHeight)) * scale
            var anchor = start
            // Dragging the picture right reveals more of its left side, so the anchor moves the other way.
            if overflowX > 1 { anchor.x = min(max(start.x - value.translation.width / overflowX, 0), 1) }
            if overflowY > 1 { anchor.y = min(max(start.y - value.translation.height / overflowY, 0), 1) }
            model.resize.anchor = anchor
        }.onEnded { _ in panStart = nil }
    }

    /// The image drawn inside a frame of the output size, cropped to it.
    private func frame(width: CGFloat, height: CGFloat, draw: CGRect, scale: CGFloat, canvas: CGSize, fill: Color,
                       bars: (BorderFill.Bars, BorderSamples)?, dimOutside: Bool) -> some View {
        // The drawing space has y pointing up; the screen has it pointing down.
        let x = draw.minX * scale, y = (canvas.height - draw.maxY) * scale
        let picture = Group {
            if let image {
                Image(nsImage: image).resizable().interpolation(.high)
                    .frame(width: draw.width * scale, height: draw.height * scale)
                    .offset(x: x, y: y)
            }
        }
        return ZStack(alignment: .topLeading) {
            if dimOutside {
                picture.opacity(0.28)
            }
            ZStack(alignment: .topLeading) {
                Rectangle().fill(fill)
                if let (kind, samples) = bars {
                    borderGradient(kind, samples, draw: draw, scale: scale, canvas: canvas)
                }
                picture
            }
            .frame(width: max(width, 1), height: max(height, 1), alignment: .topLeading)
            .clipped()
            .shadow(color: .black.opacity(0.25), radius: 8, y: 2)
        }
        .frame(width: max(width, 1), height: max(height, 1), alignment: .topLeading)
    }

    private func colors(_ list: [CGColor]) -> [Color] { list.map { Color(cgColor: $0) } }

    @ViewBuilder
    private func borderGradient(_ kind: BorderFill.Bars, _ samples: BorderSamples, draw: CGRect, scale: CGFloat, canvas: CGSize) -> some View {
        switch kind {
        case .sides:
            LinearGradient(colors: colors(samples.start), startPoint: .top, endPoint: .bottom)
                .frame(width: draw.minX * scale, height: canvas.height * scale)
            LinearGradient(colors: colors(samples.end), startPoint: .top, endPoint: .bottom)
                .frame(width: (canvas.width - draw.maxX) * scale, height: canvas.height * scale)
                .offset(x: draw.maxX * scale)
        case .topBottom:
            LinearGradient(colors: colors(samples.start), startPoint: .leading, endPoint: .trailing)
                .frame(width: canvas.width * scale, height: (canvas.height - draw.maxY) * scale)
            LinearGradient(colors: colors(samples.end), startPoint: .leading, endPoint: .trailing)
                .frame(width: canvas.width * scale, height: draw.minY * scale)
                .offset(y: (canvas.height - draw.minY) * scale)
        }
    }

    private func outputFormat(_ item: FileItem) -> OutputFormat {
        model.resize.outputFormat ?? item.info.map { ImageCodec.sameFormat(as: $0) } ?? .jpeg
    }

    private func keepsTransparency(_ item: FileItem) -> Bool {
        item.info?.hasAlpha == true && outputFormat(item).supportsAlpha
    }

    /// Flat colour behind the picture: the chosen border colour, or a neutral tint when the result stays transparent.
    private func padFill(_ item: FileItem) -> Color {
        keepsTransparency(item) ? Theme.secondary.opacity(0.18) : model.resize.background
    }

    /// Edge-matched border, when "Auto" is on and the result is opaque.
    private func padBars(_ item: FileItem, _ plan: ImageResizeService.Plan) -> (BorderFill.Bars, BorderSamples)? {
        guard model.resize.fit == .pad, model.resize.borderAuto, !keepsTransparency(item),
              let kind = BorderFill.bars(for: plan) else { return nil }
        switch kind {
        case .sides: return sideSamples.map { (kind, $0) }
        case .topBottom: return topBottomSamples.map { (kind, $0) }
        }
    }

    private func pane<Content: View>(title: String, dims: String, highlighted: Bool, hint: String?,
                                     @ViewBuilder content: () -> Content) -> some View {
        ZStack {
            content().frame(maxWidth: .infinity, maxHeight: .infinity)
            VStack {
                HStack {
                    Text(title)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .background(Capsule().fill(highlighted ? Theme.orange : Theme.secondary.opacity(0.85)))
                        .foregroundStyle(highlighted ? Theme.onAccent : .white)
                    Spacer()
                }
                Spacer()
                if let hint {
                    Label(hint, systemImage: "hand.draw")
                        .font(.caption.weight(.medium))
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(Capsule().fill(Theme.orange.opacity(0.16)))
                        .foregroundStyle(Theme.accentText)
                        .padding(.bottom, 6)
                }
                Text("\(dims) px")
                    .font(.callout.weight(.semibold).monospacedDigit())
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Capsule().fill(Theme.surface.opacity(0.92)))
                    .overlay(Capsule().stroke(Theme.border))
            }
            .padding(12)
            .allowsHitTesting(false)
        }
        .frame(maxWidth: .infinity)
        .clipped()
    }

    private func resultCard(_ size: (width: Int, height: Int)) -> some View {
        let s = model.resize
        let plan = ImageResizeService.plan(original: size, settings: s)
        let percent = Int((Double(plan.canvasWidth) / Double(max(size.width, 1)) * 100).rounded())
        let cropped = plan.drawRect.width > Double(plan.canvasWidth) + 0.5 || plan.drawRect.height > Double(plan.canvasHeight) + 0.5
        let enlarged = plan.enlarges
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(verbatim: plan.unchanged
                     ? "\(size.width) × \(size.height) px"
                     : "\(size.width) × \(size.height)  →  \(plan.canvasWidth) × \(plan.canvasHeight) px")
                    .font(BrandTypography.font(size: 22, weight: .bold))
                    .monospacedDigit()
                    .lineLimit(1).minimumScaleFactor(0.7)
                Spacer()
                if plan.unchanged {
                    Chip(text: t("resize.unchanged"), color: Theme.secondary)
                } else {
                    Chip(text: t("resize.scale", percent), color: enlarged ? Theme.warning : Theme.success)
                }
            }
            if cropped {
                Label(t("resize.cropNote"), systemImage: "crop").font(.callout).foregroundStyle(Theme.secondary)
            }
            if enlarged {
                Label(t("resize.enlargeNote"), systemImage: "exclamationmark.triangle.fill").font(.callout).foregroundStyle(Theme.warning)
            }
        }
        .card()
    }

    // MARK: Output card (left column)

    private func outputCard(_ item: FileItem) -> some View {
        let s = model.resize
        let outFormat = s.outputFormat
        let anyAlpha = model.toolTargets.contains { $0.info?.hasAlpha == true }
        let lossy = outFormat == nil || outFormat?.isLossy == true
        return VStack(alignment: .leading, spacing: 16) {
            CardHeader(symbol: "square.and.arrow.down", title: t("resize.output.title"), subtitle: t("resize.output.text"))
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 20, alignment: .top), GridItem(.flexible(), alignment: .top)],
                      alignment: .leading, spacing: 18) {
                field(t("setting.outputFormat")) {
                    Picker("", selection: Binding(get: { outFormat }, set: { model.resize.outputFormat = $0 })) {
                        Text(t("format.same")).tag(OutputFormat?.none)
                        ForEach(OutputFormat.available) { Text($0.displayName).tag(OutputFormat?.some($0)) }
                    }
                    .labelsHidden()
                    .frame(maxWidth: .infinity)
                }
                field(t("setting.quality"), trailing: lossy ? "\(Int((s.quality * 100).rounded()))%" : nil) {
                    if lossy {
                        Slider(value: $model.resize.quality, in: 0.05...1).accessibilityLabel(t("setting.quality"))
                    } else {
                        Text(t("setting.quality.lossless")).font(.callout).foregroundStyle(Theme.secondary)
                    }
                }
                field(t("setting.suffix")) {
                    SuffixField(suffix: $model.resize.suffix,
                                example: exampleName(base: "photo", suffix: s.suffix, ext: outFormat?.fileExtension ?? "jpg"))
                }
                field(t("setting.keepMetadata")) {
                    HStack(alignment: .top, spacing: 12) {
                        Text(t("setting.keepMetadata.hint")).font(.caption).foregroundStyle(Theme.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 6)
                        Toggle("", isOn: $model.resize.keepMetadata).labelsHidden().toggleStyle(.switch)
                            .accessibilityLabel(t("setting.keepMetadata"))
                    }
                }
                if anyAlpha, outFormat == .jpeg {
                    field(t("setting.background")) {
                        HStack(spacing: 10) {
                            ColorPicker("", selection: $model.resize.background, supportsOpacity: false).labelsHidden()
                            Button(t("setting.background.white")) { model.resize.background = .white }.buttonStyle(.brandSecondary)
                            Button(t("setting.background.black")) { model.resize.background = .black }.buttonStyle(.brandSecondary)
                        }
                        Text(t("setting.background.hint")).font(.caption).foregroundStyle(Theme.secondary)
                    }
                }
            }
        }
        .card()
    }

    private func field<Content: View>(_ label: String, trailing: String? = nil, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Text(label).font(.callout.weight(.semibold))
                Spacer()
                if let trailing { Text(trailing).font(.callout.weight(.bold).monospacedDigit()).foregroundStyle(Theme.accentText) }
            }
            content()
        }
    }

    // MARK: Settings panel (right column)

    private func settingsPanel(_ item: FileItem) -> some View {
        let s = model.resize
        return ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                if let batch = model.batch, batch.tool == .resize { BatchView(batch: batch) }
                ScopeRow()

                section(t("setting.resizeBy")) {
                    HStack(spacing: 0) {
                        modeButton(t("resize.mode.pixels"), mode: .pixels, current: s.mode)
                        modeButton(t("resize.mode.percent"), mode: .percent, current: s.mode)
                    }
                    .padding(3)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.canvas))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.border))
                }

                if s.mode == .pixels { pixelControls(s) } else { percentControls(s) }

                Divider()
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(t("setting.neverEnlarge")).font(.callout.weight(.semibold))
                        Text(t("setting.neverEnlarge.hint")).font(.caption).foregroundStyle(Theme.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 8)
                    Toggle("", isOn: $model.resize.neverEnlarge).labelsHidden().toggleStyle(.switch)
                        .accessibilityLabel(t("setting.neverEnlarge"))
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

    private func modeButton(_ title: String, mode: ResizeSettings.Mode, current: ResizeSettings.Mode) -> some View {
        let selected = mode == current
        return Button { model.resize.mode = mode } label: {
            Text(title)
                .font(.callout.weight(selected ? .semibold : .regular))
                .foregroundStyle(selected ? Theme.ink : Theme.secondary)
                .frame(maxWidth: .infinity).padding(.vertical, 9)
                .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(selected ? Theme.orange.opacity(0.14) : Color.clear))
                .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).stroke(selected ? Theme.orange.opacity(0.75) : Color.clear, lineWidth: 1.5))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    // MARK: Pixels

    @ViewBuilder
    private func pixelControls(_ s: ResizeSettings) -> some View {
        popularSizes
        section(t("setting.dimensions")) {
            HStack(spacing: 8) {
                numberField(t("setting.width"), Binding(get: { s.width }, set: { setWidth($0) }))
                Button {
                    model.resize.lockAspect.toggle()
                    model.resize.presetID = nil
                    if model.resize.lockAspect { syncLockedDimension() }
                } label: {
                    Image(systemName: s.lockAspect ? "lock.fill" : "lock.open")
                        .foregroundStyle(s.lockAspect ? Theme.accentText : Theme.secondary)
                        .frame(width: 30, height: 28)
                        .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(s.lockAspect ? Theme.orange.opacity(0.14) : Color.clear))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help(t("setting.lock"))
                .accessibilityLabel(t("setting.lock"))
                .accessibilityValue(s.lockAspect ? t("common.on") : t("common.off"))
                numberField(t("setting.height"), Binding(get: { s.height }, set: { setHeight($0) }))
                Text("px").foregroundStyle(Theme.secondary)
            }
            if s.lockAspect {
                Text(t("resize.lock.hint")).font(.caption).foregroundStyle(Theme.secondary)
            }
        }
        if !s.lockAspect { fitSection(s) }
    }

    /// Ready-made sizes as big tiles, so they are the first thing anyone sees.
    private var popularSizes: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles").foregroundStyle(Theme.orange)
                Text(t("resize.popular")).font(.title3.weight(.bold))
            }
            Text(t("resize.popular.text")).font(.callout).foregroundStyle(Theme.secondary)
                .fixedSize(horizontal: false, vertical: true)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible())], spacing: 10) {
                ForEach(model.allPresets) { preset in
                    PresetTile(preset: preset, selected: activePreset?.id == preset.id) { applyPreset(preset) }
                }
            }
            HStack(spacing: 14) {
                Button(t("preset.save")) { saveCurrentAsPreset() }
                if let p = activePreset, !p.isBuiltIn {
                    Button(t("preset.delete")) { model.deletePreset(p.id); model.resize.presetID = nil }
                }
            }
            .buttonStyle(.link)
            .font(.callout)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.orange.opacity(0.06)))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.orange.opacity(0.4)))
    }

    private func fitSection(_ s: ResizeSettings) -> some View {
        section(t("resize.fit.title")) {
            HStack(spacing: 8) {
                ForEach(ResizeSettings.Fit.choices) { option in
                    FitTile(option: option, selected: s.fit == option) { model.resize.fit = option }
                }
            }
            Text(t("fit.\(s.fit.rawValue).hint")).font(.callout).foregroundStyle(Theme.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if s.fit == .pad { borderControls(s) }
            if s.fit == .fill {
                Button(t("resize.pan.center")) { model.resize.anchor = CGPoint(x: 0.5, y: 0.5) }
                    .buttonStyle(.link).font(.callout)
                    .disabled(model.resize.anchor == CGPoint(x: 0.5, y: 0.5))
            }
        }
    }

    /// Border colour: matched to the picture, a plain colour, or anything from the colour picker.
    private func borderControls(_ s: ResizeSettings) -> some View {
        let isWhite = !s.borderAuto && s.background.cgColorSRGB == Color.white.cgColorSRGB
        let isBlack = !s.borderAuto && s.background.cgColorSRGB == Color.black.cgColorSRGB
        return VStack(alignment: .leading, spacing: 8) {
            Text(t("resize.borderColor")).font(.callout.weight(.semibold))
            HStack(spacing: 6) {
                borderChip(t("resize.border.auto"), symbol: "eyedropper", selected: s.borderAuto) { model.resize.borderAuto = true }
                borderChip(t("setting.background.white"), swatch: .white, selected: isWhite) {
                    model.resize.borderAuto = false; model.resize.background = .white
                }
                borderChip(t("setting.background.black"), swatch: .black, selected: isBlack) {
                    model.resize.borderAuto = false; model.resize.background = .black
                }
                ColorPicker("", selection: Binding(get: { s.background },
                                                   set: { model.resize.background = $0; model.resize.borderAuto = false }),
                            supportsOpacity: false)
                    .labelsHidden()
                    .help(t("resize.border.custom"))
                    .accessibilityLabel(t("resize.border.custom"))
            }
            Text(t(s.borderAuto ? "resize.border.auto.hint" : "resize.border.hint"))
                .font(.caption).foregroundStyle(Theme.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func borderChip(_ title: String, symbol: String? = nil, swatch: Color? = nil, selected: Bool,
                            action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let symbol { Image(systemName: symbol).font(.caption.weight(.semibold)) }
                if let swatch { Circle().fill(swatch).frame(width: 12, height: 12).overlay(Circle().stroke(Theme.elevatedBorder)) }
                Text(title).font(.callout.weight(selected ? .semibold : .regular)).lineLimit(1)
            }
            .foregroundStyle(selected ? Theme.accentText : Theme.ink)
            .padding(.horizontal, 10).padding(.vertical, 7)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(selected ? Theme.orange.opacity(0.14) : Theme.canvas))
            .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous)
                .stroke(selected ? Theme.orange.opacity(0.75) : Theme.border, lineWidth: selected ? 1.5 : 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    @ViewBuilder
    private func percentControls(_ s: ResizeSettings) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(t("setting.percent")).font(.title3.weight(.bold))
                Spacer()
                Text(verbatim: "\(Int(s.percent))%").font(.callout.weight(.bold).monospacedDigit()).foregroundStyle(Theme.accentText)
            }
            Slider(value: $model.resize.percent, in: 10...300, step: 1).accessibilityLabel(t("setting.percent"))
            HStack(spacing: 6) {
                ForEach([25, 50, 75, 150, 200], id: \.self) { p in
                    let selected = Int(s.percent) == p
                    Button { model.resize.percent = Double(p) } label: {
                        Text("\(p)%")
                            .font(.callout.weight(selected ? .semibold : .regular))
                            .foregroundStyle(selected ? Theme.accentText : Theme.ink)
                            .frame(maxWidth: .infinity).padding(.vertical, 7)
                            .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(selected ? Theme.orange.opacity(0.14) : Theme.canvas))
                            .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).stroke(selected ? Theme.orange.opacity(0.7) : Theme.border, lineWidth: selected ? 1.5 : 1))
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func numberField(_ label: String, _ value: Binding<Int>) -> some View {
        TextField(label, value: value, format: .number.grouping(.never))
            .textFieldStyle(.roundedBorder)
            .multilineTextAlignment(.trailing)
            .frame(maxWidth: .infinity)
            .accessibilityLabel(label)
    }

    // MARK: Footer

    private var footer: some View {
        let s = model.resize
        let targets = model.toolTargets
        let detail = s.mode == .percent ? "\(Int(s.percent))%" : (s.lockAspect ? t("resize.footer.locked", s.driver == .width ? s.width : s.height,
                                                                                    s.driver == .width ? t("setting.width") : t("setting.height"))
                                                                              : "\(s.width) × \(s.height) px")
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
                Button { model.runResize() } label: {
                    Label(runTitle("resize.run", count: targets.count), systemImage: "crop")
                }
                .buttonStyle(.brandPrimary)
                .keyboardShortcut(.return, modifiers: .command)
                .disabled(targets.isEmpty || model.isBatchRunning)
            }
            .padding(.horizontal, 24).padding(.vertical, 14)
        }
        .background(Theme.surface)
    }

    // MARK: Actions

    private func loadImage() async {
        image = nil; sideSamples = nil; topBottomSamples = nil
        guard let url = model.selected?.url else { return }
        let loaded = await Task.detached(priority: .userInitiated) { () -> (NSImage, BorderSamples?, BorderSamples?)? in
            guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
            let options: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 1200
            ]
            guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
            return (NSImage(cgImage: cg, size: NSSize(width: cg.width, height: cg.height)),
                    BorderFill.samples(of: cg, bars: .sides), BorderFill.samples(of: cg, bars: .topBottom))
        }.value
        guard let loaded else { return }
        image = loaded.0; sideSamples = loaded.1; topBottomSamples = loaded.2
    }

    // Locked aspect ratio follows the selected image; with a batch, each image follows the typed side.
    private func setWidth(_ v: Int) {
        model.resize.presetID = nil
        model.resize.width = max(v, 1)
        model.resize.driver = .width
        if model.resize.lockAspect, let sz = selectedSize {
            model.resize.height = max(Int((Double(model.resize.width) * Double(sz.height) / Double(sz.width)).rounded()), 1)
        }
    }

    private func setHeight(_ v: Int) {
        model.resize.presetID = nil
        model.resize.height = max(v, 1)
        model.resize.driver = .height
        if model.resize.lockAspect, let sz = selectedSize {
            model.resize.width = max(Int((Double(model.resize.height) * Double(sz.width) / Double(sz.height)).rounded()), 1)
        }
    }

    private func syncLockedDimension() {
        if model.resize.driver == .width { setWidth(model.resize.width) } else { setHeight(model.resize.height) }
    }

    /// A preset always means its exact size, so the picture is placed inside it ("Fit") unless the user chose otherwise.
    private func applyPreset(_ preset: SizePreset) {
        model.resize.mode = .pixels
        model.resize.width = preset.width
        model.resize.height = preset.height
        model.resize.lockAspect = false
        model.resize.presetID = preset.id
    }

    private func saveCurrentAsPreset() {
        let s = model.resize
        guard let name = Dialogs.askText(title: t("preset.save.title"), message: t("preset.save.message", s.width, s.height),
                                         placeholder: t("preset.save.placeholder")) else { return }
        model.savePreset(name: name, width: s.width, height: s.height)
        if let saved = model.customPresets.last {
            model.resize.lockAspect = false
            model.resize.presetID = saved.id
        }
    }
}

// MARK: - Tiles

private struct PresetTile: View {
    let preset: SizePreset
    let selected: Bool
    let action: () -> Void

    var body: some View {
        let ratio = CGFloat(preset.width) / CGFloat(max(preset.height, 1))
        let name = preset.isBuiltIn ? t("preset.\(preset.name)") : preset.name
        return Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .stroke(selected ? Theme.accentText : Theme.secondary, lineWidth: 1.6)
                        .background(RoundedRectangle(cornerRadius: 3).fill((selected ? Theme.orange : Theme.secondary).opacity(0.15)))
                        .aspectRatio(ratio, contentMode: .fit)
                        .frame(maxWidth: 30, maxHeight: 24)
                }
                .frame(height: 26, alignment: .leading)
                VStack(alignment: .leading, spacing: 1) {
                    Text(name).font(.callout.weight(.semibold)).lineLimit(2).multilineTextAlignment(.leading)
                    Text(verbatim: "\(preset.width) × \(preset.height)").font(.caption.monospacedDigit()).foregroundStyle(Theme.secondary)
                }
            }
            .padding(11)
            .frame(maxWidth: .infinity, minHeight: 84, alignment: .topLeading)
            .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(selected ? Theme.orange.opacity(0.12) : Theme.surface))
            .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous)
                .stroke(selected ? Theme.orange.opacity(0.85) : Theme.border, lineWidth: selected ? 1.5 : 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// "Fit", "Fill" and "Stretch" with a tiny picture of what each one does to the image.
private struct FitTile: View {
    let option: ResizeSettings.Fit
    let selected: Bool
    let action: () -> Void

    var body: some View {
        let tint = selected ? Theme.accentText : Theme.secondary
        return Button(action: action) {
            VStack(spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: 3).stroke(tint.opacity(0.9), lineWidth: 1.5).frame(width: 40, height: 28)
                    switch option {
                    case .pad, .fit:
                        RoundedRectangle(cornerRadius: 1.5).fill(tint.opacity(0.55)).frame(width: 18, height: 18)
                    case .fill:
                        RoundedRectangle(cornerRadius: 1.5).fill(tint.opacity(0.55)).frame(width: 40, height: 28)
                        Image(systemName: "crop").font(.system(size: 10, weight: .bold)).foregroundStyle(Theme.surface)
                    case .stretch:
                        RoundedRectangle(cornerRadius: 1.5).fill(tint.opacity(0.55)).frame(width: 40, height: 28)
                        Image(systemName: "arrow.left.and.right").font(.system(size: 10, weight: .bold)).foregroundStyle(Theme.surface)
                    }
                }
                Text(t("fit.\(option.rawValue)"))
                    .font(.callout.weight(selected ? .semibold : .regular))
                    .foregroundStyle(selected ? Theme.ink : Theme.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(selected ? Theme.orange.opacity(0.12) : Theme.canvas))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(selected ? Theme.orange.opacity(0.8) : Theme.border, lineWidth: selected ? 1.5 : 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

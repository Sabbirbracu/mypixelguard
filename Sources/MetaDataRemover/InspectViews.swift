import SwiftUI
import ImageIO

// MARK: - Tabs

enum InspectTab: String, CaseIterable, Identifiable {
    case overview, metadata
    var id: String { rawValue }
    var title: String { t("tab.\(rawValue)") }
}

/// Underlined tab strip with the review count on the right.
struct InspectTabBar: View {
    @Binding var tab: InspectTab
    let reviewCount: Int

    var body: some View {
        HStack(alignment: .bottom, spacing: 26) {
            ForEach(InspectTab.allCases) { entry in
                Button { tab = entry } label: {
                    Text(entry.title)
                        .font(.callout.weight(tab == entry ? .semibold : .regular))
                        .foregroundStyle(tab == entry ? Theme.ink : Theme.secondary)
                        .padding(.vertical, 12)
                        .overlay(alignment: .bottom) {
                            if tab == entry { Rectangle().fill(Theme.orange).frame(height: 2) }
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(tab == entry ? .isSelected : [])
            }
            Spacer()
            Group {
                if reviewCount > 0 {
                    Label(t(reviewCount == 1 ? "inspect.review.one" : "inspect.review.many", reviewCount),
                          systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(Theme.warning)
                        .background(Capsule().fill(Theme.warning.opacity(0.14)).padding(.horizontal, -12).padding(.vertical, -6))
                } else {
                    Label(t("inspect.review.none"), systemImage: "checkmark.circle.fill")
                        .foregroundStyle(Theme.success)
                        .background(Capsule().fill(Theme.success.opacity(0.14)).padding(.horizontal, -12).padding(.vertical, -6))
                }
            }
            .font(.callout.weight(.semibold))
            .padding(.horizontal, 12).padding(.bottom, 8)
        }
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.border).frame(height: 1) }
    }
}

extension Analysis {
    /// Facts that identify a person, place or device. Size and orientation are only information.
    var identifyingFacts: [PrivacyFact] {
        privacyFacts.filter { $0.kind != .dimensions && $0.kind != .orientation }
    }

    var aiMarkers: [Indicator] { indicators.filter { $0.severity != .info } }

    var reviewCount: Int { identifyingFacts.count + aiMarkers.count }
}


// MARK: - Localized indicator text

/// The analyzer stores indicator text in English (other code matches on it), so it is translated here for display.
extension Indicator {
    private func between(_ prefix: String, _ suffix: String = "", in text: String) -> String? {
        guard text.hasPrefix(prefix), text.hasSuffix(suffix), text.count >= prefix.count + suffix.count else { return nil }
        return String(text.dropFirst(prefix.count).dropLast(suffix.count))
    }

    var displayTitle: String {
        if let rest = between("C2PA Content Credentials found", in: title) { return t("ind.c2pa.title", rest) }
        if let v = between("Tagged as AI-generated (DigitalSourceType: ", ")", in: title) { return t("ind.aiTag.title", v) }
        if let v = between("DigitalSourceType: ", in: title) { return t("ind.sourceType.title", v) }
        if let v = between("Mentions “", "”", in: title) { return t("ind.mentions.title", v) }
        if title == "Stable Diffusion generation settings" { return t("ind.sd.title") }
        if title == "ComfyUI workflow" { return t("ind.comfy.title") }
        return title
    }

    var displayDetail: String {
        switch detail {
        case "Signed provenance manifest embedded in the file.": return t("ind.c2pa.file")
        case "Facebook reads this IPTC tag to show an “AI info” label.": return t("ind.aiTag.detail")
        case "Declares how the image was made. Not an AI value.": return t("ind.sourceType.detail")
        case "AI tools and editors leave their name in the file’s metadata.": return t("ind.mentions.detail")
        case "Prompt, seed, model and sampler are stored in this file.": return t("ind.sd.detail")
        case "The full generation graph is stored in this file.": return t("ind.comfy.detail")
        default: break
        }
        let base = "Signed provenance manifest. Facebook and Instagram read it to decide on an “AI info” label."
        if detail.hasPrefix(base) {
            let actions = detail.dropFirst(base.count)
            var out = t("ind.c2pa.detail")
            if let range = actions.range(of: " Actions: ") {
                out += t("ind.c2pa.actions", String(actions[range.upperBound...].dropLast()))
            }
            return out
        }
        return detail
    }

    var displaySource: String {
        switch source {
        case "C2PA manifest": return t("ind.source.c2pa")
        case "File": return t("ind.source.file")
        default: return source
        }
    }
}

// MARK: - Overview

struct InspectOverview: View {
    let item: FileItem
    let analysis: Analysis

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            ImagePreviewCard(item: item, analysis: analysis)
                .frame(minWidth: 320, idealWidth: 400, maxWidth: 430)
            VStack(spacing: 16) {
                PrivacyFindingsCard(item: item, analysis: analysis)
                HStack(alignment: .top, spacing: 16) {
                    VisualScanCard(item: item)
                    ProvenanceCard(item: item, analysis: analysis)
                }
            }
            .frame(maxWidth: .infinity)
        }
    }
}

// MARK: Image preview

private struct ImagePreviewCard: View {
    @EnvironmentObject var model: AppModel
    let item: FileItem
    let analysis: Analysis
    @State private var image: NSImage?
    /// nil means "fit to window".
    @State private var zoom: Double?
    @State private var expanded = false

    private let viewportHeight: CGFloat = 250
    private var pixelSize: CGSize { CGSize(width: max(analysis.width, 1), height: max(analysis.height, 1)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text(t("inspect.preview.title")).font(.headline)
                Spacer()
                Button { expanded = true } label: {
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 12, weight: .semibold))
                        .frame(width: 30, height: 30)
                        .background(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Theme.elevatedBorder))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help(t("inspect.expand"))
                .accessibilityLabel(t("inspect.expand"))
            }

            GeometryReader { geo in
                let fit = min(geo.size.width / pixelSize.width, geo.size.height / pixelSize.height)
                let scale = zoom ?? fit
                ScrollView([.horizontal, .vertical], showsIndicators: zoom != nil) {
                    Group {
                        if let image {
                            Image(nsImage: image).resizable().interpolation(.high)
                                .frame(width: pixelSize.width * scale, height: pixelSize.height * scale)
                        } else {
                            ProgressView().controlSize(.small)
                        }
                    }
                    .frame(minWidth: geo.size.width, minHeight: geo.size.height)
                }
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Theme.canvas))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.border))
                .onAppear { fitScale = fit }
                .onChange(of: geo.size) { _ in fitScale = fit }
            }
            .frame(height: viewportHeight)

            zoomBar

            Divider()
            infoGrid
            Divider()
            embeddedRow

            Button { NSWorkspace.shared.activateFileViewerSelecting([item.url]) } label: {
                Label(t("action.showInFinder"), systemImage: "arrow.up.right").labelStyle(TrailingIcon())
            }
            .buttonStyle(.link)
            .font(.callout)
        }
        .card()
        .task(id: item.id) { image = await Self.load(item.url, analysis: analysis) ?? item.thumb }
        .sheet(isPresented: $expanded) { ExpandedPreview(image: image, name: item.url.lastPathComponent) }
    }

    @State private var fitScale: Double = 1
    private var shownScale: Double { zoom ?? fitScale }

    private var zoomBar: some View {
        HStack(spacing: 10) {
            Menu {
                Button(t("inspect.zoom.fit")) { zoom = nil }
                ForEach([0.5, 1.0, 2.0], id: \.self) { value in
                    Button("\(Int(value * 100))%") { zoom = value }
                }
            } label: {
                Text(zoom == nil ? t("inspect.zoom.fitShort") : t("inspect.zoom.custom"))
                    .font(.callout)
                    .foregroundStyle(Theme.ink)
            }
            .menuStyle(.borderlessButton)
            .fixedSize()
            .padding(.horizontal, 10).padding(.vertical, 5)
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Theme.elevatedBorder))

            Spacer(minLength: 0)

            HStack(spacing: 0) {
                zoomButton("minus") { zoom = max(0.05, shownScale / 1.25) }
                Text("\(Int((shownScale * 100).rounded()))%")
                    .font(.callout.monospacedDigit())
                    .frame(width: 58)
                zoomButton("plus") { zoom = min(8, shownScale * 1.25) }
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

    private var infoGrid: some View {
        let orientation = analysis.privacyFacts.first { $0.kind == .orientation }?.value ?? "—"
        return Grid(alignment: .leading, horizontalSpacing: 20, verticalSpacing: 14) {
            GridRow {
                InfoCell(symbol: "doc.richtext", label: t("inspect.info.format"), value: analysis.kind.rawValue)
                InfoCell(symbol: "arrow.up.left.and.arrow.down.right", label: t("inspect.info.dimensions"),
                         value: "\(analysis.width) × \(analysis.height) px")
            }
            GridRow {
                InfoCell(symbol: "doc", label: t("inspect.info.size"), value: byteString(analysis.fileSize))
                InfoCell(symbol: "rotate.right", label: t("inspect.info.orientation"), value: orientation)
            }
        }
    }

    private var embeddedRow: some View {
        let present = MetaCategory.allCases.filter { analysis.bytes(in: $0) > 0 }.prefix(3)
        return HStack(spacing: 12) {
            IconTile(symbol: "square.stack.3d.up")
            Text(t("inspect.embedded")).font(.callout)
            Spacer(minLength: 6)
            if present.isEmpty {
                Text(t("inspect.none")).font(.callout).foregroundStyle(Theme.secondary)
            } else {
                ForEach(Array(present.enumerated()), id: \.element) { index, c in
                    if index > 0 { Divider().frame(height: 20) }
                    HStack(spacing: 6) {
                        Text(t("cat.\(c.rawValue).short")).font(.caption).foregroundStyle(Theme.secondary)
                        Text(byteString(analysis.bytes(in: c))).font(.callout.weight(.medium))
                    }
                }
            }
        }
    }

    private static func load(_ url: URL, analysis: Analysis) async -> NSImage? {
        let size = NSSize(width: max(analysis.width, 1), height: max(analysis.height, 1))
        return await Task.detached(priority: .userInitiated) {
            guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
            let options: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 3000
            ]
            guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
            return NSImage(cgImage: cg, size: size)
        }.value
    }
}

private struct ExpandedPreview: View {
    @Environment(\.dismiss) private var dismiss
    let image: NSImage?
    let name: String

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(name).font(.headline).lineLimit(1)
                Spacer()
                Button(t("common.close")) { dismiss() }
                    .buttonStyle(.brandSecondary)
                    .keyboardShortcut(.cancelAction)
            }
            .padding(16)
            Divider()
            Group {
                if let image { Image(nsImage: image).resizable().scaledToFit().padding(16) }
                else { ProgressView() }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.canvas)
        }
        .frame(minWidth: 760, minHeight: 560)
        .background(Theme.surface)
    }
}

private struct InfoCell: View {
    let symbol: String
    let label: String
    let value: String

    var body: some View {
        HStack(spacing: 12) {
            IconTile(symbol: symbol)
            VStack(alignment: .leading, spacing: 1) {
                Text(label).font(.caption).foregroundStyle(Theme.secondary)
                Text(value).font(.callout.weight(.semibold)).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct IconTile: View {
    let symbol: String
    var tint: Color = Theme.secondary

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 32, height: 32)
            .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(tint.opacity(0.13)))
    }
}

private struct TrailingIcon: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 5) { configuration.title; configuration.icon.font(.caption.weight(.bold)) }
    }
}

// MARK: Privacy findings

private struct PrivacyFindingsCard: View {
    let item: FileItem
    let analysis: Analysis
    @State private var openTopic: PrivacyTopic?

    var body: some View {
        let facts = analysis.identifyingFacts
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Text(t("inspect.findings.title")).font(.title3.weight(.bold))
                if !facts.isEmpty {
                    Text("\(facts.count)")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Theme.onAccent)
                        .frame(minWidth: 22, minHeight: 22)
                        .background(Circle().fill(Theme.orange))
                }
            }
            Text(t(facts.isEmpty ? "inspect.findings.none" : "inspect.findings.text"))
                .font(.callout).foregroundStyle(Theme.secondary).padding(.top, -8)

            if !facts.isEmpty {
                VStack(spacing: 10) {
                    ForEach(facts) { fact in FindingRow(fact: fact) { open(fact) } }
                }
                Divider()
                Label(t("inspect.findings.review"), systemImage: "info.circle")
                    .font(.callout).foregroundStyle(Theme.secondary)
            }
        }
        .card()
        .sheet(item: $openTopic) { topic in
            PrivacyDetailSheet(topic: topic, item: item, analysis: analysis)
        }
    }

    private func open(_ fact: PrivacyFact) {
        openTopic = PrivacyTopic.allCases.first { $0.factKind == fact.kind }
    }
}

private struct FindingRow: View {
    let fact: PrivacyFact
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: fact.kind.symbol)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(severityColor(for: fact.severity))
                    .frame(width: 48, height: 48)
                    .background(Circle().fill(severityColor(for: fact.severity).opacity(0.14)))
                VStack(alignment: .leading, spacing: 2) {
                    Text(t("privacy.fact.\(fact.kind.rawValue)")).font(.callout).foregroundStyle(Theme.secondary)
                    Text(fact.value).font(.title3.weight(.bold)).foregroundStyle(Theme.ink).lineLimit(2)
                    Text(fact.source.replacingOccurrences(of: " / ", with: " • "))
                        .font(.caption).foregroundStyle(Theme.secondary)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right").font(.callout.weight(.semibold)).foregroundStyle(Theme.secondary)
            }
            .padding(.horizontal, 16).padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.canvas))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.border))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: Visible privacy scan

private struct VisualScanCard: View {
    let item: FileItem
    @State private var report: VisualPrivacyReport?
    @State private var scanning = false
    @State private var errorText: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                IconTile(symbol: "viewfinder")
                Text(t("visual.scan.title")).font(.headline)
            }
            status
            Text(report == nil ? t("inspect.scan.text") : t("visual.scan.review"))
                .font(.callout).foregroundStyle(Theme.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if let report, !report.regions.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(report.regions.prefix(5)) { region in
                        Label(t("visual.kind.\(region.kind.rawValue)"), systemImage: region.kind.symbol)
                            .font(.caption)
                    }
                    if report.regions.count > 5 {
                        Text("+\(report.regions.count - 5)").font(.caption).foregroundStyle(Theme.secondary)
                    }
                }
            }

            Button { start() } label: {
                HStack(spacing: 8) {
                    if scanning { ProgressView().controlSize(.small); Text(t("visual.scan.scanning")) }
                    else { Image(systemName: "viewfinder"); Text(report == nil ? t("visual.scan.run") : t("visual.scan.again")) }
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.brandSecondary)
            .disabled(scanning)

            Label(t("inspect.scan.local"), systemImage: "lock")
                .font(.caption).foregroundStyle(Theme.secondary)
        }
        .card()
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    @ViewBuilder private var status: some View {
        if let errorText {
            pill(errorText, color: Theme.danger, symbol: "exclamationmark.triangle.fill")
        } else if let report {
            if report.regions.isEmpty {
                pill(t("inspect.scan.clear"), color: Theme.success, symbol: "checkmark.circle.fill")
            } else {
                pill(t("inspect.scan.found", report.regions.count), color: Theme.warning, symbol: "exclamationmark.triangle.fill")
            }
        } else {
            pill(t("inspect.scan.notScanned"), color: Theme.secondary, symbol: nil)
        }
    }

    private func pill(_ text: String, color: Color, symbol: String?) -> some View {
        HStack(spacing: 6) {
            if let symbol { Image(systemName: symbol) }
            Text(text).lineLimit(2)
        }
        .font(.callout)
        .foregroundStyle(color == Theme.secondary ? Theme.ink : color)
        .padding(.horizontal, 14).padding(.vertical, 7)
        .background(Capsule().fill(color.opacity(0.14)))
    }

    private func start() {
        scanning = true
        errorText = nil
        report = nil
        let url = item.url
        Task {
            let result = await Task.detached(priority: .userInitiated) {
                Result { try VisualPrivacyScanner.scan(url: url) }
            }.value
            scanning = false
            switch result {
            case .success(let value): report = value
            case .failure(let error): errorText = error.localizedDescription
            }
        }
    }
}

// MARK: AI & provenance

private struct ProvenanceCard: View {
    let item: FileItem
    let analysis: Analysis
    @State private var showDetails = false

    var body: some View {
        let markers = analysis.aiMarkers
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                IconTile(symbol: "doc.text")
                Text(t("inspect.ai.title")).font(.headline)
            }
            HStack(spacing: 8) {
                Image(systemName: markers.isEmpty ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                Text(markers.isEmpty ? t("inspect.ai.none") : t("inspect.ai.found", markers.count)).lineLimit(2)
            }
            .font(.callout)
            .foregroundStyle(markers.isEmpty ? Theme.success : severityColor(for: analysis.aiRisk))
            .padding(.horizontal, 14).padding(.vertical, 7)
            .background(Capsule().fill((markers.isEmpty ? Theme.success : severityColor(for: analysis.aiRisk)).opacity(0.14)))

            Text(t("inspect.ai.caveat")).font(.callout).foregroundStyle(Theme.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Button { showDetails = true } label: {
                Label(t("inspect.ai.details"), systemImage: "arrow.right").labelStyle(TrailingIcon())
            }
            .buttonStyle(.link)
            .font(.callout.weight(.medium))
            .padding(.top, 2)
        }
        .card()
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .sheet(isPresented: $showDetails) { ProvenanceDetails(analysis: analysis) }
    }
}

private struct ProvenanceDetails: View {
    @Environment(\.dismiss) private var dismiss
    let analysis: Analysis

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(t("findings.ai.title")).font(BrandTypography.font(size: 19, weight: .bold))
                .padding(.horizontal, 24).padding(.top, 24)
            Text(t("findings.ai.caveat")).font(.callout).foregroundStyle(Theme.secondary)
                .padding(.horizontal, 24).padding(.top, 4).padding(.bottom, 14)

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if analysis.indicators.isEmpty {
                        Label(t("findings.none"), systemImage: "checkmark.circle.fill").foregroundStyle(Theme.success)
                    } else {
                        ForEach(analysis.indicators) { ind in
                            HStack(alignment: .top, spacing: 10) {
                                Circle().fill(severityColor(for: ind.severity)).frame(width: 9, height: 9).padding(.top, 6)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(ind.displayTitle).font(.callout.weight(.medium))
                                    Text(ind.displayDetail).font(.caption).foregroundStyle(Theme.secondary)
                                    Text(t("findings.foundIn", ind.displaySource)).font(.caption2).foregroundStyle(Theme.secondary)
                                }
                            }
                        }
                    }

                    Divider()
                    Text(t("findings.hidden.title")).font(.headline)
                    let rows = MetaCategory.allCases.map { ($0, analysis.bytes(in: $0)) }.filter { $0.1 > 0 }
                    if rows.isEmpty {
                        Text(t("findings.hidden.none")).foregroundStyle(Theme.secondary)
                    } else {
                        ForEach(rows, id: \.0) { (c, size) in
                            HStack(alignment: .firstTextBaseline) {
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(t("cat.\(c.rawValue).title")).font(.callout.weight(.medium))
                                    Text(t("cat.\(c.rawValue).detail")).font(.caption).foregroundStyle(Theme.secondary)
                                }
                                Spacer()
                                Chip(text: byteString(size), color: c == .icc ? Theme.secondary : Theme.accentText)
                            }
                        }
                    }
                }
                .padding(.horizontal, 24)
            }
            .frame(maxHeight: 380)

            Divider().padding(.top, 14)
            HStack {
                Spacer()
                Button(t("common.close")) { dismiss() }
                    .buttonStyle(.brandSecondary)
                    .keyboardShortcut(.cancelAction)
            }
            .padding(.horizontal, 24).padding(.vertical, 16)
        }
        .frame(width: 520)
        .background(Theme.surface)
    }
}

// MARK: - Footer

struct InspectFooter: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Theme.border).frame(height: 1)
            HStack(spacing: 14) {
                Image(systemName: "lock").foregroundStyle(Theme.secondary)
                Text(t("inspect.footer.untouched")).font(.callout).foregroundStyle(Theme.secondary)
                Spacer(minLength: 12)
                Text(t("inspect.footer.next")).font(.callout).foregroundStyle(Theme.secondary)
                Button { model.tool = .clean } label: {
                    Label(t("inspect.footer.review"), systemImage: "arrow.right").labelStyle(TrailingIcon())
                }
                .buttonStyle(.brandPrimary)
                .keyboardShortcut(.return, modifiers: .command)
            }
            .padding(.horizontal, 32).padding(.vertical, 14)
            .frame(maxWidth: 1100 + 64)
            .frame(maxWidth: .infinity)
        }
        .background(Theme.surface)
    }
}

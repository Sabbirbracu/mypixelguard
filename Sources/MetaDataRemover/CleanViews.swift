import SwiftUI
import ImageIO

// MARK: - Choices

enum CleanDefaults {
    /// Private details removed by default, matching what the recommended block removal already covers.
    static let fields: Set<PrivateMetadataField> = [.location, .device, .author]
}

/// One switch on the Clean tab. The first three remove a single private detail, the rest remove a whole block.
enum CleanItem: String, CaseIterable, Identifiable {
    case gps, device, author, c2pa, xmp, exif, comments, icc
    var id: String { rawValue }

    enum Group: String, CaseIterable { case basic, content, other }

    var group: Group {
        switch self {
        case .gps, .device, .author: .basic
        case .c2pa, .xmp, .exif: .content
        case .comments, .icc: .other
        }
    }

    var symbol: String {
        switch self {
        case .gps: "location.fill"
        case .device: "camera.metering.unknown"
        case .author: "person.2.fill"
        case .c2pa: "checkmark.seal.fill"
        case .xmp: "doc.text.fill"
        case .exif: "camera.fill"
        case .comments: "text.bubble.fill"
        case .icc: "paintpalette.fill"
        }
    }

    var field: PrivateMetadataField? {
        switch self {
        case .gps: .location
        case .device: .device
        case .author: .author
        default: nil
        }
    }

    var categories: [MetaCategory] {
        switch self {
        case .c2pa: [.c2pa]
        case .xmp: [.xmp]
        case .exif: [.exif]
        case .comments: [.iptc, .other]
        case .icc: [.icc]
        default: []
        }
    }

    func isPresent(in a: Analysis) -> Bool {
        switch self {
        case .gps: a.privacyFacts.contains { $0.kind == .location }
        case .device: a.privacyFacts.contains { $0.kind == .device }
        case .author: a.privacyFacts.contains { $0.kind == .author }
        case .c2pa: a.hasProvenance
        default: categories.contains { a.bytes(in: $0) > 0 }
        }
    }

    func bytes(in a: Analysis) -> Int { categories.reduce(0) { $0 + a.bytes(in: $1) } }

    /// A single detail is covered when a switch below it already removes the whole block it lives in.
    func isCovered(by remove: Set<MetaCategory>) -> Bool { field?.isCovered(by: remove) ?? false }
}

private extension AppModel {
    func isOn(_ item: CleanItem) -> Bool {
        if let field = item.field { return cleanFields.contains(field) || field.isCovered(by: remove) }
        return item.categories.allSatisfy { remove.contains($0) }
    }

    func binding(_ item: CleanItem) -> Binding<Bool> {
        Binding(get: { self.isOn(item) },
                set: { on in
                    if let field = item.field {
                        if on { self.cleanFields.insert(field) } else { self.cleanFields.remove(field) }
                    } else if on {
                        item.categories.forEach { self.remove.insert($0) }
                    } else {
                        item.categories.forEach { self.remove.remove($0) }
                    }
                })
    }

    var isRecommended: Bool { remove == MetaCategory.defaultRemoval && cleanFields == CleanDefaults.fields }

    func resetCleanOptions() {
        remove = MetaCategory.defaultRemoval
        cleanFields = CleanDefaults.fields
    }

    func cleanCounts(_ a: Analysis) -> (removing: Int, keeping: Int) {
        let present = CleanItem.allCases.filter { $0.isPresent(in: a) }
        let removing = present.filter { isOn($0) }.count
        return (removing, present.count - removing)
    }
}

// MARK: - File card

struct CleanFileCard: View {
    @EnvironmentObject var model: AppModel
    let item: FileItem
    let analysis: Analysis

    private var dates: (created: Date?, modified: Date?) {
        let attrs = try? FileManager.default.attributesOfItem(atPath: item.url.path)
        return (attrs?[.creationDate] as? Date, attrs?[.modificationDate] as? Date)
    }

    private var location: PrivacyFact? { analysis.privacyFacts.first { $0.kind == .location } }

    var body: some View {
        HStack(spacing: 0) {
            thumbnail
            Divider().padding(.vertical, 14)
            info
            if let location {
                LocationPanel(fact: location).padding(14)
            }
        }
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.surface))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.border))
    }

    private var thumbnail: some View {
        Group {
            if let thumb = item.thumb {
                Image(nsImage: thumb).resizable().scaledToFill()
            } else {
                Rectangle().fill(.quaternary)
            }
        }
        .frame(width: 96, height: 96)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.border))
        .padding(14)
    }

    private var info: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(item.url.lastPathComponent)
                    .font(.headline)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Button { model.removeFile(item.id) } label: {
                    Label(t("action.removeFromList"), systemImage: "xmark")
                        .labelStyle(.iconOnly)
                        .font(.caption.weight(.bold))
                        .frame(width: 22, height: 22)
                        .background(Circle().fill(Theme.secondary.opacity(0.16)))
                        .foregroundStyle(Theme.secondary)
                }
                .buttonStyle(.plain)
                .help(t("action.removeFromList"))
            }
            HStack(spacing: 6) {
                Chip(text: analysis.kind.rawValue)
                Chip(text: "\(analysis.width) × \(analysis.height)")
                Chip(text: byteString(analysis.fileSize))
            }
            let d = dates
            Text([d.created.map { "\(t("clean.created")): \($0.formatted(date: .abbreviated, time: .omitted))" },
                  d.modified.map { "\(t("clean.modified")): \($0.formatted(date: .abbreviated, time: .omitted))" }]
                .compactMap { $0 }.joined(separator: "  ·  "))
                .font(.caption)
                .foregroundStyle(Theme.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
    }
}

private struct LocationPanel: View {
    let fact: PrivacyFact

    /// "23.810300° N, 90.412500° E" → signed coordinates for a Maps link.
    private var mapsURL: URL? {
        let parts = fact.value.split(separator: ",").map(String.init)
        guard parts.count == 2 else { return nil }
        func number(_ s: String) -> Double? {
            let digits = s.filter { "0123456789.-".contains($0) }
            guard let v = Double(digits) else { return nil }
            return s.contains("S") || s.contains("W") ? -abs(v) : v
        }
        guard let lat = number(parts[0]), let lon = number(parts[1]) else { return nil }
        return URL(string: "https://maps.apple.com/?ll=\(lat),\(lon)&q=Photo")
    }

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Label(t("clean.originalLocation"), systemImage: "mappin.circle.fill")
                    .font(.caption)
                    .foregroundStyle(Theme.secondary)
                    .labelStyle(OrangeIconLabelStyle())
                Text(fact.value).font(.callout.weight(.medium)).lineLimit(2)
                if let mapsURL {
                    Link(destination: mapsURL) {
                        Label(t("clean.viewOnMap"), systemImage: "arrow.right")
                            .labelStyle(TrailingIconLabelStyle())
                            .font(.caption.weight(.semibold))
                    }
                    .foregroundStyle(Theme.accentText)
                }
            }
            MapTile()
        }
        .padding(12)
        .frame(width: 290)
        .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(Theme.canvas))
        .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).stroke(Theme.border))
    }
}

private struct OrangeIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            configuration.icon.foregroundStyle(Theme.orange)
            configuration.title
        }
    }
}

private struct TrailingIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 5) { configuration.title; configuration.icon }
    }
}

/// An offline stand-in for a map (the app never touches the network): faint streets plus a pin.
private struct MapTile: View {
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Theme.secondary.opacity(0.10))
            Canvas { context, size in
                var path = Path()
                path.move(to: CGPoint(x: 0, y: size.height * 0.62)); path.addLine(to: CGPoint(x: size.width, y: size.height * 0.30))
                path.move(to: CGPoint(x: size.width * 0.35, y: 0)); path.addLine(to: CGPoint(x: size.width * 0.55, y: size.height))
                path.move(to: CGPoint(x: 0, y: size.height * 0.15)); path.addLine(to: CGPoint(x: size.width, y: size.height * 0.85))
                context.stroke(path, with: .color(Theme.secondary.opacity(0.28)), lineWidth: 2)
            }
            Image(systemName: "mappin.circle.fill")
                .font(.system(size: 24))
                .foregroundStyle(Theme.orange, Theme.surface)
        }
        .frame(width: 64, height: 64)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .accessibilityHidden(true)
    }
}

// MARK: - Options + preview

struct CleanOptions: View {
    @EnvironmentObject var model: AppModel
    let item: FileItem
    let analysis: Analysis

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            optionsCard.frame(minWidth: 360, maxWidth: .infinity)
            VStack(spacing: 16) {
                PreviewCard(item: item)
                ChangeSummaryCard(analysis: analysis)
            }
            .frame(width: 340)
        }
    }

    private var optionsCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            CardHeader(symbol: "checkmark.shield.fill", title: t("clean.options.title"), subtitle: t("clean.options.text")) {
                Button { model.resetCleanOptions() } label: {
                    Label(t("options.reset"), systemImage: "arrow.counterclockwise")
                }
                .buttonStyle(.brandSecondary)
                .font(.caption)
                .disabled(model.isRecommended)
            }
            ForEach(CleanItem.Group.allCases, id: \.self) { group in
                groupPanel(group)
            }
        }
        .card()
    }

    private func groupPanel(_ group: CleanItem.Group) -> some View {
        let items = CleanItem.allCases.filter { $0.group == group }
        let selected = items.filter { model.isOn($0) }.count
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: groupSymbol(group))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.accentText)
                    .frame(width: 30, height: 30)
                    .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Theme.orange.opacity(0.14)))
                VStack(alignment: .leading, spacing: 1) {
                    Text(t("clean.group.\(group.rawValue)")).font(.callout.weight(.semibold))
                    Text(t("clean.group.\(group.rawValue).text")).font(.caption).foregroundStyle(Theme.secondary)
                }
                Spacer(minLength: 8)
                Text(t("clean.selected", selected))
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 9).padding(.vertical, 4)
                    .background(Capsule().fill(Theme.orange.opacity(0.16)))
                    .foregroundStyle(Theme.accentText)
            }
            .padding(12)

            ForEach(Array(items.enumerated()), id: \.element) { index, c in
                Divider().padding(.leading, 54)
                CleanRow(item: c, analysis: analysis)
            }
        }
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.canvas))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.border))
    }

    private func groupSymbol(_ group: CleanItem.Group) -> String {
        switch group {
        case .basic: "lock.shield.fill"
        case .content: "doc.text.fill"
        case .other: "chevron.left.forwardslash.chevron.right"
        }
    }
}

private struct CleanRow: View {
    @EnvironmentObject var model: AppModel
    let item: CleanItem
    let analysis: Analysis

    var body: some View {
        let covered = item.isCovered(by: model.remove)
        let present = item.isPresent(in: analysis)
        HStack(spacing: 12) {
            Image(systemName: item.symbol)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(present ? Theme.accentText : Theme.secondary)
                .frame(width: 28, height: 28)
                .background(RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill((present ? Theme.orange : Theme.secondary).opacity(0.13)))
            VStack(alignment: .leading, spacing: 1) {
                Text(t("clean.item.\(item.rawValue)")).font(.callout.weight(.medium))
                Text(covered ? t("clean.included") : t("clean.item.\(item.rawValue).text"))
                    .font(.caption).foregroundStyle(Theme.secondary)
                    .lineLimit(2)
            }
            Spacer(minLength: 8)
            Toggle("", isOn: model.binding(item))
                .labelsHidden()
                .toggleStyle(.switch)
                .disabled(covered)
                .accessibilityLabel(t("clean.item.\(item.rawValue)"))
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .opacity(present ? 1 : 0.6)
    }
}

private struct PreviewCard: View {
    let item: FileItem
    @State private var image: NSImage?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            CardHeader(symbol: "eye.fill", title: t("clean.preview.title"), subtitle: t("clean.preview.text"))
            HStack(spacing: 8) {
                pane(label: t("clean.preview.original"), highlighted: false)
                Image(systemName: "arrow.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Theme.secondary)
                    .frame(width: 26, height: 26)
                    .background(Circle().fill(Theme.canvas))
                    .overlay(Circle().stroke(Theme.border))
                pane(label: t("clean.preview.after"), highlighted: true)
            }
        }
        .card()
        .task(id: item.id) { image = await Self.load(item.url) ?? item.thumb }
    }

    private func pane(label: String, highlighted: Bool) -> some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Theme.canvas)
            if let image {
                Image(nsImage: image).resizable().scaledToFit().padding(6)
            }
            Text(label)
                .font(.caption2.weight(.semibold))
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(highlighted ? Theme.success : Theme.secondary.opacity(0.85)))
                .foregroundStyle(.white)
                .padding(7)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 120)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(highlighted ? Theme.success.opacity(0.5) : Theme.border))
    }

    private static func load(_ url: URL) async -> NSImage? {
        await Task.detached(priority: .userInitiated) {
            guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
            let options: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 520
            ]
            guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
            return NSImage(cgImage: cg, size: NSSize(width: cg.width, height: cg.height))
        }.value
    }
}

private struct ChangeSummaryCard: View {
    @EnvironmentObject var model: AppModel
    let analysis: Analysis

    var body: some View {
        let present = CleanItem.allCases.filter { $0.isPresent(in: analysis) }
        VStack(alignment: .leading, spacing: 12) {
            CardHeader(symbol: "list.bullet", title: t("clean.changes.title"), subtitle: t("clean.changes.text"))
            if present.isEmpty {
                Label(t("clean.nothingFound"), systemImage: "checkmark.shield.fill")
                    .font(.callout.weight(.medium))
                    .foregroundStyle(Theme.success)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(present.enumerated()), id: \.element) { index, c in
                        row(c)
                        if index < present.count - 1 { Divider() }
                    }
                }
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Theme.canvas))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.border))
            }
            Label(t("clean.private"), systemImage: "lock.shield.fill")
                .font(.caption)
                .foregroundStyle(Theme.success)
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Theme.success.opacity(0.10)))
        }
        .card()
    }

    private func row(_ c: CleanItem) -> some View {
        let removing = model.isOn(c)
        return HStack(spacing: 10) {
            Image(systemName: c.symbol)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.accentText)
                .frame(width: 26, height: 26)
                .background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(Theme.orange.opacity(0.13)))
            Text(t("clean.item.\(c.rawValue)")).font(.callout).lineLimit(1)
            Spacer(minLength: 6)
            let bytes = c.bytes(in: analysis)
            if bytes > 0 {
                Text(byteString(bytes)).font(.caption.monospacedDigit()).foregroundStyle(Theme.secondary)
            }
            Text(removing ? t("clean.removed") : t("clean.kept"))
                .font(.caption2.weight(.semibold))
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill((removing ? Theme.orange : Theme.success).opacity(0.16)))
                .foregroundStyle(removing ? Theme.accentText : Theme.success)
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
    }
}

// MARK: - Footer

struct CleanFooter: View {
    @EnvironmentObject var model: AppModel
    let item: FileItem
    let analysis: Analysis

    private var folder: URL { model.saveFolder ?? item.url.deletingLastPathComponent() }

    var body: some View {
        let counts = model.cleanCounts(analysis)
        VStack(spacing: 0) {
            Rectangle().fill(Theme.border).frame(height: 1)
            HStack(spacing: 16) {
                Button { model.chooseSaveFolder(fallback: item.url.deletingLastPathComponent()) } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "folder")
                        Text(t("clean.saveTo")).foregroundStyle(Theme.secondary)
                        Text(folder.path.replacingOccurrences(of: NSHomeDirectory(), with: "~"))
                            .lineLimit(1).truncationMode(.head)
                            .frame(maxWidth: 220, alignment: .leading)
                        Image(systemName: "chevron.up.chevron.down").font(.caption2).foregroundStyle(Theme.secondary)
                    }
                    .font(.callout)
                    .padding(.horizontal, 12).padding(.vertical, 9)
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Theme.canvas))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.border))
                }
                .buttonStyle(.plain)
                .disabled(model.isCleaning)

                Spacer(minLength: 8)

                HStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.orange)
                    Text(t(counts.removing == 1 ? "clean.count.removed.one" : "clean.count.removed", counts.removing))
                        .fontWeight(.medium)
                    if counts.keeping > 0 {
                        Text("•").foregroundStyle(Theme.secondary)
                        Text(t(counts.keeping == 1 ? "clean.count.kept.one" : "clean.count.kept", counts.keeping))
                            .foregroundStyle(Theme.secondary)
                    }
                }
                .font(.callout)
                .lineLimit(1)

                if model.isCleaning {
                    ProgressView().controlSize(.small)
                    Button(t("common.cancel")) { model.cancelCleaning() }.buttonStyle(.brandSecondary)
                }
                let ready = model.files.filter { $0.analysis != nil }.count
                if ready > 1 {
                    Button { model.cleanAll() } label: {
                        Label(t("clean.all", ready), systemImage: "square.stack.3d.up")
                    }
                    .buttonStyle(.brandSecondary)
                    .disabled(model.isCleaning)
                }
                Button { model.cleanSelected() } label: {
                    Label(item.isCleaned ? t("clean.again") : t("clean.run"), systemImage: "sparkles")
                }
                .buttonStyle(.brandPrimaryLarge)
                .keyboardShortcut(.return, modifiers: .command)
                .disabled(model.isCleaning)
            }
            .padding(.horizontal, 32).padding(.vertical, 14)
            .frame(maxWidth: 1040 + 64)
            .frame(maxWidth: .infinity)
        }
        .background(Theme.surface.shadow(.drop(color: .black.opacity(0.06), radius: 12, y: -4)))
    }
}

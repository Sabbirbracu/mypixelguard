import SwiftUI

/// A kind of sensitive information the Clean banner can point at ("location", "identity", …).
enum PrivacyTopic: String, CaseIterable, Identifiable {
    case location, identity, device, captured, software
    var id: String { rawValue }

    var factKind: PrivacyFactKind {
        switch self {
        case .location: .location
        case .identity: .author
        case .device: .device
        case .captured: .captured
        case .software: .software
        }
    }

    /// The selective-cleaning field that removes this topic.
    var field: PrivateMetadataField {
        switch self {
        case .location: .location
        case .identity: .author
        case .device: .device
        case .captured: .dates
        case .software: .software
        }
    }

    var symbol: String {
        switch self {
        case .location: "location.fill"
        case .identity: "person.crop.circle.fill"
        case .device: "camera.fill"
        case .captured: "calendar.badge.clock"
        case .software: "app.badge.fill"
        }
    }

    var word: String { t("topic.\(rawValue).word") }
    var title: String { t("topic.\(rawValue).title") }
    var about: String { t("topic.\(rawValue).about") }

    /// Topics present in an image, in display order.
    static func present(in analysis: Analysis, severities: Set<Severity>) -> [PrivacyTopic] {
        allCases.filter { topic in
            analysis.privacyFacts.contains { $0.kind == topic.factKind && severities.contains($0.severity) }
        }
    }

    /// The raw metadata entries behind this topic, using the same key rules as the remover.
    func rows(in analysis: Analysis) -> [PrivacyDetailRow] {
        var rows: [PrivacyDetailRow] = []
        for group in analysis.groups {
            let isGPS = group.title.lowercased().contains("gps")
            for item in group.items where !item.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                let key = item.key.lowercased().filter { $0.isLetter || $0.isNumber }
                let belongs = self == .location ? isGPS : (!isGPS && field.matches(normalizedKey: key))
                if belongs { rows.append(PrivacyDetailRow(group: group.title, key: item.key, value: item.value)) }
            }
        }
        return rows
    }
}

struct PrivacyDetailRow: Identifiable {
    let id = UUID()
    let group: String
    let key: String
    let value: String
}

/// Opens when the user clicks a highlighted word in the banner: shows exactly what is embedded
/// and offers to remove just that kind of information.
struct PrivacyDetailSheet: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let topic: PrivacyTopic
    let item: FileItem
    let analysis: Analysis

    var body: some View {
        let rows = topic.rows(in: analysis)
        let tint = topic == .location || topic == .identity ? Theme.accentText : Theme.warning
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: topic.symbol)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(tint)
                    .frame(width: 44, height: 44)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(tint.opacity(0.14)))
                VStack(alignment: .leading, spacing: 4) {
                    Text(topic.title).font(BrandTypography.font(size: 19, weight: .bold))
                    Text(topic.about).font(.callout).foregroundStyle(Theme.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 24).padding(.top, 24).padding(.bottom, 16)

            ScrollView {
                VStack(spacing: 0) {
                    if rows.isEmpty {
                        Text(t("topic.empty")).foregroundStyle(Theme.secondary).padding(20)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(row.key).font(.caption.weight(.semibold)).foregroundStyle(Theme.secondary)
                            Text(row.value).font(.callout.weight(.medium)).textSelection(.enabled)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .contextMenu {
                            Button(t("metadata.copyValue")) { copy(row.value) }
                            Button(t("metadata.copyRow")) { copy("\(row.key): \(row.value)") }
                        }
                        if index < rows.count - 1 { Divider().padding(.leading, 16) }
                    }
                }
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.canvas))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.border))
                .padding(.horizontal, 24)
            }
            .frame(maxHeight: 280)

            Text(t("topic.note")).font(.caption).foregroundStyle(Theme.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 24).padding(.top, 12)

            Divider().padding(.top, 18)
            HStack(spacing: 10) {
                Button { copyAll(rows) } label: { Label(t("topic.copy"), systemImage: "doc.on.doc") }
                    .buttonStyle(.brandSecondary)
                    .disabled(rows.isEmpty)
                Spacer()
                Button(t("common.close")) { dismiss() }
                    .buttonStyle(.brandSecondary)
                    .keyboardShortcut(.cancelAction)
                Button {
                    dismiss()
                    // Let the sheet finish closing before the save panel opens.
                    DispatchQueue.main.async {
                        model.runSelectiveClean(fields: [topic.field], targets: [item])
                    }
                } label: {
                    Label(t("topic.remove", topic.word), systemImage: "trash")
                }
                .buttonStyle(.brandPrimary)
                .disabled(model.isBatchRunning)
            }
            .padding(.horizontal, 24).padding(.vertical, 16)
        }
        .frame(width: 520)
        .background(Theme.surface)
    }

    private func copy(_ text: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }

    private func copyAll(_ rows: [PrivacyDetailRow]) {
        copy(rows.map { "\($0.key): \($0.value)" }.joined(separator: "\n"))
    }
}

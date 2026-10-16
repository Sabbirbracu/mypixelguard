import Foundation
import ImageIO

enum PrivateMetadataField: String, CaseIterable, Identifiable, Hashable {
    case location, device, dates, author, software
    var id: String { rawValue }
    var symbol: String {
        switch self {
        case .location: "location.slash.fill"
        case .device: "camera.fill"
        case .dates: "calendar.badge.minus"
        case .author: "person.crop.circle.badge.minus"
        case .software: "app.badge"
        }
    }

    /// Whether a metadata key (lower-cased, letters and digits only) belongs to this field.
    /// Location is handled separately because it removes the whole GPS dictionary.
    func matches(normalizedKey key: String) -> Bool {
        let tokens: [String]
        switch self {
        case .location: return false
        case .device:   tokens = ["make", "model", "lensmake", "lensmodel", "lensinfo", "cameramodelname"]
        case .dates:    tokens = ["date", "time"]
        case .author:
            // CreatorTool names software, so it belongs to the editing-software field.
            if key.contains("creatortool") { return false }
            tokens = ["artist", "author", "creator", "owner", "copyright", "writer"]
        case .software: tokens = ["software", "processingsoftware", "hostcomputer", "creatortool"]
        }
        return tokens.contains(where: key.contains)
    }
}

enum SelectiveMetadataService {
    static func process(url: URL, removing fields: Set<PrivateMetadataField>) throws -> ProcessedImage {
        let info = try ImageCodec.info(url: url)
        let image = try ImageCodec.loadImage(url: url)
        let format = ImageCodec.sameFormat(as: info)
        var properties = info.properties
        sanitize(&properties, fields: fields)
        let data = try ImageCodec.encode(image, as: format, quality: format.isLossy ? 0.96 : nil,
                                         background: CGColor(gray: 1, alpha: 1), keepProperties: properties)
        let names = fields.map { t("privacy.field.\($0.rawValue)") }.sorted().joined(separator: ", ")
        return ProcessedImage(data: data, format: format, width: image.width, height: image.height,
                              notes: [t("selective.note", names)], expectMetadataClean: fields == Set(PrivateMetadataField.allCases))
    }

    private static func sanitize(_ props: inout [String: Any], fields: Set<PrivateMetadataField>) {
        if fields.contains(.location) { props.removeValue(forKey: kCGImagePropertyGPSDictionary as String) }
        for key in Array(props.keys) {
            guard var dictionary = props[key] as? [String: Any] else { continue }
            for child in Array(dictionary.keys) {
                let normalized = child.lowercased().filter { $0.isLetter || $0.isNumber }
                let remove = fields.contains { $0.matches(normalizedKey: normalized) }
                if remove { dictionary.removeValue(forKey: child) }
            }
            if dictionary.isEmpty { props.removeValue(forKey: key) } else { props[key] = dictionary }
        }
    }
}

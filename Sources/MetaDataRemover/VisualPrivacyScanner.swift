import Foundation
import Vision
import ImageIO

enum SensitiveRegionKind: String, CaseIterable, Identifiable, Codable {
    case face, email, phone, address, identifier, licensePlate, manual
    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .face: return "person.crop.rectangle"
        case .email: return "envelope.fill"
        case .phone: return "phone.fill"
        case .address: return "house.fill"
        case .identifier: return "person.text.rectangle"
        case .licensePlate: return "car.fill"
        case .manual: return "rectangle.dashed"
        }
    }
}

/// Normalized Vision coordinates: origin at the image's lower-left corner.
struct SensitiveRegion: Identifiable, Codable, Equatable {
    var id = UUID()
    var kind: SensitiveRegionKind
    var rect: CGRect
    var label: String
    var confidence: Float
    var isSelected = true
}

struct VisualPrivacyReport {
    var regions: [SensitiveRegion]
    var recognizedTextCount: Int

    var faces: Int { regions.filter { $0.kind == .face }.count }
    var sensitiveText: Int { regions.filter { $0.kind != .face && $0.kind != .manual }.count }
}

enum VisualPrivacyScanner {
    static func scan(url: URL) throws -> VisualPrivacyReport {
        var regions: [SensitiveRegion] = []
        var textCount = 0

        let faces = VNDetectFaceRectanglesRequest()
        let text = VNRecognizeTextRequest()
        text.recognitionLevel = .accurate
        text.usesLanguageCorrection = true
        text.minimumTextHeight = 0.012

        let handler = VNImageRequestHandler(url: url, options: [:])
        try handler.perform([faces, text])

        for face in faces.results ?? [] {
            regions.append(SensitiveRegion(kind: .face, rect: face.boundingBox,
                                           label: t("visual.kind.face"), confidence: face.confidence))
        }
        for observation in text.results ?? [] {
            guard let candidate = observation.topCandidates(1).first else { continue }
            textCount += 1
            let value = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
            guard let kind = classify(value) else { continue }
            regions.append(SensitiveRegion(kind: kind, rect: observation.boundingBox,
                                           label: redactedLabel(for: value, kind: kind), confidence: candidate.confidence))
        }
        return VisualPrivacyReport(regions: deduplicate(regions), recognizedTextCount: textCount)
    }

    private static func classify(_ text: String) -> SensitiveRegionKind? {
        let lower = text.lowercased()
        if matches(#"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}"#, text) { return .email }
        if matches(#"(?:\+?\d[\d\s().-]{7,}\d)"#, text) { return .phone }
        let addressWords = ["street", "st.", "road", "rd.", "avenue", "ave", "lane", "ln.", "drive", "dr.",
                            "বাসা", "রোড", "সড়ক", "গ্রাম", "উপজেলা", "district", "postcode", "zip"]
        if text.rangeOfCharacter(from: .decimalDigits) != nil && addressWords.contains(where: lower.contains) { return .address }
        if lower.contains("passport") || lower.contains("national id") || lower.contains("nid") ||
            lower.contains("driver license") || lower.contains("driving licence") { return .identifier }
        // Conservative plate heuristic: mixed letters/numbers, short enough to resemble a plate.
        let compact = text.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "-", with: "")
        if (5...10).contains(compact.count), compact.rangeOfCharacter(from: .letters) != nil,
           compact.rangeOfCharacter(from: .decimalDigits) != nil,
           matches(#"^[A-Z0-9 -]{5,12}$"#, text) { return .licensePlate }
        return nil
    }

    private static func matches(_ pattern: String, _ text: String) -> Bool {
        text.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
    }

    private static func redactedLabel(for value: String, kind: SensitiveRegionKind) -> String {
        switch kind {
        case .email:
            guard let at = value.firstIndex(of: "@") else { return t("visual.kind.email") }
            return String(value.prefix(2)) + "•••" + value[at...]
        case .phone:
            return "••••" + String(value.filter(\.isNumber).suffix(4))
        default:
            return value.count > 42 ? String(value.prefix(42)) + "…" : value
        }
    }

    private static func deduplicate(_ regions: [SensitiveRegion]) -> [SensitiveRegion] {
        var output: [SensitiveRegion] = []
        for region in regions.sorted(by: { $0.confidence > $1.confidence }) {
            let duplicate = output.contains {
                $0.kind == region.kind && intersectionOverUnion($0.rect, region.rect) > 0.65
            }
            if !duplicate { output.append(region) }
        }
        return output
    }

    private static func intersectionOverUnion(_ a: CGRect, _ b: CGRect) -> CGFloat {
        let intersection = a.intersection(b)
        guard !intersection.isNull else { return 0 }
        let union = a.width * a.height + b.width * b.height - intersection.width * intersection.height
        return union > 0 ? intersection.width * intersection.height / union : 0
    }
}

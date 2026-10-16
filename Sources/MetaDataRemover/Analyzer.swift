import Foundation
import ImageIO
import CoreGraphics
import UniformTypeIdentifiers

struct MetaItem: Identifiable {
    let id = UUID()
    let key: String
    let value: String
}

struct MetaGroup: Identifiable {
    let id = UUID()
    var title: String
    var items: [MetaItem]
}

enum PrivacyFactKind: String, CaseIterable, Identifiable {
    case location, device, captured, author, software, orientation, dimensions
    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .location: return "location.fill"
        case .device: return "camera.fill"
        case .captured: return "calendar.badge.clock"
        case .author: return "person.crop.circle"
        case .software: return "app.badge"
        case .orientation: return "rotate.right"
        case .dimensions: return "aspectratio"
        }
    }
}

struct PrivacyFact: Identifiable {
    let id = UUID()
    var kind: PrivacyFactKind
    var value: String
    var severity: Severity
    var source: String
}

struct Analysis {
    var kind: ImageKind
    var fileSize: Int
    var width: Int
    var height: Int
    var hasAlpha: Bool = false
    var pieces: [Piece]
    var indicators: [Indicator]
    var privacyFacts: [PrivacyFact]
    var groups: [MetaGroup]
    var rawXMP: String?

    var aiRisk: Severity? { indicators.map(\.severity).max() }
    var privacyRisk: Severity? { privacyFacts.map(\.severity).max() }
    var risk: Severity? { (indicators.map(\.severity) + privacyFacts.map(\.severity)).max() }

    func bytes(in category: MetaCategory) -> Int {
        pieces.filter { $0.category == category }.reduce(0) { $0 + $1.size }
    }

    /// Metadata blocks other than the color profile.
    var metadataPieces: [Piece] {
        pieces.filter { $0.category != nil && $0.category != .icc }
    }
}

enum Analyzer {

    // MARK: Entry point

    static func analyze(url: URL) throws -> Analysis {
        guard let data = try? Data(contentsOf: url, options: .mappedIfSafe) else { throw EngineError.unreadable }
        let b = [UInt8](data)
        let kind = Engine.detect(b)
        let pieces = try Engine.parse(b, kind: kind)

        var indicators: [Indicator] = []
        var seen = Set<String>()
        func add(_ list: [Indicator]) {
            for i in list where seen.insert(i.title + "|" + i.source).inserted { indicators.append(i) }
        }

        if pieces.isEmpty {
            // HEIC, TIFF, GIF … : no block-level parsing, so look through the start of the file.
            let head = Bytes.latin1(b.prefix(8_000_000)[...])
            add(scan(text: head, source: "File"))
            let lower = head.lowercased()
            if lower.contains("c2pa") && lower.contains("jumb") {
                indicators.insert(Indicator(severity: .medium, title: "C2PA Content Credentials found",
                                            detail: "Signed provenance manifest embedded in the file.", source: "File"), at: 0)
            }
        } else {
            let c2pa = pieces.filter { $0.category == .c2pa }
            if !c2pa.isEmpty {
                let text = c2pa.map { Bytes.latin1(b[$0.range].prefix(2_000_000)) }.joined()
                let hints = scan(text: text, source: "C2PA manifest")
                let actions = unique(matches(of: "c2pa\\.[a-z_]+", in: text)).prefix(6)
                var detail = "Signed provenance manifest. Facebook and Instagram read it to decide on an “AI info” label."
                if !actions.isEmpty { detail += " Actions: " + actions.joined(separator: ", ") + "." }
                let size = c2pa.reduce(0) { $0 + $1.size }
                let sev: Severity = hints.contains { $0.severity == .high } ? .high : .medium
                add([Indicator(severity: sev, title: "C2PA Content Credentials found (\(byteString(size)))",
                               detail: detail, source: "C2PA manifest")])
                add(hints)
            }
            for p in pieces where p.category != nil && p.category != .icc && p.category != .c2pa {
                let text = Bytes.latin1(b[p.range].prefix(2_000_000))
                add(scan(text: text, source: p.label))
            }
        }
        indicators.sort { $0.severity > $1.severity }

        let io = imageIOGroups(url: url)
        var groups = io.groups
        if !pieces.isEmpty {
            let blocks = pieces.filter { $0.category != nil }.map {
                MetaItem(key: $0.label, value: byteString($0.size) + "  ·  " + ($0.category?.title ?? ""))
            }
            if !blocks.isEmpty { groups.append(MetaGroup(title: "Embedded blocks in the file", items: blocks)) }
        }

        let privacyFacts = privacyFacts(from: groups, width: io.width, height: io.height)
        return Analysis(kind: kind, fileSize: b.count, width: io.width, height: io.height, hasAlpha: io.hasAlpha,
                        pieces: pieces, indicators: indicators, privacyFacts: privacyFacts, groups: groups,
                        rawXMP: extractXMP(b, pieces: pieces))
    }

    // MARK: AI-marker detection

    private static let aiValues: Set<String> = [
        "trainedalgorithmicmedia", "compositewithtrainedalgorithmicmedia",
        "algorithmicmedia", "compositesynthetic"
    ]

    private static let aiKeywords: [String] = [
        "adobe firefly", "firefly", "dall-e", "dall·e", "dalle", "midjourney", "stable diffusion", "stablediffusion",
        "openai", "chatgpt", "gpt-image", "imagen", "gemini", "made with ai", "ai generated", "ai-generated",
        "generative ai", "generative fill", "generative expand", "generated by ai", "synthid", "sdxl", "comfyui",
        "automatic1111", "novelai", "leonardo.ai", "ideogram", "black forest labs", "bing image creator",
        "microsoft designer", "meta ai", "imagine with meta", "runwayml", "stability ai"
    ]

    private static let keywordRegex: NSRegularExpression? = {
        let alternation = aiKeywords.sorted { $0.count > $1.count }
            .map { NSRegularExpression.escapedPattern(for: $0) }.joined(separator: "|")
        return try? NSRegularExpression(pattern: "(?<![a-z0-9])(" + alternation + ")(?![a-z0-9])", options: .caseInsensitive)
    }()

    private static let sourceTypeRegex = try? NSRegularExpression(
        pattern: "(compositeWithTrainedAlgorithmicMedia|compositeSynthetic|trainedAlgorithmicMedia|algorithmicMedia|algorithmicallyEnhanced|digitalCapture|minorHumanEdits|humanEdits|digitalArt|virtualRecording|screenCapture|composite|softwareImage|dataDrivenMedia)",
        options: .caseInsensitive)

    static func scan(text: String, source: String) -> [Indicator] {
        var out: [Indicator] = []
        let lower = text.lowercased()

        if lower.contains("digitalsourcetype"), let re = sourceTypeRegex {
            var seen = Set<String>()
            for v in matches(re, in: text) where seen.insert(v.lowercased()).inserted {
                if aiValues.contains(v.lowercased()) {
                    out.append(Indicator(severity: .high, title: "Tagged as AI-generated (DigitalSourceType: \(v))",
                                         detail: "Facebook reads this IPTC tag to show an “AI info” label.", source: source))
                } else {
                    out.append(Indicator(severity: .info, title: "DigitalSourceType: \(v)",
                                         detail: "Declares how the image was made. Not an AI value.", source: source))
                }
            }
        }

        if let re = keywordRegex {
            var seen = Set<String>()
            for k in matches(re, in: text) where seen.insert(k.lowercased()).inserted {
                out.append(Indicator(severity: .high, title: "Mentions “\(k)”",
                                     detail: "AI tools and editors leave their name in the file’s metadata.", source: source))
            }
        }

        if lower.contains("steps:") && lower.contains("sampler") {
            out.append(Indicator(severity: .high, title: "Stable Diffusion generation settings",
                                 detail: "Prompt, seed, model and sampler are stored in this file.", source: source))
        }
        if lower.contains("\"class_type\"") {
            out.append(Indicator(severity: .high, title: "ComfyUI workflow",
                                 detail: "The full generation graph is stored in this file.", source: source))
        }
        return out
    }

    private static func matches(of pattern: String, in text: String) -> [String] {
        guard let re = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) else { return [] }
        return matches(re, in: text)
    }

    private static func matches(_ re: NSRegularExpression, in text: String) -> [String] {
        let ns = text as NSString
        return re.matches(in: text, range: NSRange(location: 0, length: ns.length)).map { ns.substring(with: $0.range) }
    }

    private static func unique(_ a: [String]) -> [String] {
        var seen = Set<String>()
        return a.filter { seen.insert($0.lowercased()).inserted }
    }

    // MARK: XMP

    private static func extractXMP(_ b: [UInt8], pieces: [Piece]) -> String? {
        let ranges: [Range<Int>] = pieces.isEmpty
            ? [0..<min(b.count, 8_000_000)]
            : pieces.filter { $0.category == .xmp }.map(\.range)
        for r in ranges {
            let slice = b[r]
            guard let start = Bytes.find(slice, "<x:xmpmeta") ?? Bytes.find(slice, "<?xpacket") else { continue }
            var end = slice.endIndex
            while end > start, [0x00, 0x20, 0x0A, 0x0D, 0x09].contains(slice[end - 1]) { end -= 1 }
            let text = String(decoding: slice[start..<end], as: UTF8.self)
            return text.count > 60_000 ? String(text.prefix(60_000)) + "\n… (truncated)" : text
        }
        return nil
    }

    // MARK: Readable metadata through ImageIO

    private static let groupNames: [String: String] = [
        "TIFF": "TIFF (camera & software)", "Exif": "EXIF", "ExifAux": "EXIF (lens details)",
        "GPS": "GPS location", "IPTC": "IPTC", "JFIF": "JFIF", "PNG": "PNG", "8BIM": "Photoshop (8BIM)",
        "MakerApple": "Apple maker notes", "MakerCanon": "Canon maker notes", "MakerNikon": "Nikon maker notes",
        "MakerFuji": "Fujifilm maker notes", "MakerOlympus": "Olympus maker notes", "MakerPentax": "Pentax maker notes",
        "MakerMinolta": "Minolta maker notes", "WebP": "WebP", "HEICS": "HEIC", "TGA": "TGA", "DNG": "DNG", "CIFF": "CIFF"
    ]

    private static let imageKeys: [String: String] = [
        "PixelWidth": "Width (px)", "PixelHeight": "Height (px)", "DPIWidth": "DPI (horizontal)",
        "DPIHeight": "DPI (vertical)", "Depth": "Bit depth", "ColorModel": "Color model",
        "ProfileName": "Color profile", "Orientation": "Orientation", "HasAlpha": "Has transparency",
        "IsIndexed": "Indexed color", "IsFloat": "Floating point"
    ]

    static func imageIOGroups(url: URL) -> (groups: [MetaGroup], width: Int, height: Int, hasAlpha: Bool) {
        guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return ([], 0, 0, false) }
        var groups: [MetaGroup] = []
        var width = 0, height = 0
        var hasAlpha = false

        if let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [String: Any] {
            width = props["PixelWidth"] as? Int ?? 0
            height = props["PixelHeight"] as? Int ?? 0
            hasAlpha = props["HasAlpha"] as? Bool ?? false

            var imageItems: [MetaItem] = []
            for (k, v) in props.sorted(by: { $0.key < $1.key }) {
                if v is [String: Any] {
                    let bare = k.trimmingCharacters(in: CharacterSet(charactersIn: "{}"))
                    let name = groupNames[bare] ?? bare
                    let items = (v as! [String: Any]).sorted { $0.key < $1.key }
                        .map { MetaItem(key: $0.key, value: describe($0.value)) }
                    if !items.isEmpty { groups.append(MetaGroup(title: name, items: items)) }
                } else {
                    imageItems.append(MetaItem(key: imageKeys[k] ?? k, value: describe(v)))
                }
            }
            if !imageItems.isEmpty { groups.insert(MetaGroup(title: "Image", items: imageItems), at: 0) }
        }

        if let md = CGImageSourceCopyMetadataAtIndex(src, 0, nil),
           let tags = CGImageMetadataCopyTags(md) as? [CGImageMetadataTag] {
            var byPrefix: [String: [MetaItem]] = [:]
            let skip: Set<String> = ["tiff", "exif", "exifEX", "aux"]
            for tag in tags {
                let prefix = (CGImageMetadataTagCopyPrefix(tag) as String?) ?? "xmp"
                guard !skip.contains(prefix) else { continue }
                let name = (CGImageMetadataTagCopyName(tag) as String?) ?? "?"
                let value: String
                if let v = CGImageMetadataTagCopyValue(tag) { value = describe(v) } else { value = "" }
                byPrefix[prefix, default: []].append(MetaItem(key: name, value: value))
            }
            for (prefix, items) in byPrefix.sorted(by: { $0.key < $1.key }) {
                groups.append(MetaGroup(title: "XMP · \(prefix)", items: items.sorted { $0.key < $1.key }))
            }
        }
        return (groups, width, height, hasAlpha)
    }

    static func describe(_ v: Any) -> String {
        // ImageIO hands XMP arrays back as CGImageMetadataTag objects; show their values, not the object.
        if CFGetTypeID(v as AnyObject) == CGImageMetadataTagGetTypeID() {
            let tag = v as! CGImageMetadataTag
            return CGImageMetadataTagCopyValue(tag).map(describe) ?? ""
        }
        switch v {
        case let s as String: return s
        case let d as Data: return "<\(d.count) bytes>"
        case let n as NSNumber: return n.stringValue
        case let a as [Any]: return a.map(describe).joined(separator: ", ")
        case let d as [String: Any]:
            return d.sorted { $0.key < $1.key }.map { "\($0.key): \(describe($0.value))" }.joined(separator: "; ")
        default: return "\(v)"
        }
    }

    // MARK: Privacy summary

    /// Promotes the metadata people care about before sharing into a concise Findings report.
    /// The complete unmodified values remain available in All Metadata.
    static func privacyFacts(from groups: [MetaGroup], width: Int, height: Int) -> [PrivacyFact] {
        struct Entry { var group: String; var key: String; var value: String }
        let entries = groups.flatMap { group in
            group.items.map { Entry(group: group.title.lowercased(), key: normalized($0.key), value: $0.value) }
        }

        func first(_ keys: [String], groups groupHints: [String] = []) -> Entry? {
            entries.first { entry in
                keys.contains(where: { entry.key == $0 || entry.key.hasSuffix($0) }) &&
                (groupHints.isEmpty || groupHints.contains(where: entry.group.contains)) &&
                !entry.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            }
        }
        func values(_ keys: [String], groups groupHints: [String] = []) -> [String] {
            var seen = Set<String>()
            return entries.compactMap { entry in
                guard keys.contains(where: { entry.key == $0 || entry.key.hasSuffix($0) }),
                      groupHints.isEmpty || groupHints.contains(where: entry.group.contains),
                      seen.insert(entry.value).inserted else { return nil }
                return entry.value
            }
        }

        var facts: [PrivacyFact] = []
        let latitude = first(["latitude"], groups: ["gps"])
        let longitude = first(["longitude"], groups: ["gps"])
        let latitudeRef = first(["latituderef"], groups: ["gps"])?.value ?? ""
        let longitudeRef = first(["longituderef"], groups: ["gps"])?.value ?? ""
        if latitude != nil || longitude != nil || entries.contains(where: { $0.group.contains("gps") }) {
            // Raw coordinates can carry 15 decimals (92.00583333333333); six is already about 10 cm.
            func rounded(_ value: String) -> String { Double(value).map { String(format: "%.6f", $0) } ?? value }
            let coordinate = [latitude.map { rounded($0.value) + (latitudeRef.isEmpty ? "" : "° " + latitudeRef) },
                              longitude.map { rounded($0.value) + (longitudeRef.isEmpty ? "" : "° " + longitudeRef) }]
                .compactMap { $0 }.joined(separator: ", ")
            facts.append(PrivacyFact(kind: .location,
                                     value: coordinate.isEmpty ? t("privacy.value.locationPresent") : coordinate,
                                     severity: .high, source: "GPS"))
        }

        let makes = values(["make"], groups: ["tiff", "exif", "maker"])
        let models = values(["model", "lensmodel", "uniquecameramodel"], groups: ["tiff", "exif", "maker", "dng"])
        let device = (makes + models).joined(separator: " · ")
        if !device.isEmpty {
            facts.append(PrivacyFact(kind: .device, value: device, severity: .medium, source: "EXIF / TIFF"))
        }

        if let date = first(["datetimeoriginal", "datetimecreated", "datetime", "createdate", "modifydate"]) {
            facts.append(PrivacyFact(kind: .captured, value: date.value, severity: .medium, source: date.group))
        }

        let authors = values(["artist", "author", "creator", "ownername", "copyright", "byline"])
        if !authors.isEmpty {
            facts.append(PrivacyFact(kind: .author, value: authors.joined(separator: " · "), severity: .high, source: "EXIF / IPTC / XMP"))
        }

        let software = values(["software", "processingsoftware", "hostcomputer", "creatortool"])
        if !software.isEmpty {
            facts.append(PrivacyFact(kind: .software, value: software.joined(separator: " · "), severity: .medium, source: "EXIF / XMP"))
        }

        if let orientation = first(["orientation"]) {
            facts.append(PrivacyFact(kind: .orientation, value: orientation.value, severity: .info, source: orientation.group))
        }
        facts.append(PrivacyFact(kind: .dimensions, value: "\(width) × \(height) px", severity: .info, source: "Image"))
        return facts
    }

    private static func normalized(_ key: String) -> String {
        key.lowercased().filter { $0.isLetter || $0.isNumber }
    }
}

func byteString(_ n: Int) -> String {
    ByteCountFormatter.string(fromByteCount: Int64(n), countStyle: .file)
}

// MARK: - Cleaning

struct RemovedItem: Identifiable {
    let id = UUID()
    let category: MetaCategory
    let bytes: Int
}

struct CleanReport {
    var output: URL
    var beforeBytes: Int
    var afterBytes: Int
    var removed: [RemovedItem]
    var reencoded: Bool
    var keptOrientation: Int?
    /// Result of re-scanning the finished file.
    var decodes: Bool
    var remainingIndicators: [Indicator]
    var remainingBlocks: [Piece]
}

enum ImageCleaner {

    static let nameSuffix = "_AI-label-cleaned"

    /// e.g. "holiday.jpg" → "holiday_AI-label-cleaned.jpg"
    static func suggestedFilename(for url: URL, kind: ImageKind, hasAlpha: Bool) -> String {
        let base = url.deletingPathExtension().lastPathComponent
        let ext: String
        switch kind {
        case .other: ext = hasAlpha ? "png" : "jpg"
        default: ext = url.pathExtension.isEmpty ? "jpg" : url.pathExtension
        }
        return base + nameSuffix + "." + ext
    }

    /// Writes a cleaned copy to `output`. With `avoidOverwrite` an existing file is never replaced
    /// (a number is added to the name); the original image is never replaced in either mode.
    static func clean(input: URL, output: URL, avoidOverwrite: Bool, remove: Set<MetaCategory>) throws -> CleanReport {
        guard let data = try? Data(contentsOf: input) else { throw EngineError.unreadable }
        let b = [UInt8](data)
        let kind = Engine.detect(b)

        var newExt: String?
        var removedList: [RemovedItem] = []
        var outBytes: [UInt8]
        var kept: Int?
        var reencoded = false

        switch kind {
        case .jpeg, .png, .webp:
            let pieces = try Engine.parse(b, kind: kind)
            removedList = summarize(pieces, remove: remove)
            (outBytes, kept) = Engine.strip(b, kind: kind, pieces: pieces, remove: remove)
        case .gif:
            throw EngineError.unsupported("GIF files aren’t supported. Convert the image to PNG or JPEG first.")
        case .other:
            // HEIC, TIFF, BMP, AVIF …: decode and save a fresh JPEG/PNG that carries no metadata at all.
            let (encoded, ext) = try reencode(url: input)
            newExt = ext
            reencoded = true
            let newKind = Engine.detect(encoded)
            let pieces = try Engine.parse(encoded, kind: newKind)
            let everything = Set(MetaCategory.allCases).subtracting(remove.contains(.icc) ? [] : [.icc])
            (outBytes, kept) = Engine.strip(encoded, kind: newKind, pieces: pieces, remove: everything)
            removedList = [RemovedItem(category: .other, bytes: max(0, b.count - outBytes.count))]
        }

        var target = output
        if let e = newExt, target.pathExtension.lowercased() != e {
            target = target.deletingPathExtension().appendingPathExtension(e)
        }
        if target.standardizedFileURL == input.standardizedFileURL || (avoidOverwrite && FileManager.default.fileExists(atPath: target.path)) {
            target = uniqueURL(target)
        }
        try Data(outBytes).write(to: target)

        // Verify by reading the new file back.
        let decodes: Bool = {
            guard let s = CGImageSourceCreateWithURL(target as CFURL, nil) else { return false }
            return CGImageSourceCreateImageAtIndex(s, 0, nil) != nil
        }()
        let rescan = try? Analyzer.analyze(url: target)

        return CleanReport(output: target, beforeBytes: b.count, afterBytes: outBytes.count,
                           removed: removedList, reencoded: reencoded, keptOrientation: kept,
                           decodes: decodes,
                           remainingIndicators: rescan?.indicators.filter { $0.severity != .info } ?? [],
                           remainingBlocks: rescan?.metadataPieces ?? [])
    }

    private static func summarize(_ pieces: [Piece], remove: Set<MetaCategory>) -> [RemovedItem] {
        MetaCategory.allCases.compactMap { c in
            guard remove.contains(c) else { return nil }
            let total = pieces.filter { $0.category == c }.reduce(0) { $0 + $1.size }
            return total > 0 ? RemovedItem(category: c, bytes: total) : nil
        }
    }

    static func uniqueURL(_ url: URL) -> URL {
        let dir = url.deletingLastPathComponent()
        let base = url.deletingPathExtension().lastPathComponent
        let ext = url.pathExtension
        var candidate = url
        var n = 2
        while FileManager.default.fileExists(atPath: candidate.path) {
            candidate = dir.appendingPathComponent("\(base) \(n)").appendingPathExtension(ext)
            n += 1
        }
        return candidate
    }

    /// Decodes with the orientation applied and re-encodes without any metadata.
    private static func reencode(url: URL) throws -> ([UInt8], String) {
        guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { throw EngineError.unreadable }
        let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [String: Any]
        let longest = max(props?["PixelWidth"] as? Int ?? 0, props?["PixelHeight"] as? Int ?? 0, 1)
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: longest
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(src, 0, options as CFDictionary) else { throw EngineError.unreadable }

        let hasAlpha: Bool
        switch image.alphaInfo {
        case .none, .noneSkipFirst, .noneSkipLast: hasAlpha = false
        default: hasAlpha = true
        }
        let type = hasAlpha ? UTType.png : UTType.jpeg
        let out = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(out, type.identifier as CFString, 1, nil) else { throw EngineError.encodeFailed }
        let destProps: [CFString: Any] = hasAlpha ? [:] : [kCGImageDestinationLossyCompressionQuality: 0.95]
        CGImageDestinationAddImage(dest, image, destProps as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { throw EngineError.encodeFailed }
        return ([UInt8](out as Data), hasAlpha ? "png" : "jpg")
    }
}

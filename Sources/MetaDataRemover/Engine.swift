import Foundation

// MARK: - Basic types

/// A kind of embedded data that can be stripped from an image file.
enum MetaCategory: String, CaseIterable, Identifiable, Hashable {
    case c2pa, xmp, iptc, exif, other, icc

    var id: String { rawValue }

    var title: String {
        switch self {
        case .c2pa:  return "C2PA / Content Credentials"
        case .xmp:   return "XMP data"
        case .iptc:  return "IPTC / Photoshop data"
        case .exif:  return "EXIF data"
        case .other: return "Comments & other embedded data"
        case .icc:   return "Color profile (ICC)"
        }
    }

    var detail: String {
        switch self {
        case .c2pa:  return "The signed “made with AI” manifest that Facebook and Instagram read."
        case .xmp:   return "Holds the IPTC “DigitalSourceType” AI tag, AI tool names and edit history."
        case .iptc:  return "Captions, keywords, copyright and Photoshop resources."
        case .exif:  return "Camera, lens, date, GPS location and the software that saved the file."
        case .other: return "Text comments (e.g. AI prompts inside PNGs), embedded previews and vendor blocks."
        case .icc:   return "Normally keep this. Removing it can make colors look different in some apps."
        }
    }

    /// Everything except the color profile is removed by default.
    static var defaultRemoval: Set<MetaCategory> { Set(allCases.filter { $0 != .icc }) }
}

enum ImageKind: String {
    case jpeg = "JPEG", png = "PNG", webp = "WebP", gif = "GIF", other = "Other"
}

enum Severity: Int, Comparable {
    case info = 0, medium, high
    static func < (a: Severity, b: Severity) -> Bool { a.rawValue < b.rawValue }
}

struct Indicator: Identifiable {
    let id = UUID()
    var severity: Severity
    var title: String
    var detail: String
    var source: String
}

/// One contiguous block of the file (a JPEG segment, PNG chunk or WebP chunk).
struct Piece: Identifiable {
    let id = UUID()
    var range: Range<Int>
    var label: String
    /// `nil` means structural / pixel data that is always kept.
    var category: MetaCategory?
    var size: Int { range.count }
}

enum EngineError: LocalizedError {
    case unreadable
    case corrupt(String)
    case unsupported(String)
    case encodeFailed

    var errorDescription: String? {
        switch self {
        case .unreadable:            return "The file could not be opened as an image."
        case .corrupt(let why):      return "The image file looks damaged (\(why))."
        case .unsupported(let why):  return why
        case .encodeFailed:          return "Could not write the cleaned image."
        }
    }
}

// MARK: - Byte helpers

enum Bytes {
    static func has(_ b: [UInt8], _ at: Int, _ s: String) -> Bool {
        let u = Array(s.utf8)
        guard at >= 0, at + u.count <= b.count else { return false }
        for k in 0..<u.count where b[at + k] != u[k] { return false }
        return true
    }

    static func be32(_ b: [UInt8], _ i: Int) -> Int {
        (Int(b[i]) << 24) | (Int(b[i + 1]) << 16) | (Int(b[i + 2]) << 8) | Int(b[i + 3])
    }

    static func le32(_ b: [UInt8], _ i: Int) -> Int {
        (Int(b[i + 3]) << 24) | (Int(b[i + 2]) << 16) | (Int(b[i + 1]) << 8) | Int(b[i])
    }

    static func fourCC(_ b: [UInt8], _ i: Int) -> String {
        String(decoding: b[i..<i + 4], as: UTF8.self)
    }

    /// Decode bytes one-to-one into characters so ASCII text inside binary blobs can be searched.
    static func latin1(_ s: ArraySlice<UInt8>) -> String {
        var scalars = String.UnicodeScalarView()
        scalars.reserveCapacity(s.count)
        for byte in s { scalars.append(UnicodeScalar(byte)) }
        return String(scalars)
    }

    static func find(_ hay: ArraySlice<UInt8>, _ needle: String) -> Int? {
        let n = Array(needle.utf8)
        guard !n.isEmpty, hay.count >= n.count else { return nil }
        let last = hay.endIndex - n.count
        var i = hay.startIndex
        while i <= last {
            if hay[i] == n[0] {
                var ok = true
                var k = 1
                while k < n.count {
                    if hay[i + k] != n[k] { ok = false; break }
                    k += 1
                }
                if ok { return i }
            }
            i += 1
        }
        return nil
    }
}

// MARK: - Format detection

enum Engine {
    static func detect(_ b: [UInt8]) -> ImageKind {
        if b.count > 3, b[0] == 0xFF, b[1] == 0xD8, b[2] == 0xFF { return .jpeg }
        if b.count > 8, Array(b[0..<8]) == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] { return .png }
        if b.count > 12, Bytes.has(b, 0, "RIFF"), Bytes.has(b, 8, "WEBP") { return .webp }
        if b.count > 6, Bytes.has(b, 0, "GIF8") { return .gif }
        return .other
    }

    static func parse(_ b: [UInt8], kind: ImageKind) throws -> [Piece] {
        switch kind {
        case .jpeg: return try parseJPEG(b)
        case .png:  return try parsePNG(b)
        case .webp: return try parseWebP(b)
        default:    return []
        }
    }

    // MARK: JPEG

    static func parseJPEG(_ b: [UInt8]) throws -> [Piece] {
        let n = b.count
        var pieces = [Piece(range: 0..<2, label: "Start of image", category: nil)]
        var i = 2
        while i < n {
            guard b[i] == 0xFF else { throw EngineError.corrupt("unexpected data at byte \(i)") }
            guard i + 1 < n else { break }
            let m = b[i + 1]

            if m == 0xFF { i += 1; continue }               // fill byte

            if m == 0xD9 {                                   // end of image
                pieces.append(Piece(range: i..<i + 2, label: "End of image", category: nil))
                i += 2
                if i < n {
                    pieces.append(Piece(range: i..<n, label: "Extra data after image", category: .other))
                }
                return pieces
            }

            if m == 0x00 || m == 0x01 || (0xD0...0xD8).contains(m) {   // markers without a length
                pieces.append(Piece(range: i..<i + 2, label: "Marker", category: nil))
                i += 2
                continue
            }

            guard i + 3 < n else { throw EngineError.corrupt("truncated segment") }
            let len = (Int(b[i + 2]) << 8) | Int(b[i + 3])
            let end = i + 2 + len
            guard len >= 2, end <= n else { throw EngineError.corrupt("truncated segment") }

            if m == 0xDA {                                   // start of scan: header + entropy-coded data
                pieces.append(Piece(range: i..<end, label: "Scan header", category: nil))
                var k = end
                while k < n {
                    if b[k] == 0xFF, k + 1 < n {
                        let nx = b[k + 1]
                        if nx == 0x00 || (0xD0...0xD7).contains(nx) { k += 2; continue }
                        if nx == 0xFF { k += 1; continue }
                        break
                    }
                    k += 1
                }
                pieces.append(Piece(range: end..<k, label: "Image data", category: nil))
                i = k
                continue
            }

            let (label, category) = classifyJPEG(marker: m, b: b, payload: i + 4)
            pieces.append(Piece(range: i..<end, label: label, category: category))
            i = end
        }
        return pieces
    }

    private static func classifyJPEG(marker m: UInt8, b: [UInt8], payload p: Int) -> (String, MetaCategory?) {
        switch m {
        case 0xE0:
            if Bytes.has(b, p, "JFIF\0") || Bytes.has(b, p, "JFXX\0") { return ("JFIF header", nil) }
            return ("APP0 · other", .other)
        case 0xE1:
            if Bytes.has(b, p, "Exif\0\0") { return ("APP1 · EXIF", .exif) }
            if Bytes.has(b, p, "http://ns.adobe.com/xap/1.0/\0") { return ("APP1 · XMP", .xmp) }
            if Bytes.has(b, p, "http://ns.adobe.com/xmp/extension/\0") { return ("APP1 · XMP (extended)", .xmp) }
            return ("APP1 · other", .other)
        case 0xE2:
            if Bytes.has(b, p, "ICC_PROFILE\0") { return ("APP2 · ICC color profile", .icc) }
            if Bytes.has(b, p, "MPF\0") { return ("APP2 · multi-picture data", .other) }
            return ("APP2 · other", .other)
        case 0xEB:
            return ("APP11 · JUMBF (C2PA / Content Credentials)", .c2pa)
        case 0xED:
            if Bytes.has(b, p, "Photoshop 3.0\0") { return ("APP13 · Photoshop / IPTC", .iptc) }
            return ("APP13 · other", .other)
        case 0xEE:
            if Bytes.has(b, p, "Adobe") { return ("APP14 · Adobe color info", nil) }
            return ("APP14 · other", .other)
        case 0xFE:
            return ("Comment", .other)
        case 0xE3...0xEF:
            return ("APP\(Int(m) - 0xE0) · other", .other)
        default:
            return ("Image structure", nil)
        }
    }

    // MARK: PNG

    static func parsePNG(_ b: [UInt8]) throws -> [Piece] {
        let n = b.count
        var pieces = [Piece(range: 0..<8, label: "PNG signature", category: nil)]
        var i = 8
        while i + 12 <= n {
            let len = Bytes.be32(b, i)
            let type = Bytes.fourCC(b, i + 4)
            let end = i + 12 + len
            guard end <= n else { throw EngineError.corrupt("truncated \(type) chunk") }
            let (label, category) = classifyPNG(type: type, b: b, dataStart: i + 8, dataEnd: i + 8 + len)
            pieces.append(Piece(range: i..<end, label: label, category: category))
            i = end
            if type == "IEND" { break }
        }
        if i < n { pieces.append(Piece(range: i..<n, label: "Extra data after image", category: .other)) }
        return pieces
    }

    private static func classifyPNG(type: String, b: [UInt8], dataStart: Int, dataEnd: Int) -> (String, MetaCategory?) {
        switch type {
        case "IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "sBIT", "bKGD", "hIST",
             "pHYs", "sPLT", "acTL", "fcTL", "fdAT", "cICP", "mDCV", "cLLI", "oFFs", "sTER":
            return ("PNG chunk \(type)", nil)
        case "iCCP": return ("iCCP · ICC color profile", .icc)
        case "eXIf": return ("eXIf · EXIF", .exif)
        case "tIME": return ("tIME · modification time", .exif)
        case "caBX": return ("caBX · C2PA manifest", .c2pa)
        case "iTXt", "tEXt", "zTXt":
            var k = dataStart
            while k < dataEnd, k - dataStart < 80, b[k] != 0 { k += 1 }
            let keyword = String(decoding: b[dataStart..<k], as: UTF8.self)
            let lower = keyword.lowercased()
            if keyword == "XML:com.adobe.xmp" { return ("iTXt · XMP", .xmp) }
            if lower.contains("exif") { return ("\(type) · EXIF (\(keyword))", .exif) }
            if lower.contains("iptc") { return ("\(type) · IPTC (\(keyword))", .iptc) }
            if lower.contains("xmp")  { return ("\(type) · XMP (\(keyword))", .xmp) }
            return ("\(type) · text “\(keyword)”", .other)
        default:
            if let f = type.first, f.isLowercase { return ("\(type) · other", .other) }
            return ("PNG chunk \(type)", nil)
        }
    }

    // MARK: WebP

    static func parseWebP(_ b: [UInt8]) throws -> [Piece] {
        let n = b.count
        var pieces = [Piece(range: 0..<12, label: "RIFF header", category: nil)]
        var i = 12
        while i + 8 <= n {
            let type = Bytes.fourCC(b, i)
            let size = Bytes.le32(b, i + 4)
            guard i + 8 + size <= n else { throw EngineError.corrupt("truncated \(type) chunk") }
            var end = i + 8 + size
            if size % 2 == 1, end < n { end += 1 }
            let (label, category): (String, MetaCategory?)
            switch type {
            case "VP8X", "VP8 ", "VP8L", "ALPH", "ANIM", "ANMF": (label, category) = ("WebP chunk \(type)", nil)
            case "ICCP": (label, category) = ("ICCP · ICC color profile", .icc)
            case "EXIF": (label, category) = ("EXIF", .exif)
            case "XMP ": (label, category) = ("XMP", .xmp)
            case "C2PA": (label, category) = ("C2PA manifest", .c2pa)
            default:     (label, category) = ("\(type) · other", .other)
            }
            pieces.append(Piece(range: i..<end, label: label, category: category))
            i = end
        }
        return pieces
    }

    // MARK: Stripping

    /// Rebuilds the file without the categories in `remove`. Pixel data is copied byte-for-byte.
    /// Returns the new bytes plus the EXIF orientation that was preserved (JPEG only).
    static func strip(_ b: [UInt8], kind: ImageKind, pieces: [Piece], remove: Set<MetaCategory>) -> (bytes: [UInt8], keptOrientation: Int?) {
        var out = [UInt8]()
        out.reserveCapacity(b.count)
        var keptOrientation: Int?
        var orientationSegment: [UInt8] = []

        if kind == .jpeg, remove.contains(.exif),
           let ex = pieces.first(where: { $0.category == .exif }), ex.range.count > 12 {
            let tiff = Array(b[(ex.range.lowerBound + 10)..<ex.range.upperBound])
            if let o = exifOrientation(tiff), (2...8).contains(o) {
                keptOrientation = o
                orientationSegment = makeOrientationSegment(o)
            }
        }

        for (index, p) in pieces.enumerated() {
            if let c = p.category, remove.contains(c) { continue }
            out.append(contentsOf: b[p.range])
            // Put the tiny orientation-only EXIF block right after SOI / JFIF.
            let isInsertionPoint = (index == 0 && !(pieces.count > 1 && pieces[1].label == "JFIF header")) || p.label == "JFIF header"
            if !orientationSegment.isEmpty, isInsertionPoint {
                out.append(contentsOf: orientationSegment)
                orientationSegment = []
            }
        }

        if kind == .webp, out.count >= 30 {
            let total = out.count - 8
            out[4] = UInt8(total & 0xFF); out[5] = UInt8((total >> 8) & 0xFF)
            out[6] = UInt8((total >> 16) & 0xFF); out[7] = UInt8((total >> 24) & 0xFF)
            if Bytes.has(out, 12, "VP8X") {
                var flags = out[20]
                flags &= ~(0x20 | 0x08 | 0x04)
                if pieces.contains(where: { $0.category == .icc }) && !remove.contains(.icc) { flags |= 0x20 }
                if pieces.contains(where: { $0.category == .exif }) && !remove.contains(.exif) { flags |= 0x08 }
                if pieces.contains(where: { $0.category == .xmp }) && !remove.contains(.xmp) { flags |= 0x04 }
                out[20] = flags
            }
        }
        return (out, keptOrientation)
    }

    static func exifOrientation(_ t: [UInt8]) -> Int? {
        guard t.count >= 8 else { return nil }
        let little: Bool
        if t[0] == 0x49, t[1] == 0x49 { little = true } else if t[0] == 0x4D, t[1] == 0x4D { little = false } else { return nil }
        func u16(_ o: Int) -> Int? {
            guard o >= 0, o + 2 <= t.count else { return nil }
            return little ? Int(t[o]) | (Int(t[o + 1]) << 8) : (Int(t[o]) << 8) | Int(t[o + 1])
        }
        func u32(_ o: Int) -> Int? {
            guard let a = u16(o), let b = u16(o + 2) else { return nil }
            return little ? a | (b << 16) : (a << 16) | b
        }
        guard let ifd = u32(4), let count = u16(ifd), count < 500 else { return nil }
        for e in 0..<count {
            let o = ifd + 2 + e * 12
            if u16(o) == 0x0112 { return u16(o + 8) }
        }
        return nil
    }

    static func makeOrientationSegment(_ o: Int) -> [UInt8] {
        [0xFF, 0xE1, 0x00, 0x22,
         0x45, 0x78, 0x69, 0x66, 0x00, 0x00,                       // "Exif\0\0"
         0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08,           // big-endian TIFF header
         0x00, 0x01,                                               // one IFD entry
         0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01,           // tag 0x0112, SHORT, count 1
         0x00, UInt8(o), 0x00, 0x00,                               // value
         0x00, 0x00, 0x00, 0x00]                                   // no next IFD
    }
}

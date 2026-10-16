import Foundation
import ImageIO

struct BatchResult: Identifiable {
    let id = UUID()
    var inputName: String
    var output: URL?
    var error: String?
    var beforeBytes = 0
    var afterBytes = 0
    var width = 0
    var height = 0
    var verified = false
    var formatName = ""
    var metadataClean: Bool?
    var notes: [String] = []

    var succeeded: Bool { output != nil && error == nil }
}

struct BatchState {
    var tool: Tool
    var total: Int
    var folder: URL
    var current = ""
    var results: [BatchResult] = []
    var finished = false
    var cancelled = false

    var done: Int { results.count }
    var failures: [BatchResult] { results.filter { !$0.succeeded } }
    var savedBytes: Int { results.filter(\.succeeded).reduce(0) { $0 + $1.beforeBytes - $1.afterBytes } }
}

/// Writes processed images to disk without ever touching the originals.
enum ImageExportService {

    /// `photo.png` + suffix `_resized` + format JPEG → `photo_resized.jpg`; an existing file is never replaced.
    static func outputURL(for input: URL, suffix: String, format: OutputFormat, in folder: URL) -> URL {
        let base = input.deletingPathExtension().lastPathComponent + suffix
        let candidate = folder.appendingPathComponent(base).appendingPathExtension(format.fileExtension)
        return ImageCleaner.uniqueURL(candidate)
    }

    static func sanitizedSuffix(_ s: String) -> String {
        let illegal = CharacterSet(charactersIn: "/:\\\0")
        return s.components(separatedBy: illegal).joined()
    }

    /// Runs `operation` for one input and saves the result into `folder`, then reads it back to verify.
    static func export(input: URL, folder: URL, suffix: String,
                       operation: (URL) throws -> ProcessedImage) -> BatchResult {
        var result = BatchResult(inputName: input.lastPathComponent)
        result.beforeBytes = (try? input.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        do {
            let processed = try autoreleasepool { try operation(input) }
            let out = outputURL(for: input, suffix: sanitizedSuffix(suffix), format: processed.format, in: folder)
            do { try processed.data.write(to: out, options: .atomic) }
            catch { throw ImageToolError.writeFailed(error.localizedDescription) }
            result.output = out
            result.afterBytes = processed.data.count
            result.width = processed.width
            result.height = processed.height
            result.notes = processed.notes
            result.verified = ImageCodec.verify(url: out, width: processed.width, height: processed.height)
            if !result.verified {
                try? FileManager.default.removeItem(at: out)
                result.output = nil
                throw ImageToolError.verifyFailed
            }
            result.formatName = OutputFormat(url: out)?.displayName ?? out.pathExtension.uppercased()
            if processed.expectMetadataClean != nil {
                let props = try ImageCodec.info(url: out).properties
                let privateKeys = [kCGImagePropertyExifDictionary, kCGImagePropertyExifAuxDictionary,
                                   kCGImagePropertyGPSDictionary, kCGImagePropertyIPTCDictionary,
                                   kCGImagePropertyTIFFDictionary].map { $0 as String }
                let hasPrivateMetadata = privateKeys.contains { key in
                    guard let dictionary = props[key] as? [String: Any] else { return false }
                    // Encoders may write structural TIFF size/orientation fields. Count meaningful values only.
                    return dictionary.keys.contains { !["PixelWidth", "PixelHeight", "Orientation"].contains($0) }
                }
                result.metadataClean = !hasPrivateMetadata
                if processed.expectMetadataClean == true, hasPrivateMetadata {
                    result.notes.append(t("verify.metadata.remaining"))
                }
            }
        } catch {
            result.error = error.localizedDescription
        }
        return result
    }
}

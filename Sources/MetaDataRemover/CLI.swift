import Foundation

/// Hidden command-line mode, handy for testing:
///   MetaDataRemover --cli analyze <image>
///   MetaDataRemover --cli clean <image> [output-folder]
///   MetaDataRemover --cli removebg <image> [output-folder] [edge-smoothing]
///   MetaDataRemover --cli selftest
enum CLI {
    static func run(_ args: [String]) {
        if args.first == "selftest" { exit(SelfTest.run()) }
        guard args.count >= 2 else {
            print("usage: --cli analyze <image> | --cli clean <image> [output-folder]")
            return
        }
        let url = URL(fileURLWithPath: args[1])
        do {
            switch args[0] {
            case "analyze":
                let a = try Analyzer.analyze(url: url)
                print("\(a.kind.rawValue)  \(a.width)×\(a.height)  \(byteString(a.fileSize))")
                print("\nAI indicators:")
                if a.indicators.isEmpty { print("  (none)") }
                for i in a.indicators { print("  [\(i.severity)] \(i.title) — \(i.source)") }
                print("\nEmbedded blocks:")
                for p in a.pieces where p.category != nil { print("  \(p.label)  \(byteString(p.size))  [\(p.category!.rawValue)]") }
                print("\nMetadata groups:")
                for g in a.groups { print("  \(g.title) (\(g.items.count) items)") }
            case "clean":
                let a = try Analyzer.analyze(url: url)
                let dir = args.count > 2 ? URL(fileURLWithPath: args[2]) : url.deletingLastPathComponent()
                let out = dir.appendingPathComponent(ImageCleaner.suggestedFilename(for: url, kind: a.kind, hasAlpha: a.hasAlpha))
                let r = try ImageCleaner.clean(input: url, output: out, avoidOverwrite: true, remove: MetaCategory.defaultRemoval)
                print("wrote \(r.output.path)")
                print("size \(byteString(r.beforeBytes)) → \(byteString(r.afterBytes)), decodes: \(r.decodes), re-encoded: \(r.reencoded)")
                print("removed: \(r.removed.map { "\($0.category.rawValue) \(byteString($0.bytes))" }.joined(separator: ", "))")
                print("kept orientation: \(r.keptOrientation.map(String.init) ?? "-")")
                print("remaining AI indicators: \(r.remainingIndicators.count)")
                print("remaining blocks: \(r.remainingBlocks.map(\.label))")
            case "removebg":
                // removebg <image> [output-folder] [edge-smoothing 0...1]
                var settings = BackgroundRemovalSettings()
                if args.count > 3, let v = Double(args[3]) { settings.edgeSmoothing = v }
                let dir = args.count > 2 ? URL(fileURLWithPath: args[2]) : url.deletingLastPathComponent()
                let r = ImageExportService.export(input: url, folder: dir, suffix: settings.suffix) {
                    try BackgroundRemovalService.process(url: $0, settings: settings)
                }
                if let out = r.output {
                    print("wrote \(out.path)")
                    print("\(r.width)×\(r.height) \(r.formatName)  \(byteString(r.beforeBytes)) → \(byteString(r.afterBytes)), verified: \(r.verified)")
                } else { print("error: \(r.error ?? "unknown")") }
            case "fuzz":
                // Mutates the file in memory many times and makes sure parsing/stripping never traps.
                let original = [UInt8](try Data(contentsOf: url))
                let rounds = args.count > 2 ? Int(args[2]) ?? 2000 : 2000
                var rng = SystemRandomNumberGenerator()
                var parsed = 0, rejected = 0
                for round in 0..<rounds {
                    var b = original
                    switch round % 4 {
                    case 0: b = Array(b.prefix(Int.random(in: 0...b.count, using: &rng)))          // truncate
                    case 1: for _ in 0..<Int.random(in: 1...8, using: &rng) { b[Int.random(in: 0..<b.count, using: &rng)] = UInt8.random(in: 0...255, using: &rng) }
                    case 2: let i = Int.random(in: 0..<b.count, using: &rng); b.insert(contentsOf: (0..<Int.random(in: 1...40, using: &rng)).map { _ in UInt8.random(in: 0...255, using: &rng) }, at: i)
                    default: let i = Int.random(in: 0..<b.count, using: &rng); b.removeSubrange(i..<min(b.count, i + Int.random(in: 1...60, using: &rng)))
                    }
                    let kind = Engine.detect(b)
                    if let pieces = try? Engine.parse(b, kind: kind) {
                        parsed += 1
                        _ = Engine.strip(b, kind: kind, pieces: pieces, remove: MetaCategory.defaultRemoval)
                        _ = Engine.strip(b, kind: kind, pieces: pieces, remove: Set(MetaCategory.allCases))
                        for p in pieces where p.category != nil { _ = Analyzer.scan(text: Bytes.latin1(b[p.range]), source: p.label) }
                    } else { rejected += 1 }
                }
                print("fuzz ok: \(rounds) mutations, \(parsed) parsed, \(rejected) cleanly rejected, no crashes")
            default:
                print("unknown command \(args[0])")
            }
        } catch {
            print("error: \(error.localizedDescription)")
        }
    }
}

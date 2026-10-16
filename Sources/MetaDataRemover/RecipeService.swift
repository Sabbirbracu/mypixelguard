import SwiftUI
import CoreGraphics

struct ImageRecipe: Identifiable, Codable, Equatable, Hashable {
    var id = UUID()
    var name: String
    var formatRaw: String? = nil
    var width: Int? = nil
    var height: Int? = nil
    var targetKB: Int? = nil
    var quality: Double = 0.82
    var cleanMetadata = true
    var suffix = "_ready"
    var isBuiltIn = false

    var format: OutputFormat? {
        get { formatRaw.flatMap(OutputFormat.init(rawValue:)) }
        set { formatRaw = newValue?.rawValue }
    }

    static let builtIn: [ImageRecipe] = [
        ImageRecipe(id: UUID(uuidString: "10000000-0000-0000-0000-000000000001")!, name: "Website Optimized", formatRaw: OutputFormat.webp.isAvailable ? "webp" : "jpeg", width: 1920, height: 1920, targetKB: 500, quality: 0.82, cleanMetadata: true, suffix: "_web", isBuiltIn: true),
        ImageRecipe(id: UUID(uuidString: "10000000-0000-0000-0000-000000000002")!, name: "Private Share", formatRaw: nil, width: nil, height: nil, targetKB: nil, quality: 0.92, cleanMetadata: true, suffix: "_private", isBuiltIn: true),
        ImageRecipe(id: UUID(uuidString: "10000000-0000-0000-0000-000000000003")!, name: "Marketplace Ready", formatRaw: "jpeg", width: 1600, height: 1600, targetKB: 500, quality: 0.86, cleanMetadata: true, suffix: "_market", isBuiltIn: true),
        ImageRecipe(id: UUID(uuidString: "10000000-0000-0000-0000-000000000004")!, name: "Social Media", formatRaw: "jpeg", width: 1080, height: 1350, targetKB: 500, quality: 0.88, cleanMetadata: true, suffix: "_social", isBuiltIn: true),
    ]
}

enum RecipeStore {
    private static let key = "customImageRecipes.v1"
    static func load() -> [ImageRecipe] {
        guard let data = UserDefaults.standard.data(forKey: key),
              let value = try? JSONDecoder().decode([ImageRecipe].self, from: data) else { return [] }
        return value
    }
    static func save(_ recipes: [ImageRecipe]) {
        UserDefaults.standard.set(try? JSONEncoder().encode(recipes), forKey: key)
    }
}

enum RecipeService {
    static func process(url: URL, recipe: ImageRecipe) throws -> ProcessedImage {
        let info = try ImageCodec.info(url: url)
        let source = try ImageCodec.loadImage(url: url)
        var image = source
        var notes: [String] = []

        if let width = recipe.width, let height = recipe.height {
            var resize = ResizeSettings()
            resize.width = max(width, 1)
            resize.height = max(height, 1)
            resize.lockAspect = false
            resize.fit = .fit
            resize.neverEnlarge = true
            let plan = ImageResizeService.plan(original: (source.width, source.height), settings: resize)
            if !plan.unchanged,
               let rendered = ImageCodec.render(source, width: plan.canvasWidth, height: plan.canvasHeight,
                                                drawRect: plan.drawRect) {
                image = rendered
                notes.append(t("studio.note.resized", image.width, image.height))
            }
        }

        var format = recipe.format ?? ImageCodec.sameFormat(as: info)
        if !format.isAvailable { format = ImageCodec.sameFormat(as: info) }
        let target = recipe.targetKB.map { max($0, 1) * 1000 }
        let outcome = try ImageCompressionService.encode(image, format: format, quality: recipe.quality,
                                                         targetBytes: target,
                                                         background: CGColor(gray: 1, alpha: 1),
                                                         keep: recipe.cleanMetadata ? nil : info.properties)
        if recipe.cleanMetadata { notes.append(t("studio.note.metadata")) }
        if target != nil, !outcome.reachedTarget { notes.append(t("note.targetMissed", byteString(outcome.data.count))) }
        return ProcessedImage(data: outcome.data, format: format, width: image.width, height: image.height, notes: notes,
                              expectMetadataClean: recipe.cleanMetadata)
    }
}

import SwiftUI
import ImageIO
import UniformTypeIdentifiers

enum FileStatus {
    case scanning
    case ready
    case cleaned(CleanReport)
    case failed(String)
}

enum Tool: String, CaseIterable, Identifiable {
    case inspect, clean, redact, convert, resize, compress, background, studio, enhance
    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .inspect:  return "magnifyingglass"
        case .clean:    return "eraser"
        case .redact:   return "eye.slash"
        case .convert:  return "arrow.triangle.2.circlepath"
        case .resize:   return "crop"
        case .compress: return "rectangle.compress.vertical"
        case .background: return "scissors"
        case .studio:   return "square.stack.3d.up"
        case .enhance:  return "wand.and.stars"
        }
    }
    var title: String { t("tool.\(rawValue)") }
}

struct FileItem: Identifiable {
    let id = UUID()
    let url: URL
    var thumb: NSImage?
    var analysis: Analysis?
    /// What ImageIO can tell about the file; present for anything the converter/resizer/compressor can read.
    var info: SourceInfo?
    var analysisError: String?
    var status: FileStatus = .scanning
}

extension Analysis {
    /// True when the file carries a signed provenance manifest (C2PA / Content Credentials).
    var hasProvenance: Bool {
        bytes(in: .c2pa) > 0 || indicators.contains { $0.title.hasPrefix("C2PA") }
    }
}

enum Dialogs {
    /// Modal yes/no question. Returns true when the user picks the confirm button.
    @MainActor
    static func confirm(title: String, message: String, confirmTitle: String) -> Bool {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = title
        alert.informativeText = message
        alert.addButton(withTitle: confirmTitle)
        alert.addButton(withTitle: t("common.cancel"))
        return alert.runModal() == .alertFirstButtonReturn
    }

    @MainActor
    static func askText(title: String, message: String, placeholder: String) -> String? {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
        field.placeholderString = placeholder
        alert.accessoryView = field
        alert.addButton(withTitle: t("common.save"))
        alert.addButton(withTitle: t("common.cancel"))
        alert.window.initialFirstResponder = field
        guard alert.runModal() == .alertFirstButtonReturn else { return nil }
        let value = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}

enum Thumbnails {
    static func make(_ url: URL, maxPixel: Int) -> NSImage? {
        guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, options as CFDictionary) else { return nil }
        return NSImage(cgImage: cg, size: NSSize(width: cg.width, height: cg.height))
    }
}

@MainActor
final class AppModel: ObservableObject {
    static let shared = AppModel()

    @Published var files: [FileItem] = []
    @Published var selection: UUID?
    @Published var remove: Set<MetaCategory> = MetaCategory.defaultRemoval
    @Published var isCleaning = false
    @Published var tool: Tool = Tool(rawValue: UserDefaults.standard.string(forKey: "lastTool") ?? "") ?? .clean {
        didSet { UserDefaults.standard.set(tool.rawValue, forKey: "lastTool") }
    }

    // Per-tool settings
    @Published var convert = ConvertSettings()
    @Published var resize = ResizeSettings()
    @Published var compress = CompressSettings()
    @Published var redact = RedactionSettings()
    @Published var aiTools = AIImageSettings()
    @Published var background = BackgroundRemovalSettings()
    @Published var selectiveFields: Set<PrivateMetadataField> = [.location]
    /// Private details the Clean tab removes on top of whole blocks (see `PrivateMetadataField.isCovered`).
    @Published var cleanFields: Set<PrivateMetadataField> = CleanDefaults.fields
    /// Folder the Clean tab saves into. The path is remembered; access is only granted once picked in this session.
    @Published var saveFolder: URL? = UserDefaults.standard.string(forKey: "lastSaveDirectory").map { URL(fileURLWithPath: $0) }
    private var saveFolderGranted = ProcessInfo.processInfo.environment["APP_SANDBOX_CONTAINER_ID"] == nil
    @Published var selectedRecipe = ImageRecipe.builtIn[0]
    @Published var customRecipes: [ImageRecipe] = RecipeStore.load() {
        didSet { RecipeStore.save(customRecipes) }
    }
    @Published var customPresets: [SizePreset] = PresetStore.loadCustom() {
        didSet { PresetStore.saveCustom(customPresets) }
    }
    /// Run Convert / Resize / Compress on every image in the list, not only the selected one.
    @Published var applyToAll = true
    @Published var batch: BatchState?

    private var batchTask: Task<Void, Never>?
    private var cleanTask: Task<Void, Never>?

    var selected: FileItem? { files.first { $0.id == selection } }

    // MARK: Adding files

    func add(urls: [URL]) {
        var found: [URL] = []
        for url in urls {
            var isDir: ObjCBool = false
            if FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir), isDir.boolValue {
                let e = FileManager.default.enumerator(at: url, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])
                while let f = e?.nextObject() as? URL {
                    if Self.isImage(f) { found.append(f) }
                }
            } else if Self.isImage(url) {
                found.append(url)
            }
        }
        for url in found where !files.contains(where: { $0.url == url }) {
            let item = FileItem(url: url)
            files.append(item)
            if selection == nil { selection = item.id }
            let id = item.id
            Task.detached(priority: .userInitiated) {
                let thumb = Thumbnails.make(url, maxPixel: 480)
                let info = try? ImageCodec.info(url: url)
                do {
                    let analysis = try Analyzer.analyze(url: url)
                    await MainActor.run { self.update(id) { $0.thumb = thumb; $0.analysis = analysis; $0.info = info; $0.status = .ready } }
                } catch {
                    let message = error.localizedDescription
                    await MainActor.run {
                        self.update(id) {
                            $0.thumb = thumb; $0.info = info
                            if info != nil { $0.analysisError = message; $0.status = .ready } else { $0.status = .failed(message) }
                        }
                    }
                }
            }
        }
    }

    private static func isImage(_ url: URL) -> Bool {
        guard let t = UTType(filenameExtension: url.pathExtension) else { return false }
        return t.conforms(to: .image)
    }

    func update(_ id: UUID, _ change: (inout FileItem) -> Void) {
        guard let i = files.firstIndex(where: { $0.id == id }) else { return }
        change(&files[i])
    }

    func removeFile(_ id: UUID) {
        files.removeAll { $0.id == id }
        if selection == id { selection = files.first?.id }
    }

    func clearAll() {
        files.removeAll()
        selection = nil
    }

    func handleDrop(_ providers: [NSItemProvider]) -> Bool {
        var accepted = false
        for p in providers where p.canLoadObject(ofClass: URL.self) {
            accepted = true
            _ = p.loadObject(ofClass: URL.self) { url, _ in
                guard let url else { return }
                Task { @MainActor in self.add(urls: [url]) }
            }
        }
        return accepted
    }

    // MARK: Panels

    func chooseImages() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.image]
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = true
        panel.message = t("panel.chooseImages")
        if panel.runModal() == .OK { add(urls: panel.urls) }
    }

    // MARK: Cleaning (always asks where to save)

    private var lastDirectory: URL? {
        get { UserDefaults.standard.string(forKey: "lastSaveDirectory").map { URL(fileURLWithPath: $0) } }
        set { UserDefaults.standard.set(newValue?.path, forKey: "lastSaveDirectory") }
    }

    /// Lets the user pick the Clean tab's destination folder.
    @discardableResult
    func chooseSaveFolder(fallback: URL? = nil) -> URL? {
        let panel = NSOpenPanel()
        panel.title = t("panel.chooseFolder.title")
        panel.prompt = t("panel.saveHere")
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.canCreateDirectories = true
        panel.directoryURL = saveFolder ?? fallback
        guard panel.runModal() == .OK, let folder = panel.url else { return nil }
        saveFolder = folder
        lastDirectory = folder
        saveFolderGranted = true
        return folder
    }

    private func resolveSaveFolder(fallback: URL) -> URL? {
        if let folder = saveFolder, saveFolderGranted { return folder }
        return chooseSaveFolder(fallback: fallback)
    }

    func cleanSelected() {
        if let id = selection { startCleaning(ids: [id]) }
    }

    func cleanAll() {
        startCleaning(ids: files.filter { $0.analysis != nil }.map(\.id))
    }

    func cancelCleaning() { cleanTask?.cancel() }

    /// Removing Content Credentials is a deliberate act, so the user has to agree to it first.
    private func confirmProvenanceRemoval(_ items: [FileItem], removing: Set<MetaCategory>) -> Bool {
        guard removing.contains(.c2pa) else { return true }
        let affected = items.filter { $0.analysis?.hasProvenance == true }.count
        guard affected > 0 else { return true }
        return Dialogs.confirm(title: t("confirm.provenance.title", affected),
                               message: t("confirm.provenance.body"),
                               confirmTitle: t("confirm.provenance.button"))
    }

    private func startCleaning(ids: [UUID]) {
        guard !isCleaning else { return }
        let targets = ids.compactMap { id in files.first { $0.id == id && $0.analysis != nil } }
        guard !targets.isEmpty else { return }
        guard confirmProvenanceRemoval(targets, removing: remove) else { return }

        guard let folder = resolveSaveFolder(fallback: targets[0].url.deletingLastPathComponent()) else { return }

        // (id, input, output, avoidOverwrite)
        let plan: [(UUID, URL, URL, Bool)] = targets.compactMap { target in
            guard let a = target.analysis else { return nil }
            let name = ImageCleaner.suggestedFilename(for: target.url, kind: a.kind, hasAlpha: a.hasAlpha)
            return (target.id, target.url, folder.appendingPathComponent(name), true)
        }

        let remove = self.remove
        let fields = cleanFields
        isCleaning = true
        cleanTask = Task {
            for (id, input, output, avoid) in plan {
                if Task.isCancelled { break }
                let result = await Task.detached(priority: .userInitiated) {
                    Result<CleanReport, Error> { try ImageCleaner.clean(input: input, output: output, avoidOverwrite: avoid, remove: remove, fields: fields) }
                }.value
                switch result {
                case .success(let report): update(id) { $0.status = .cleaned(report) }
                case .failure(let error):  update(id) { $0.status = .failed(error.localizedDescription) }
                }
                AppServices.shared.recordSave(tool: .clean, succeeded: (try? result.get()) != nil)
            }
            isCleaning = false
        }
    }

    // MARK: Convert / Resize / Compress

    /// Images the current tool will work on.
    var toolTargets: [FileItem] {
        let readable = files.filter { $0.info != nil }
        if applyToAll { return readable }
        return readable.filter { $0.id == selection }
    }

    var isBatchRunning: Bool { batch.map { !$0.finished } ?? false }

    func cancelBatch() { batchTask?.cancel() }
    func dismissBatch() { if !isBatchRunning { batch = nil } }

    /// Asks where to save, then runs `operation` on every target one by one with progress and cancel.
    func runBatch(tool: Tool, suffix: String, targets explicitTargets: [FileItem]? = nil,
                  operation: @escaping @Sendable (URL) throws -> ProcessedImage) {
        guard !isBatchRunning else { return }
        let targets = explicitTargets ?? toolTargets
        guard !targets.isEmpty else { return }

        let affected = targets.filter { $0.analysis?.hasProvenance == true }.count
        if affected > 0 {
            guard Dialogs.confirm(title: t("confirm.reencode.title", affected),
                                  message: t("confirm.reencode.body"),
                                  confirmTitle: t("confirm.reencode.button")) else { return }
        }

        let panel = NSOpenPanel()
        panel.title = t("panel.chooseFolder.title")
        panel.message = t("panel.saveMany.message", targets.count)
        panel.prompt = t("panel.saveHere")
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.canCreateDirectories = true
        panel.directoryURL = lastDirectory ?? targets[0].url.deletingLastPathComponent()
        guard panel.runModal() == .OK, let folder = panel.url else { return }
        lastDirectory = folder

        let urls = targets.map(\.url)
        batch = BatchState(tool: tool, total: urls.count, folder: folder)
        batchTask = Task {
            for url in urls {
                if Task.isCancelled { break }
                batch?.current = url.lastPathComponent
                let result = await Task.detached(priority: .userInitiated) {
                    ImageExportService.export(input: url, folder: folder, suffix: suffix, operation: operation)
                }.value
                batch?.results.append(result)
                AppServices.shared.recordSave(tool: tool, succeeded: result.succeeded)
            }
            batch?.cancelled = Task.isCancelled
            batch?.current = ""
            batch?.finished = true
        }
    }

    func runConvert() {
        let s = convert
        runBatch(tool: .convert, suffix: s.suffix) { try ImageConversionService.process(url: $0, settings: s) }
    }

    func runResize() {
        let s = resize
        runBatch(tool: .resize, suffix: s.suffix) { try ImageResizeService.process(url: $0, settings: s) }
    }

    func runCompress() {
        let s = compress
        runBatch(tool: .compress, suffix: s.suffix) { try ImageCompressionService.process(url: $0, settings: s) }
    }

    func runBackgroundRemoval() {
        let s = background
        runBatch(tool: .background, suffix: s.suffix) { try BackgroundRemovalService.process(url: $0, settings: s) }
    }

    func runRedaction(regions: [SensitiveRegion]) {
        guard let selected, !regions.filter(\.isSelected).isEmpty else { return }
        let s = redact
        runBatch(tool: .redact, suffix: s.suffix, targets: [selected]) {
            try RedactionService.process(url: $0, regions: regions, settings: s)
        }
    }

    var allRecipes: [ImageRecipe] { ImageRecipe.builtIn + customRecipes }

    func runRecipe() {
        let recipe = selectedRecipe
        runBatch(tool: .studio, suffix: recipe.suffix) { try RecipeService.process(url: $0, recipe: recipe) }
    }

    func saveRecipe(_ recipe: ImageRecipe) {
        var saved = recipe
        saved.id = UUID(); saved.isBuiltIn = false
        customRecipes.append(saved)
        selectedRecipe = saved
    }

    func deleteSelectedRecipe() {
        guard !selectedRecipe.isBuiltIn else { return }
        customRecipes.removeAll { $0.id == selectedRecipe.id }
        selectedRecipe = ImageRecipe.builtIn[0]
    }

    func runAITools() {
        let s = aiTools
        runBatch(tool: .enhance, suffix: s.suffix) { try AIImageToolsService.process(url: $0, settings: s) }
    }

    /// Removes the chosen private fields. Defaults to the Selective cleaning checkboxes and the current scope;
    /// the details sheet passes one field and one image.
    func runSelectiveClean(fields override: Set<PrivateMetadataField>? = nil, targets: [FileItem]? = nil) {
        let fields = override ?? selectiveFields
        guard !fields.isEmpty else { return }
        runBatch(tool: .clean, suffix: "_private", targets: targets) {
            try SelectiveMetadataService.process(url: $0, removing: fields)
        }
    }

    // MARK: Size presets

    var allPresets: [SizePreset] { SizePreset.builtIn + customPresets }

    func savePreset(name: String, width: Int, height: Int) {
        customPresets.append(SizePreset(name: name, width: width, height: height))
    }

    func deletePreset(_ id: UUID) { customPresets.removeAll { $0.id == id } }

    // MARK: Export

    func plainText(for item: FileItem) -> String {
        guard let a = item.analysis else { return "" }
        var s = "\(item.url.lastPathComponent)\n\(a.kind.rawValue) · \(a.width)×\(a.height) · \(byteString(a.fileSize))\n"
        if !a.indicators.isEmpty {
            s += "\n" + t("export.indicators") + "\n"
            for i in a.indicators { s += "  - \(i.title) (\(i.source))\n" }
        }
        for g in a.groups {
            s += "\n[\(g.title)]\n"
            for i in g.items { s += "  \(i.key): \(i.value)\n" }
        }
        if let x = a.rawXMP { s += "\n[Raw XMP]\n\(x)\n" }
        return s
    }

    func copyMetadata(_ item: FileItem) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(plainText(for: item), forType: .string)
    }

    func saveMetadata(_ item: FileItem) {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.plainText]
        panel.nameFieldStringValue = item.url.deletingPathExtension().lastPathComponent + "_metadata.txt"
        if panel.runModal() == .OK, let url = panel.url {
            try? plainText(for: item).write(to: url, atomically: true, encoding: .utf8)
        }
    }
}

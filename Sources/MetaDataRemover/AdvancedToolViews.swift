import SwiftUI

struct StudioView: View {
    @EnvironmentObject var model: AppModel
    private var recipe: Binding<ImageRecipe> { $model.selectedRecipe }

    var body: some View {
        ToolScroll {
            ToolHeader(title: t("studio.title"), subtitle: t("studio.subtitle"))
            if let item = model.selected { SelectedImageCard(item: item) }
            ScopeRow()
            VStack(alignment: .leading, spacing: 16) {
                SettingRow(label: t("studio.recipe")) {
                    Picker("", selection: $model.selectedRecipe) {
                        ForEach(model.allRecipes) { Text($0.isBuiltIn ? t("recipe.\($0.name)") : $0.name).tag($0) }
                    }.labelsHidden().frame(maxWidth: 320)
                }
                Divider()
                SettingRow(label: t("setting.outputFormat")) {
                    Picker("", selection: recipe.formatRaw) {
                        Text(t("format.same")).tag(nil as String?)
                        ForEach(OutputFormat.available) { Text($0.displayName).tag(Optional($0.rawValue)) }
                    }.labelsHidden().frame(maxWidth: 240)
                }
                Toggle(t("studio.resize"), isOn: optionalToggle(recipe.width, defaultValue: 1600))
                if recipe.wrappedValue.width != nil {
                    SettingRow(label: t("setting.dimensions")) {
                        HStack { TextField(t("setting.width"), value: recipe.width, format: .number); Text("×"); TextField(t("setting.height"), value: recipe.height, format: .number) }.frame(maxWidth: 300)
                    }
                }
                Toggle(t("studio.target"), isOn: optionalToggle(recipe.targetKB, defaultValue: 500))
                if recipe.wrappedValue.targetKB != nil {
                    SettingRow(label: t("setting.targetSize")) { TextField("KB", value: recipe.targetKB, format: .number).frame(width: 110); Text("KB") }
                }
                QualityRow(quality: recipe.quality)
                Toggle(t("studio.cleanMetadata"), isOn: recipe.cleanMetadata)
                SettingRow(label: t("setting.suffix")) { SuffixField(suffix: recipe.suffix, example: "photo\(recipe.wrappedValue.suffix).jpg") }
                HStack {
                    Button(t("studio.saveRecipe")) { saveRecipe() }.buttonStyle(.brandSecondary)
                    if !recipe.wrappedValue.isBuiltIn { Button(t("studio.deleteRecipe")) { model.deleteSelectedRecipe() }.buttonStyle(.brandSecondary) }
                }
            }.card()
            NoticeCard(text: t("studio.workflow"), systemImage: "checklist.checked", color: Theme.success)
            ExportSection(tool: .studio, runTitle: runTitle("studio.run", count: model.toolTargets.count)) { model.runRecipe() }
        }
    }

    private func optionalToggle(_ value: Binding<Int?>, defaultValue: Int) -> Binding<Bool> {
        Binding(get: { value.wrappedValue != nil }, set: { value.wrappedValue = $0 ? (value.wrappedValue ?? defaultValue) : nil })
    }
    private func saveRecipe() {
        guard let name = Dialogs.askText(title: t("studio.saveRecipe"), message: t("studio.saveMessage"), placeholder: t("studio.name")) else { return }
        var value = recipe.wrappedValue; value.name = name; model.saveRecipe(value)
    }
}

struct AIImageToolsView: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        ToolScroll {
            ToolHeader(title: t("ai.title"), subtitle: t("ai.subtitle"))
            if let item = model.selected { SelectedImageCard(item: item) }
            ScopeRow()
            VStack(alignment: .leading, spacing: 16) {
                feature(t("ai.enhance"), t("ai.enhance.hint"), $model.aiTools.enhance, "wand.and.rays")
                feature(t("ai.upscale"), t("ai.upscale.hint"), $model.aiTools.upscale, "arrow.up.left.and.arrow.down.right")
                if model.aiTools.upscale {
                    SettingRow(label: t("ai.scale")) { Picker("", selection: $model.aiTools.upscaleFactor) { Text("2×").tag(2); Text("3×").tag(3); Text("4×").tag(4) }.labelsHidden().pickerStyle(.segmented).frame(width: 220) }
                }
                feature(t("ai.smartCrop"), t("ai.smartCrop.hint"), $model.aiTools.smartCrop, "viewfinder")
                if model.aiTools.smartCrop {
                    SettingRow(label: t("ai.aspect")) { Picker("", selection: $model.aiTools.cropAspect) { ForEach(CropAspect.allCases) { Text(t("ai.aspect.\($0.rawValue)")).tag($0) } }.labelsHidden().pickerStyle(.segmented).frame(maxWidth: 360) }
                }
                feature(t("ai.background"), t("ai.background.hint"), $model.aiTools.removeBackground, "person.crop.rectangle")
                if model.aiTools.removeBackground, #unavailable(macOS 14.0) { NoticeCard(text: t("ai.background.unavailable"), systemImage: "exclamationmark.triangle.fill", color: Theme.warning) }
                Divider()
                SettingRow(label: t("setting.outputFormat")) {
                    Picker("", selection: $model.aiTools.format) {
                        Text(t("format.same")).tag(nil as OutputFormat?)
                        ForEach(OutputFormat.available) { Text($0.displayName).tag(Optional($0)) }
                    }.labelsHidden().frame(maxWidth: 240)
                }
                QualityRow(quality: $model.aiTools.quality)
                Toggle(t("studio.cleanMetadata"), isOn: $model.aiTools.cleanMetadata)
                SettingRow(label: t("setting.suffix")) { SuffixField(suffix: $model.aiTools.suffix, example: "photo\(model.aiTools.suffix).png") }
            }.card()
            NoticeCard(text: t("ai.local"), systemImage: "laptopcomputer.and.lock", color: Theme.success)
            ExportSection(tool: .enhance, runTitle: runTitle("ai.run", count: model.toolTargets.count)) { model.runAITools() }
        }
    }

    private func feature(_ title: String, _ hint: String, _ value: Binding<Bool>, _ symbol: String) -> some View {
        Toggle(isOn: value) { Label { VStack(alignment: .leading) { Text(title).font(.callout.weight(.semibold)); Text(hint).font(.caption).foregroundStyle(Theme.secondary) } } icon: { Image(systemName: symbol).foregroundStyle(Theme.orange).frame(width: 24) } }.toggleStyle(.switch)
    }
}

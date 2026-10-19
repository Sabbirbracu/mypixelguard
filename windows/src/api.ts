import { invoke } from "@tauri-apps/api/core";
import type {
  Analysis, BackgroundSettings, Capabilities, CleanReport, CompressPreview, CompressSettings, ConvertSettings, FileScan,
  AiPreview, AiSettings, ImageKind, ImageRecipe, PrivateField, MetaCategory, RedactionSettings, ResizePlan, ResizeSettings, SensitiveRegion, VisualReport,
} from "./types";

export const api = {
  capabilities: () => invoke<Capabilities>("capabilities"),
  listImages: (paths: string[]) => invoke<string[]>("list_images", { paths }),
  scanFile: (path: string) => invoke<FileScan>("scan_file", { path }),
  suggestCleanName: (path: string, kind: ImageKind, hasAlpha: boolean) => invoke<string>("suggest_clean_name", { path, kind, hasAlpha }),
  cleanFile: (input: string, output: string, avoidOverwrite: boolean, remove: MetaCategory[], fields: PrivateField[]) =>
    invoke<CleanReport>("clean_file", { req: { input, output, avoidOverwrite, remove, fields } }),
  runBatch: (tool: string, settings: unknown, inputs: string[], folder: string, extra: unknown = {}) =>
    invoke<void>("run_batch", { req: { tool, settings, inputs, folder, extra } }),
  cancelBatch: () => invoke<void>("cancel_batch"),
  convertEstimate: (path: string, settings: ConvertSettings) => invoke<number | null>("convert_estimate", { path, settings }),
  compressPreview: (path: string, settings: CompressSettings) => invoke<CompressPreview>("compress_preview", { path, settings }),
  resizePlan: (original: [number, number], settings: ResizeSettings) => invoke<ResizePlan>("resize_plan", { original, settings }),
  previewImage: (path: string, maxPixel: number) => invoke<string>("preview_image", { path, maxPixel }),
  aiPreview: (path: string, settings: AiSettings) => invoke<AiPreview>("ai_preview", { path, settings }),
  backgroundPreview: (path: string, settings: BackgroundSettings) => invoke<string>("background_preview", { path, settings }),
  redactBase: (path: string) => invoke<{ image: string; width: number; height: number }>("redact_base", { path }),
  redactPreview: (path: string, regions: SensitiveRegion[], settings: RedactionSettings) => invoke<string>("redact_preview", { path, regions, settings }),
  redactScan: (path: string) => invoke<VisualReport>("redact_scan", { path }),
  builtInRecipes: () => invoke<ImageRecipe[]>("built_in_recipes"),
  writeTextFile: (path: string, text: string) => invoke<void>("write_text_file", { path, text }),
};

export type { Analysis };

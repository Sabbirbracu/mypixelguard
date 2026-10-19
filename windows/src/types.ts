// Mirrors the JSON produced by the Rust core (serde). Keep in sync with core/src.

export type Severity = "info" | "medium" | "high";
export type MetaCategory = "c2pa" | "xmp" | "iptc" | "exif" | "other" | "icc";
export const META_CATEGORIES: MetaCategory[] = ["c2pa", "xmp", "iptc", "exif", "other", "icc"];
export const DEFAULT_REMOVAL: MetaCategory[] = ["c2pa", "xmp", "iptc", "exif", "other"];
export type ImageKind = "JPEG" | "PNG" | "WebP" | "GIF" | "Other";
export type OutputFormat = "jpeg" | "png" | "tiff" | "webp";
export type PrivateField = "location" | "device" | "dates" | "author" | "software";
export const PRIVATE_FIELDS: PrivateField[] = ["location", "device", "dates", "author", "software"];

export interface CoreError { key: string; args: string[] }
export interface Note { key: string; args: string[] }

export interface Piece { start: number; end: number; label: string; category: MetaCategory | null }
export interface Indicator { severity: Severity; title: string; detail: string; source: string }
export interface MetaItem { key: string; value: string }
export interface MetaGroup { title: string; items: MetaItem[] }
export type PrivacyFactKind = "location" | "device" | "captured" | "author" | "software" | "orientation" | "dimensions";
export interface PrivacyFact { kind: PrivacyFactKind; value: string; value_key: string | null; severity: Severity; source: string }

export interface Analysis {
  kind: ImageKind;
  file_size: number;
  width: number;
  height: number;
  has_alpha: boolean;
  pieces: Piece[];
  indicators: Indicator[];
  privacy_facts: PrivacyFact[];
  groups: MetaGroup[];
  raw_xmp: string | null;
  has_provenance: boolean;
  ai_risk: Severity | null;
  privacy_risk: Severity | null;
  risk: Severity | null;
}

export interface SourceInfo {
  width: number;
  height: number;
  has_alpha: boolean;
  file_size: number;
  format: OutputFormat | null;
  is_animated: boolean;
}

export interface FileScan { thumb: string | null; info: SourceInfo | null; analysis: Analysis | null; analysisError: CoreError | null; created?: number | null; modified?: number | null }

export interface RemovedItem { category: MetaCategory; bytes: number }
export interface CleanReport {
  output: string;
  before_bytes: number;
  after_bytes: number;
  removed: RemovedItem[];
  reencoded: boolean;
  kept_orientation: number | null;
  decodes: boolean;
  remaining_indicators: Indicator[];
  remaining_blocks: Piece[];
}

export interface BatchResult {
  input_name: string;
  output: string | null;
  error: CoreError | null;
  before_bytes: number;
  after_bytes: number;
  width: number;
  height: number;
  verified: boolean;
  format_name: string;
  metadata_clean: boolean | null;
  notes: Note[];
}

export type RegionKind = "face" | "email" | "phone" | "address" | "identifier" | "licensePlate" | "manual";
export interface NRect { x: number; y: number; w: number; h: number }
export interface SensitiveRegion { id: string; kind: RegionKind; rect: NRect; label: string; confidence: number; isSelected: boolean }
export interface VisualReport { regions: SensitiveRegion[]; recognizedTextCount: number; textAvailable: boolean; facesAvailable: boolean }

export interface Capabilities { backgroundModel: boolean; faceModel: boolean; ocr: boolean; formats: OutputFormat[]; version: string }

export interface ResizePlan {
  canvas_width: number;
  canvas_height: number;
  draw: { x: number; y: number; w: number; h: number };
  enlarges: boolean;
  unchanged: boolean;
}

export interface CompressPreview {
  output_bytes: number;
  original_bytes: number;
  width: number;
  height: number;
  format: OutputFormat;
  notes: Note[];
  curve: [number, number][];
  image: string;
}

export type Tool = "inspect" | "clean" | "redact" | "convert" | "resize" | "compress" | "background" | "studio" | "enhance";
export const TOOLS: Tool[] = ["inspect", "clean", "redact", "convert", "resize", "compress", "background", "studio", "enhance"];

export type RGB = [number, number, number];

export interface ConvertSettings { format: OutputFormat; quality: number; background: RGB; keepMetadata: boolean; suffix: string }
export interface ResizeSettings {
  mode: "pixels" | "percent"; width: number; height: number; lockAspect: boolean; driver: "width" | "height"; percent: number;
  fit: "pad" | "fill" | "stretch" | "fit"; borderAuto: boolean; anchor: [number, number]; presetID: string | null; neverEnlarge: boolean; outputFormat: OutputFormat | null; quality: number; background: RGB;
  keepMetadata: boolean; suffix: string;
}
export interface CompressSettings {
  format: OutputFormat | null; quality: number; useTargetSize: boolean; targetKB: number; background: RGB; keepMetadata: boolean; suffix: string;
}
export interface BackgroundSettings {
  fill: "transparent" | "color"; color: RGB; format: OutputFormat; quality: number; edgeSmoothing: number; keepMetadata: boolean; suffix: string;
}
export interface RedactionSettings {
  style: "blur" | "pixelate" | "solid"; strength: number; format: OutputFormat | null; quality: number; cleanMetadata: boolean; suffix: string;
}
export interface AiPreview { image: string; finalWidth: number; finalHeight: number; notes: Note[] }
export interface AiSettings {
  enhance: boolean; upscale: boolean; upscaleFactor: number; smartCrop: boolean; cropAspect: "square" | "portrait" | "landscape";
  removeBackground: boolean; format: OutputFormat | null; quality: number; cleanMetadata: boolean; suffix: string;
}
export interface ImageRecipe {
  id: string; name: string; format: OutputFormat | null; width: number | null; height: number | null; targetKB: number | null;
  quality: number; cleanMetadata: boolean; suffix: string; isBuiltIn: boolean;
}
export interface SizePreset { id: string; name: string; width: number; height: number; isBuiltIn: boolean }

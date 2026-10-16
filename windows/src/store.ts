import { create } from "zustand";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { api } from "./api";
import { errorText, setLanguage, t, type Lang, currentLanguage } from "./i18n";
import { dirName, fileName, joinPath } from "./format";
import {
  DEFAULT_REMOVAL, TOOLS,
  type AiSettings, type Analysis, type BackgroundSettings, type BatchResult, type Capabilities, type CleanReport, type CompressSettings,
  type ConvertSettings, type CoreError, type ImageRecipe, type MetaCategory, type PrivateField, type RedactionSettings, type ResizeSettings,
  type SizePreset, type SourceInfo, type Tool,
} from "./types";

// MARK: Persistence helpers (every access is guarded: storage can be unavailable)

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function persist(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

// MARK: Types

export type FileStatus =
  | { kind: "scanning" }
  | { kind: "ready" }
  | { kind: "cleaned"; report: CleanReport }
  | { kind: "failed"; error: CoreError };

export interface FileItem {
  id: string;
  path: string;
  name: string;
  thumb: string | null;
  info: SourceInfo | null;
  analysis: Analysis | null;
  analysisError: CoreError | null;
  status: FileStatus;
}

export interface BatchState {
  tool: Tool;
  total: number;
  folder: string;
  current: string;
  index: number;
  results: BatchResult[];
  finished: boolean;
  cancelled: boolean;
}

export type Appearance = "system" | "light" | "dark";

export const BUILT_IN_PRESETS: SizePreset[] = [
  { id: "preset-1", name: "Instagram Square", width: 1080, height: 1080, isBuiltIn: true },
  { id: "preset-2", name: "Instagram Portrait", width: 1080, height: 1350, isBuiltIn: true },
  { id: "preset-3", name: "Facebook Square", width: 1080, height: 1080, isBuiltIn: true },
  { id: "preset-4", name: "YouTube Thumbnail", width: 1280, height: 720, isBuiltIn: true },
];

const defaults = {
  convert: { format: "jpeg", quality: 0.9, background: [255, 255, 255], keepMetadata: false, suffix: "" } as ConvertSettings,
  resize: {
    mode: "pixels", width: 1080, height: 1080, lockAspect: true, driver: "width", percent: 50, fit: "fit", neverEnlarge: false,
    outputFormat: null, quality: 0.9, background: [255, 255, 255], keepMetadata: false, suffix: "_resized",
  } as ResizeSettings,
  compress: { format: null, quality: 0.75, useTargetSize: false, targetKB: 200, background: [255, 255, 255], keepMetadata: false, suffix: "_compressed" } as CompressSettings,
  background: { fill: "transparent", color: [255, 255, 255], format: "png", quality: 0.95, edgeSmoothing: 0.4, keepMetadata: false, suffix: "_nobg" } as BackgroundSettings,
  redact: { style: "blur", strength: 30, format: null, quality: 0.92, cleanMetadata: true, suffix: "_redacted" } as RedactionSettings,
  ai: {
    enhance: true, upscale: false, upscaleFactor: 2, smartCrop: false, cropAspect: "square", removeBackground: false,
    format: null, quality: 0.92, cleanMetadata: true, suffix: "_enhanced",
  } as AiSettings,
};

interface AppState {
  files: FileItem[];
  selection: string | null;
  tool: Tool;
  caps: Capabilities | null;
  applyToAll: boolean;
  lang: Lang;
  appearance: Appearance;

  remove: MetaCategory[];
  selectiveFields: PrivateField[];
  isCleaning: boolean;
  batch: BatchState | null;

  convert: ConvertSettings;
  resize: ResizeSettings;
  compress: CompressSettings;
  background: BackgroundSettings;
  redact: RedactionSettings;
  ai: AiSettings;
  builtInRecipes: ImageRecipe[];
  customRecipes: ImageRecipe[];
  selectedRecipeId: string;
  customPresets: SizePreset[];

  init: () => Promise<void>;
  setTool: (tool: Tool) => void;
  setLang: (l: Lang) => void;
  setAppearance: (a: Appearance) => void;
  select: (id: string | null) => void;
  addPaths: (paths: string[]) => Promise<void>;
  chooseImages: () => Promise<void>;
  chooseFolder: () => Promise<void>;
  removeFile: (id: string) => void;
  clearAll: () => void;
  patch: <K extends "convert" | "resize" | "compress" | "background" | "redact" | "ai">(key: K, value: Partial<AppState[K]>) => void;
  setRemove: (r: MetaCategory[]) => void;
  setSelectiveFields: (f: PrivateField[]) => void;
  setApplyToAll: (v: boolean) => void;

  selected: () => FileItem | undefined;
  toolTargets: () => FileItem[];
  isBatchRunning: () => boolean;
  allRecipes: () => ImageRecipe[];
  selectedRecipe: () => ImageRecipe;
  allPresets: () => SizePreset[];
  saveRecipe: (r: ImageRecipe) => void;
  deleteSelectedRecipe: () => void;
  selectRecipe: (id: string) => void;
  savePreset: (name: string, width: number, height: number) => void;
  deletePreset: (id: string) => void;

  startBatch: (tool: Tool, settings: unknown, opts?: { targets?: FileItem[]; extra?: unknown }) => Promise<void>;
  cancelBatch: () => void;
  dismissBatch: () => void;
  cleanSelected: () => Promise<void>;
  cleanAll: () => Promise<void>;
  cancelCleaning: () => void;
}

const NO_RECIPE: ImageRecipe = {
  id: "none", name: "", format: null, width: null, height: null, targetKB: null, quality: 0.82, cleanMetadata: true, suffix: "_ready", isBuiltIn: true,
};

let initialized = false;
let cancelCleanFlag = false;

function lastDir(): string | undefined {
  try { return localStorage.getItem("lastSaveDirectory") ?? undefined; } catch { return undefined; }
}
function setLastDir(dir: string) {
  try { localStorage.setItem("lastSaveDirectory", dir); } catch { /* ignore */ }
}

function applyAppearance(a: Appearance) {
  if (a === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", a);
}

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff", "heic", "heif", "avif", "jfif"];

export const useApp = create<AppState>((set, get) => ({
  files: [],
  selection: null,
  tool: (TOOLS.includes(load<string>("lastTool", "clean") as Tool) ? load<string>("lastTool", "clean") : "clean") as Tool,
  caps: null,
  applyToAll: load("applyToAll", true),
  lang: currentLanguage(),
  appearance: load<Appearance>("appearanceMode", "system"),

  remove: DEFAULT_REMOVAL,
  selectiveFields: ["location"],
  isCleaning: false,
  batch: null,

  ...defaults,
  builtInRecipes: [],
  customRecipes: load<ImageRecipe[]>("customImageRecipes.v1", []),
  selectedRecipeId: "10000000-0000-0000-0000-000000000001",
  customPresets: load<SizePreset[]>("customSizePresets", []),

  // MARK: Lifecycle

  init: async () => {
    // React's dev double-mount (and hot reload) would otherwise register every listener twice.
    if (initialized) return;
    initialized = true;
    applyAppearance(get().appearance);
    api.capabilities().then((caps) => set({ caps })).catch(() => undefined);
    api.builtInRecipes().then((builtInRecipes) => set({ builtInRecipes })).catch(() => undefined);

    await listen<{ index: number; total: number; current: string }>("batch-progress", (e) => {
      set((s) => (s.batch ? { batch: { ...s.batch, current: e.payload.current, index: e.payload.index } } : s));
    });
    await listen<BatchResult>("batch-result", (e) => {
      set((s) => (s.batch ? { batch: { ...s.batch, results: [...s.batch.results, e.payload] } } : s));
    });
    await listen<boolean>("batch-done", (e) => {
      set((s) => (s.batch ? { batch: { ...s.batch, finished: true, cancelled: e.payload, current: "" } } : s));
    });
    await getCurrentWebview().onDragDropEvent((event) => {
      const p = event.payload;
      if (p.type === "enter" || p.type === "over") document.body.dataset.dropping = "1";
      else delete document.body.dataset.dropping;
      if (p.type === "drop") void get().addPaths(p.paths);
    });
  },

  setTool: (tool) => {
    persist("lastTool", tool);
    set({ tool });
  },
  setLang: (l) => {
    setLanguage(l);
    set({ lang: l });
  },
  setAppearance: (a) => {
    persist("appearanceMode", a);
    applyAppearance(a);
    set({ appearance: a });
  },
  select: (id) => set({ selection: id }),
  setApplyToAll: (v) => {
    persist("applyToAll", v);
    set({ applyToAll: v });
  },

  // MARK: Files

  addPaths: async (paths) => {
    const found = await api.listImages(paths);
    const known = new Set(get().files.map((f) => f.path));
    const fresh = found.filter((p) => !known.has(p));
    if (!fresh.length) return;
    const items: FileItem[] = fresh.map((path) => ({
      id: crypto.randomUUID(), path, name: fileName(path), thumb: null, info: null, analysis: null, analysisError: null, status: { kind: "scanning" },
    }));
    set((s) => ({ files: [...s.files, ...items], selection: s.selection ?? items[0].id }));

    const update = (id: string, change: Partial<FileItem>) => set((s) => ({ files: s.files.map((f) => (f.id === id ? { ...f, ...change } : f)) }));
    const queue = [...items];
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        try {
          const r = await api.scanFile(item.path);
          if (r.analysis) update(item.id, { thumb: r.thumb, info: r.info, analysis: r.analysis, status: { kind: "ready" } });
          else if (r.info) update(item.id, { thumb: r.thumb, info: r.info, analysisError: r.analysisError, status: { kind: "ready" } });
          else update(item.id, { thumb: r.thumb, status: { kind: "failed", error: r.analysisError ?? { key: "err.unreadable", args: [] } } });
        } catch (e) {
          update(item.id, { status: { kind: "failed", error: { key: "", args: [errorText(e)] } } });
        }
      }
    };
    await Promise.all([worker(), worker()]);
  },

  chooseImages: async () => {
    const picked = await open({ multiple: true, title: t("panel.chooseImages"), filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }] });
    if (picked) await get().addPaths(Array.isArray(picked) ? picked : [picked]);
  },
  chooseFolder: async () => {
    const picked = await open({ directory: true, title: t("panel.chooseImages") });
    if (picked && typeof picked === "string") await get().addPaths([picked]);
  },
  removeFile: (id) =>
    set((s) => {
      const files = s.files.filter((f) => f.id !== id);
      return { files, selection: s.selection === id ? files[0]?.id ?? null : s.selection };
    }),
  clearAll: () => set({ files: [], selection: null }),

  patch: (key, value) => set((s) => ({ [key]: { ...(s[key] as object), ...(value as object) } }) as Partial<AppState>),
  setRemove: (remove) => set({ remove }),
  setSelectiveFields: (selectiveFields) => set({ selectiveFields }),

  // MARK: Derived

  selected: () => get().files.find((f) => f.id === get().selection),
  toolTargets: () => {
    const readable = get().files.filter((f) => f.info);
    return get().applyToAll ? readable : readable.filter((f) => f.id === get().selection);
  },
  isBatchRunning: () => !!get().batch && !get().batch!.finished,
  allRecipes: () => [...get().builtInRecipes, ...get().customRecipes],
  selectedRecipe: () => get().allRecipes().find((r) => r.id === get().selectedRecipeId) ?? get().allRecipes()[0] ?? NO_RECIPE,
  allPresets: () => [...BUILT_IN_PRESETS, ...get().customPresets],
  selectRecipe: (id) => set({ selectedRecipeId: id }),
  saveRecipe: (r) => {
    const saved = { ...r, id: crypto.randomUUID(), isBuiltIn: false };
    const customRecipes = [...get().customRecipes, saved];
    persist("customImageRecipes.v1", customRecipes);
    set({ customRecipes, selectedRecipeId: saved.id });
  },
  deleteSelectedRecipe: () => {
    const r = get().selectedRecipe();
    if (r.isBuiltIn) return;
    const customRecipes = get().customRecipes.filter((c) => c.id !== r.id);
    persist("customImageRecipes.v1", customRecipes);
    set({ customRecipes, selectedRecipeId: get().builtInRecipes[0]?.id ?? "" });
  },
  savePreset: (name, width, height) => {
    const customPresets = [...get().customPresets, { id: crypto.randomUUID(), name, width, height, isBuiltIn: false }];
    persist("customSizePresets", customPresets);
    set({ customPresets });
  },
  deletePreset: (id) => {
    const customPresets = get().customPresets.filter((p) => p.id !== id);
    persist("customSizePresets", customPresets);
    set({ customPresets });
  },

  // MARK: Batch tools (convert, resize, compress, background, redact, studio, enhance, selective clean)

  startBatch: async (tool, settings, opts = {}) => {
    if (get().isBatchRunning()) return;
    const targets = opts.targets ?? get().toolTargets();
    if (!targets.length) return;

    const affected = targets.filter((f) => f.analysis?.has_provenance).length;
    if (affected > 0) {
      const ok = await ask(t("confirm.reencode.body"), {
        title: t("confirm.reencode.title", affected), kind: "warning", okLabel: t("confirm.reencode.button"), cancelLabel: t("common.cancel"),
      });
      if (!ok) return;
    }
    const folder = await open({ directory: true, title: t("panel.chooseFolder.title"), defaultPath: lastDir() ?? dirName(targets[0].path) });
    if (!folder || typeof folder !== "string") return;
    setLastDir(folder);

    set({ batch: { tool, total: targets.length, folder, current: targets[0].name, index: 0, results: [], finished: false, cancelled: false } });
    try {
      await api.runBatch(tool, settings, targets.map((f) => f.path), folder, opts.extra ?? {});
    } catch (e) {
      const failure: BatchResult = {
        input_name: targets[0].name, output: null, error: { key: "", args: [errorText(e)] }, before_bytes: 0, after_bytes: 0,
        width: 0, height: 0, verified: false, format_name: "", metadata_clean: null, notes: [],
      };
      set((s) => (s.batch ? { batch: { ...s.batch, finished: true, results: [...s.batch.results, failure] } } : s));
    }
  },
  cancelBatch: () => void api.cancelBatch(),
  dismissBatch: () => {
    if (!get().isBatchRunning()) set({ batch: null });
  },

  // MARK: Clean (always asks where to save)

  cancelCleaning: () => {
    cancelCleanFlag = true;
  },
  cleanSelected: async () => {
    const id = get().selection;
    if (id) await startCleaning([id]);
  },
  cleanAll: async () => {
    await startCleaning(get().files.filter((f) => f.analysis).map((f) => f.id));
  },
}));

async function startCleaning(ids: string[]) {
  const s = useApp.getState();
  if (s.isCleaning) return;
  const targets = ids.map((id) => s.files.find((f) => f.id === id && f.analysis)).filter((f): f is FileItem => !!f);
  if (!targets.length) return;

  // Removing Content Credentials is a deliberate act, so the user has to agree to it first.
  if (s.remove.includes("c2pa")) {
    const affected = targets.filter((f) => f.analysis?.has_provenance).length;
    if (affected > 0) {
      const ok = await ask(t("confirm.provenance.body"), {
        title: t("confirm.provenance.title", affected), kind: "warning", okLabel: t("confirm.provenance.button"), cancelLabel: t("common.cancel"),
      });
      if (!ok) return;
    }
  }

  const plan: { id: string; input: string; output: string; avoid: boolean }[] = [];
  if (targets.length === 1) {
    const f = targets[0];
    const a = f.analysis!;
    const name = await api.suggestCleanName(f.path, a.kind, a.has_alpha);
    const ext = name.split(".").pop() ?? "jpg";
    const dest = await save({
      title: t("panel.saveCleaned.title"), defaultPath: joinPath(lastDir() ?? dirName(f.path), name), filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (!dest) return;
    setLastDir(dirName(dest));
    plan.push({ id: f.id, input: f.path, output: dest, avoid: false });
  } else {
    const folder = await open({ directory: true, title: t("panel.chooseFolder.title"), defaultPath: lastDir() ?? dirName(targets[0].path) });
    if (!folder || typeof folder !== "string") return;
    setLastDir(folder);
    for (const f of targets) {
      const a = f.analysis!;
      plan.push({ id: f.id, input: f.path, output: joinPath(folder, await api.suggestCleanName(f.path, a.kind, a.has_alpha)), avoid: true });
    }
  }

  cancelCleanFlag = false;
  useApp.setState({ isCleaning: true });
  const setStatus = (id: string, status: FileStatus) =>
    useApp.setState((st) => ({ files: st.files.map((f) => (f.id === id ? { ...f, status } : f)) }));
  const remove = useApp.getState().remove;
  for (const step of plan) {
    if (cancelCleanFlag) break;
    try {
      const report = await api.cleanFile(step.input, step.output, step.avoid, remove);
      setStatus(step.id, { kind: "cleaned", report });
    } catch (e) {
      setStatus(step.id, { kind: "failed", error: typeof e === "object" && e && "key" in e ? (e as CoreError) : { key: "", args: [errorText(e)] } });
    }
  }
  useApp.setState({ isCleaning: false });
}

//! MyPixelGuard desktop shell. Everything here is a thin layer over `mpg-core`: commands receive plain
//! JSON from the UI, run the heavy work on a worker thread, and send results (or progress events) back.
//! The only network connections are in `services.rs`: an update check, opt-in usage stats and feedback.

mod ocr;
mod services;

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use mpg_core::analyzer::{self, Analysis};
use mpg_core::background::{self, BackgroundSettings, Segmenter};
use mpg_core::cleaner::{self, CleanReport};
use mpg_core::codec::{self, OutputFormat, SourceInfo};
use mpg_core::compress::{self, CompressSettings};
use mpg_core::convert::{self, ConvertSettings};
use mpg_core::engine::MetaCategory;
use mpg_core::error::CoreError;
use mpg_core::export::{self, BatchResult};
use mpg_core::recipe::{self, ImageRecipe};
use mpg_core::redact::{self, RedactionSettings, SensitiveRegion};
use mpg_core::resize::{self, ResizeSettings};
use mpg_core::tiff::PrivateField;
use mpg_core::visual::{self, FaceFinder, VisualPrivacyReport};
use mpg_core::{ai, selective};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

type CmdResult<T> = Result<T, CoreError>;

#[derive(Default)]
struct AppState {
    resource_dir: Mutex<Option<PathBuf>>,
    segmenter: Mutex<Option<Arc<Segmenter>>>,
    faces: Mutex<Option<Arc<mpg_core::yunet::YuNet>>>,
    cancel: Arc<AtomicBool>,
    /// Reduced-size copies used by the Redact preview, keyed by path.
    previews: Mutex<HashMap<String, Arc<mpg_core::image::DynamicImage>>>,
}

impl AppState {
    fn resources(&self) -> Option<PathBuf> {
        self.resource_dir.lock().ok().and_then(|g| g.clone())
    }

    fn segmenter(&self) -> CmdResult<Arc<Segmenter>> {
        let mut guard = self.segmenter.lock().map_err(|_| CoreError::encode_failed())?;
        if let Some(s) = guard.as_ref() {
            return Ok(s.clone());
        }
        let path = Segmenter::locate(self.resources().as_deref()).ok_or_else(|| CoreError::new("bg.err.unsupported"))?;
        let seg = Arc::new(Segmenter::load(&path)?);
        *guard = Some(seg.clone());
        Ok(seg)
    }

    fn face_model(&self) -> Option<Arc<mpg_core::yunet::YuNet>> {
        let mut guard = self.faces.lock().ok()?;
        if guard.is_none() {
            let path = mpg_core::yunet::locate(self.resources().as_deref())?;
            *guard = mpg_core::yunet::YuNet::load(&path).ok().map(Arc::new);
        }
        guard.clone()
    }
}

// MARK: Capabilities

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Capabilities {
    background_model: bool,
    face_model: bool,
    ocr: bool,
    formats: Vec<OutputFormat>,
    version: String,
}

#[tauri::command]
fn capabilities(state: State<'_, AppState>) -> Capabilities {
    let res = state.resources();
    Capabilities {
        background_model: Segmenter::locate(res.as_deref()).is_some(),
        face_model: mpg_core::yunet::locate(res.as_deref()).is_some(),
        ocr: ocr::available(),
        formats: OutputFormat::available(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

// MARK: Adding and scanning files

const IMAGE_EXTENSIONS: [&str; 14] = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff", "heic", "heif", "avif", "jfif", "ico", "dng"];

fn is_image(p: &Path) -> bool {
    p.extension().map(|e| IMAGE_EXTENSIONS.contains(&e.to_string_lossy().to_lowercase().as_str())).unwrap_or(false)
}

/// Expands folders and keeps only image files.
#[tauri::command]
fn list_images(paths: Vec<String>) -> Vec<String> {
    fn walk(dir: &Path, out: &mut Vec<PathBuf>, depth: usize) {
        let Ok(rd) = std::fs::read_dir(dir) else { return };
        let mut entries: Vec<PathBuf> = rd.flatten().map(|e| e.path()).collect();
        entries.sort();
        for p in entries {
            let hidden = p.file_name().map(|n| n.to_string_lossy().starts_with('.')).unwrap_or(false);
            if hidden {
                continue;
            }
            if p.is_dir() && depth < 8 {
                walk(&p, out, depth + 1);
            } else if p.is_file() && is_image(&p) {
                out.push(p);
            }
        }
    }
    let mut found = Vec::new();
    for raw in paths {
        let p = PathBuf::from(raw);
        if p.is_dir() {
            walk(&p, &mut found, 0);
        } else if p.is_file() && is_image(&p) {
            found.push(p);
        }
    }
    found.into_iter().map(|p| p.to_string_lossy().into_owned()).collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileScan {
    thumb: Option<String>,
    info: Option<SourceInfo>,
    analysis: Option<Analysis>,
    analysis_error: Option<CoreError>,
    /// File-system dates in milliseconds since 1970, for the Clean tab's file card.
    created: Option<u64>,
    modified: Option<u64>,
}

#[tauri::command]
async fn scan_file(path: String) -> CmdResult<FileScan> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = PathBuf::from(&path);
        let thumb = codec::load_image(&p, Some(480)).ok().map(|l| mpg_core::export_data_url(&l.image));
        let info = codec::info(&p).ok();
        let (analysis, analysis_error) = match analyzer::analyze(&p) {
            Ok(a) => (Some(a), None),
            Err(e) => (None, Some(e)),
        };
        let meta = std::fs::metadata(&p).ok();
        let ms = |t: std::io::Result<std::time::SystemTime>| t.ok()?.duration_since(std::time::UNIX_EPOCH).ok().map(|d| d.as_millis() as u64);
        let created = meta.as_ref().and_then(|m| ms(m.created()));
        let modified = meta.as_ref().and_then(|m| ms(m.modified()));
        FileScan { thumb, info, analysis, analysis_error, created, modified }
    })
    .await
    .map_err(|_| CoreError::encode_failed())
}

// MARK: Clean (full removal, with the Mac app's naming)

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CleanRequest {
    input: String,
    output: String,
    avoid_overwrite: bool,
    remove: Vec<MetaCategory>,
    /// Private details removed on top of whole blocks.
    #[serde(default)]
    fields: Vec<PrivateField>,
}

#[tauri::command]
async fn suggest_clean_name(path: String, kind: mpg_core::engine::ImageKind, has_alpha: bool) -> String {
    cleaner::suggested_filename(Path::new(&path), kind, has_alpha)
}

#[tauri::command]
async fn clean_file(req: CleanRequest) -> CmdResult<CleanReport> {
    tauri::async_runtime::spawn_blocking(move || {
        let remove: HashSet<MetaCategory> = req.remove.into_iter().collect();
        let fields: HashSet<PrivateField> = req.fields.into_iter().collect();
        cleaner::clean(Path::new(&req.input), Path::new(&req.output), req.avoid_overwrite, &remove, &fields)
    })
    .await
    .map_err(|_| CoreError::encode_failed())?
}

// MARK: Batch tools

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchRequest {
    tool: String,
    settings: serde_json::Value,
    inputs: Vec<String>,
    folder: String,
    /// Tool-specific extras: redaction regions, selective-clean fields.
    #[serde(default)]
    extra: serde_json::Value,
}

#[derive(Serialize, Clone)]
struct Progress {
    index: usize,
    total: usize,
    current: String,
}

fn bad_settings(e: serde_json::Error) -> CoreError {
    CoreError::with("err.settings", [e.to_string()])
}

#[tauri::command]
async fn run_batch(app: AppHandle, state: State<'_, AppState>, req: BatchRequest) -> CmdResult<()> {
    state.cancel.store(false, Ordering::SeqCst);
    let cancel = state.cancel.clone();
    let seg = if req.tool == "background" || (req.tool == "enhance" && req.settings.get("removeBackground").and_then(|v| v.as_bool()).unwrap_or(false)) {
        state.segmenter().ok()
    } else {
        None
    };

    // Build the per-file operation once, so settings errors surface before any file is touched.
    type Op = Box<dyn Fn(&Path) -> mpg_core::CoreResult<codec::ProcessedImage> + Send + Sync>;
    let (op, suffix): (Op, String) = match req.tool.as_str() {
        "convert" => {
            let s: ConvertSettings = serde_json::from_value(req.settings.clone()).map_err(bad_settings)?;
            let suffix = s.suffix.clone();
            (Box::new(move |p| convert::process(p, &s)), suffix)
        }
        "resize" => {
            let s: ResizeSettings = serde_json::from_value(req.settings.clone()).map_err(bad_settings)?;
            let suffix = s.suffix.clone();
            (Box::new(move |p| resize::process(p, &s)), suffix)
        }
        "compress" => {
            let s: CompressSettings = serde_json::from_value(req.settings.clone()).map_err(bad_settings)?;
            let suffix = s.suffix.clone();
            (Box::new(move |p| compress::process(p, &s)), suffix)
        }
        "background" => {
            let s: BackgroundSettings = serde_json::from_value(req.settings.clone()).map_err(bad_settings)?;
            let seg = seg.clone().ok_or_else(|| CoreError::new("bg.err.unsupported"))?;
            let suffix = s.suffix.clone();
            (Box::new(move |p| background::process(p, &s, &seg)), suffix)
        }
        "enhance" => {
            let s: ai::AiSettings = serde_json::from_value(req.settings.clone()).map_err(bad_settings)?;
            let suffix = s.suffix.clone();
            let seg = seg.clone();
            (Box::new(move |p| ai::process(p, &s, seg.as_deref())), suffix)
        }
        "studio" => {
            let r: ImageRecipe = serde_json::from_value(req.settings.clone()).map_err(bad_settings)?;
            let suffix = r.suffix.clone();
            (Box::new(move |p| recipe::process(p, &r)), suffix)
        }
        "redact" => {
            let s: RedactionSettings = serde_json::from_value(req.settings.clone()).map_err(bad_settings)?;
            let regions: Vec<SensitiveRegion> = serde_json::from_value(req.extra.get("regions").cloned().unwrap_or_default()).map_err(bad_settings)?;
            let suffix = s.suffix.clone();
            (Box::new(move |p| redact::process(p, &regions, &s)), suffix)
        }
        "clean" => {
            let fields: HashSet<PrivateField> = serde_json::from_value(req.extra.get("fields").cloned().unwrap_or_default()).map_err(bad_settings)?;
            (Box::new(move |p| selective::process(p, &fields)), "_private".to_string())
        }
        other => return Err(CoreError::with("err.unknownTool", [other])),
    };

    let folder = PathBuf::from(&req.folder);
    let inputs = req.inputs;
    tauri::async_runtime::spawn_blocking(move || {
        let total = inputs.len();
        let mut cancelled = false;
        for (index, input) in inputs.iter().enumerate() {
            if cancel.load(Ordering::SeqCst) {
                cancelled = true;
                break;
            }
            let path = PathBuf::from(input);
            let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            let _ = app.emit("batch-progress", Progress { index, total, current: name });
            let result: BatchResult = export::export(&path, &folder, &suffix, |p| op(p));
            let _ = app.emit("batch-result", result);
        }
        let _ = app.emit("batch-done", cancelled);
    })
    .await
    .map_err(|_| CoreError::encode_failed())?;
    Ok(())
}

#[tauri::command]
fn cancel_batch(state: State<'_, AppState>) {
    state.cancel.store(true, Ordering::SeqCst);
}

// MARK: Live previews

#[tauri::command]
async fn convert_estimate(path: String, settings: ConvertSettings) -> Option<usize> {
    tauri::async_runtime::spawn_blocking(move || convert::estimate(Path::new(&path), &settings)).await.ok().flatten()
}

#[tauri::command]
async fn compress_preview(path: String, settings: CompressSettings) -> CmdResult<compress::Preview> {
    tauri::async_runtime::spawn_blocking(move || compress::preview(Path::new(&path), &settings)).await.map_err(|_| CoreError::encode_failed())?
}

/// A larger copy of an image for the before/after panes (the scan's thumbnail is small).
#[tauri::command]
async fn preview_image(path: String, max_pixel: u32) -> CmdResult<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let img = codec::load_image(Path::new(&path), Some(max_pixel.clamp(64, 4000)))?.image;
        Ok(mpg_core::export_data_url(&img))
    })
    .await
    .map_err(|_| CoreError::encode_failed())?
}

#[tauri::command]
async fn ai_preview(state: State<'_, AppState>, path: String, settings: ai::AiSettings) -> CmdResult<ai::Preview> {
    let seg = if settings.remove_background { state.segmenter().ok() } else { None };
    tauri::async_runtime::spawn_blocking(move || ai::preview(Path::new(&path), &settings, seg.as_deref(), 900))
        .await
        .map_err(|_| CoreError::encode_failed())?
}

#[tauri::command]
fn resize_plan(original: (u32, u32), settings: ResizeSettings) -> resize::Plan {
    resize::plan(original, &settings)
}

#[tauri::command]
async fn background_preview(state: State<'_, AppState>, path: String, settings: BackgroundSettings) -> CmdResult<String> {
    let seg = state.segmenter()?;
    tauri::async_runtime::spawn_blocking(move || {
        let img = background::preview(Path::new(&path), &settings, &seg)?;
        Ok(mpg_core::export_data_url(&img))
    })
    .await
    .map_err(|_| CoreError::encode_failed())?
}

#[derive(Serialize)]
struct PreviewBase {
    image: String,
    width: u32,
    height: u32,
}

#[tauri::command]
async fn redact_base(state: State<'_, AppState>, path: String) -> CmdResult<PreviewBase> {
    let p = path.clone();
    let img = tauri::async_runtime::spawn_blocking(move || redact::preview_base(Path::new(&p), 1600).ok_or_else(CoreError::unreadable))
        .await
        .map_err(|_| CoreError::encode_failed())??;
    let out = PreviewBase { image: mpg_core::export_data_url(&img), width: img.width(), height: img.height() };
    if let Ok(mut cache) = state.previews.lock() {
        cache.clear();
        cache.insert(path, Arc::new(img));
    }
    Ok(out)
}

#[tauri::command]
async fn redact_preview(state: State<'_, AppState>, path: String, regions: Vec<SensitiveRegion>, settings: RedactionSettings) -> CmdResult<String> {
    let base = state.previews.lock().ok().and_then(|c| c.get(&path).cloned()).ok_or_else(CoreError::unreadable)?;
    tauri::async_runtime::spawn_blocking(move || mpg_core::export_data_url(&redact::render(&base, &regions, &settings)))
        .await
        .map_err(|_| CoreError::encode_failed())
}

#[tauri::command]
async fn redact_scan(state: State<'_, AppState>, path: String) -> CmdResult<VisualPrivacyReport> {
    let faces = state.face_model();
    tauri::async_runtime::spawn_blocking(move || {
        let img = codec::load_image(Path::new(&path), Some(2400))?.image;
        let ocr_engine = ocr::engine();
        visual::scan(&img, faces.as_deref().map(|f| f as &dyn FaceFinder), ocr_engine.as_ref().map(|o| o as &dyn visual::TextRecognizer))
    })
    .await
    .map_err(|_| CoreError::encode_failed())?
}

/// Saves the "Save as Text…" metadata export. The path comes from the user's own save dialog.
#[tauri::command]
fn write_text_file(path: String, text: String) -> CmdResult<()> {
    std::fs::write(path, text).map_err(CoreError::write_failed)
}

// MARK: Recipes

#[tauri::command]
fn built_in_recipes() -> Vec<ImageRecipe> {
    recipe::built_in()
}

// MARK: Entry point

/// A release build has no console, so a startup failure would be invisible. Write it to a log and tell the user.
fn report_fatal(what: &str) {
    #[cfg(windows)]
    {
        use windows::Win32::UI::WindowsAndMessaging::{MB_ICONERROR, MB_OK, MessageBoxW};
        use windows::core::HSTRING;
        let log = std::env::var("LOCALAPPDATA").map(|d| format!("{d}\\MyPixelGuard\\crash.log")).unwrap_or_default();
        if !log.is_empty() {
            let _ = std::fs::create_dir_all(std::path::Path::new(&log).parent().unwrap());
            let _ = std::fs::write(&log, what);
        }
        let text = format!("MyPixelGuard could not start.\n\n{what}\n\nDetails saved to:\n{log}");
        unsafe { MessageBoxW(None, &HSTRING::from(text), &HSTRING::from("MyPixelGuard"), MB_OK | MB_ICONERROR) };
    }
    #[cfg(not(windows))]
    eprintln!("MyPixelGuard could not start: {what}");
}

pub fn run() {
    std::panic::set_hook(Box::new(|info| report_fatal(&info.to_string())));
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .setup(|app| {
            if let Ok(dir) = app.path().resource_dir() {
                if let Some(state) = app.try_state::<AppState>() {
                    *state.resource_dir.lock().unwrap() = Some(dir);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            capabilities,
            list_images,
            scan_file,
            suggest_clean_name,
            clean_file,
            run_batch,
            cancel_batch,
            convert_estimate,
            compress_preview,
            resize_plan,
            preview_image,
            ai_preview,
            background_preview,
            redact_base,
            redact_preview,
            redact_scan,
            write_text_file,
            built_in_recipes,
            services::service_update_manifest,
            services::service_send_stats,
            services::service_send_feedback,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| report_fatal(&e.to_string()));
}

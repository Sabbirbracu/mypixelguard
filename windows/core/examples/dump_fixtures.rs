//! Writes real core output (as the UI receives it) to JSON, for the browser-only UI preview harness.
//!   cargo run --example dump_fixtures -- <fixtures-dir> <out.json>
use std::path::{Path, PathBuf};

use mpg_core::analyzer;
use mpg_core::codec::{self, OutputFormat};
use mpg_core::compress::{self, CompressSettings};
use mpg_core::convert::{self, ConvertSettings};
use mpg_core::export;
use mpg_core::recipe;
use serde_json::json;

fn data_url(path: &Path, max: u32) -> String {
    let img = codec::load_image(path, Some(max)).expect("load").image;
    mpg_core::export_data_url(&img)
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let dir = PathBuf::from(&args[0]);
    let mut files = serde_json::Map::new();
    for name in ["photo_meta.jpg", "photo_meta.png", "photo_meta.webp"] {
        let p = dir.join(name);
        let analysis = analyzer::analyze(&p).expect("analyze");
        let info = codec::info(&p).expect("info");
        files.insert(name.to_string(), json!({ "thumb": data_url(&p, 480), "info": info, "analysis": analysis, "analysisError": null }));
    }
    let jpg = dir.join("photo_meta.jpg");
    let out = std::env::temp_dir();
    let batch = export::export(&jpg, &out, "_x", |p| convert::process(p, &ConvertSettings { format: OutputFormat::Png, ..Default::default() }));
    let cleaned = mpg_core::cleaner::clean(&jpg, &out.join("cleaned_demo.jpg"), true, &mpg_core::engine::MetaCategory::default_removal(), &Default::default()).expect("clean");
    let preview = compress::preview(&jpg, &CompressSettings::default()).expect("preview");
    let plan = mpg_core::resize::plan((1600, 1000), &mpg_core::resize::ResizeSettings::default());
    let fixtures = json!({
        "files": files,
        "batch": batch,
        "clean": cleaned,
        "compress": preview,
        "plan": plan,
        "recipes": recipe::built_in(),
        "faceDemo": data_url(&jpg, 1200),
    });
    std::fs::write(&args[1], serde_json::to_string(&fixtures).unwrap()).unwrap();
    println!("wrote {}", args[1]);
}

//! Developer CLI that mirrors the macOS app's hidden `--cli` mode, for cross-checking the two ports.
//!   cargo run --example cli -- analyze <image>
//!   cargo run --example cli -- clean <image> [output-folder]
use std::path::PathBuf;

use mpg_core::analyzer::{self, byte_string};
use mpg_core::cleaner;
use mpg_core::engine::MetaCategory;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() < 2 {
        eprintln!("usage: cli analyze <image> | clean <image> [outdir]");
        return;
    }
    let path = PathBuf::from(&args[1]);
    match args[0].as_str() {
        "analyze" => {
            let a = analyzer::analyze(&path).expect("analyze");
            println!("{:?}  {}×{}  {}", a.kind, a.width, a.height, byte_string(a.file_size));
            println!("\nAI indicators:");
            if a.indicators.is_empty() {
                println!("  (none)");
            }
            for i in &a.indicators {
                println!("  [{:?}] {} — {}", i.severity, i.title, i.source);
            }
            println!("\nEmbedded blocks:");
            for p in a.pieces.iter().filter(|p| p.category.is_some()) {
                println!("  {}  {}  [{:?}]", p.label, byte_string(p.size()), p.category.unwrap());
            }
            println!("\nMetadata groups:");
            for g in &a.groups {
                println!("  {} ({} items)", g.title, g.items.len());
            }
            if std::env::var("DETAILS").is_ok() {
                for g in &a.groups {
                    println!("\n[{}]", g.title);
                    for i in &g.items {
                        println!("  {}: {}", i.key, i.value);
                    }
                }
                println!("\nPrivacy facts:");
                for f in &a.privacy_facts {
                    println!("  {:?}: {} ({:?})", f.kind, f.value, f.severity);
                }
            }
        }
        "clean" => {
            let a = analyzer::analyze(&path).expect("analyze");
            let dir = args.get(2).map(PathBuf::from).unwrap_or_else(|| path.parent().unwrap().to_path_buf());
            let out = dir.join(cleaner::suggested_filename(&path, a.kind, a.has_alpha));
            let r = cleaner::clean(&path, &out, true, &MetaCategory::default_removal(), &Default::default()).expect("clean");
            println!("wrote {}", r.output);
            println!("size {} → {}, decodes: {}, re-encoded: {}", byte_string(r.before_bytes), byte_string(r.after_bytes), r.decodes, r.reencoded);
            println!("kept orientation: {}", r.kept_orientation.map(|o| o.to_string()).unwrap_or("-".into()));
            println!("remaining AI indicators: {}", r.remaining_indicators.len());
        }
        "selective" => {
            // selective <image> <outdir> <field,field,...>
            use mpg_core::tiff::PrivateField as F;
            let fields: std::collections::HashSet<F> = args[3]
                .split(',')
                .filter_map(|n| F::ALL.iter().copied().find(|f| format!("{f:?}").to_lowercase() == n))
                .collect();
            let p = mpg_core::selective::process(&path, &fields).expect("selective");
            let out = PathBuf::from(&args[2]).join(path.file_name().unwrap());
            std::fs::write(&out, &p.data).unwrap();
            println!("wrote {} ({} bytes, {}x{})", out.display(), p.data.len(), p.width, p.height);
        }
        "removebg" => {
            // removebg <image> <outdir> [edge 0..1]
            let model = mpg_core::background::Segmenter::locate(None).expect("model not found (set MPG_MODEL)");
            let seg = mpg_core::background::Segmenter::load(&model).expect("load model");
            let mut settings = mpg_core::background::BackgroundSettings::default();
            if let Some(e) = args.get(3).and_then(|v| v.parse().ok()) {
                settings.edge_smoothing = e;
            }
            let t = std::time::Instant::now();
            let r = mpg_core::export::export(&path, &PathBuf::from(&args[2]), &settings.suffix.clone(), |p| mpg_core::background::process(p, &settings, &seg));
            match r.output {
                Some(o) => println!("wrote {o}\n{}x{} {} {} -> {} bytes, verified {} in {:.1}s", r.width, r.height, r.format_name, r.before_bytes, r.after_bytes, r.verified, t.elapsed().as_secs_f32()),
                None => println!("error: {:?}", r.error),
            }
        }
        other => eprintln!("unknown command {other}"),
    }
}

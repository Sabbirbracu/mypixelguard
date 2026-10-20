//! The only network traffic in the app, all to the MyPixelGuard website (same as the Mac app's AppServices):
//! - an update check: a plain GET of version.json (can be turned off in Settings),
//! - a weekly anonymous usage report, only after the user said yes,
//! - feedback, only when the user writes it and presses Send.
//! Request bodies are typed here, so the UI cannot add images, file names, paths or metadata to them.

use std::collections::BTreeMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};

const DEFAULT_BASE: &str = "https://mypixelguard.agentiqbd.com";

/// `MPG_SERVICE_URL` / `MPG_SERVICE_API_URL` point the app at a test server (like the Mac's `serviceBaseURL` default).
fn base() -> String {
    std::env::var("MPG_SERVICE_URL").unwrap_or_else(|_| DEFAULT_BASE.into()).trim_end_matches('/').to_string()
}
fn api_base() -> String {
    std::env::var("MPG_SERVICE_API_URL").map(|s| s.trim_end_matches('/').to_string()).unwrap_or_else(|_| base())
}

fn agent() -> ureq::Agent {
    use ureq::tls::{RootCerts, TlsConfig, TlsProvider};
    ureq::Agent::config_builder()
        .tls_config(TlsConfig::builder().provider(TlsProvider::NativeTls).root_certs(RootCerts::PlatformVerifier).build())
        .timeout_global(Some(Duration::from_secs(20)))
        .http_status_as_error(false)
        .build()
        .into()
}

fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// "Windows 10.0.22631" (Windows 11 still reports 10.0 with a build number of 22000 or higher).
fn os_version() -> String {
    #[cfg(windows)]
    {
        if let Ok(v) = windows::System::Profile::AnalyticsInfo::VersionInfo().and_then(|i| i.DeviceFamilyVersion()) {
            if let Ok(n) = v.to_string().parse::<u64>() {
                return format!("Windows {}.{}.{}", n >> 48, (n >> 32) & 0xFFFF, (n >> 16) & 0xFFFF);
            }
        }
        "Windows".into()
    }
    #[cfg(not(windows))]
    {
        format!("{} (dev)", std::env::consts::OS)
    }
}

// MARK: Update check

#[derive(Serialize)]
pub struct UpdateManifest {
    pub version: String,
    pub url: String,
    pub notes: BTreeMap<String, String>,
    pub current: String,
}

#[derive(Deserialize)]
struct Root {
    windows: Entry,
}
#[derive(Deserialize)]
struct Entry {
    version: String,
    url: String,
    #[serde(default)]
    notes: BTreeMap<String, String>,
}

/// The `windows` entry of version.json, or None when offline or the file is not as expected.
#[tauri::command]
pub async fn service_update_manifest() -> Option<UpdateManifest> {
    tauri::async_runtime::spawn_blocking(fetch_manifest).await.ok().flatten()
}

fn fetch_manifest() -> Option<UpdateManifest> {
    {
        let url = format!("{}/version.json", base());
        let mut res = agent().get(&url).header("Cache-Control", "no-cache").call().ok()?;
        if res.status() != 200 {
            return None;
        }
        let root: Root = serde_json::from_str(&res.body_mut().read_to_string().ok()?).ok()?;
        // Only ever offer a download from the project's own site.
        let link = root.windows.url;
        if !(link.starts_with("https://mypixelguard.agentiqbd.com/") || link.starts_with("https://agentiqbd.com/")) {
            return None;
        }
        Some(UpdateManifest { version: root.windows.version, url: link, notes: root.windows.notes, current: app_version() })
    }
}

// MARK: Reports

/// What the UI collected: counts only.
#[derive(Deserialize)]
pub struct StatsInput {
    id: String,
    lang: String,
    days: u32,
    opens: u32,
    saved: u32,
    failed: u32,
    tools: BTreeMap<String, u32>,
}

#[derive(Deserialize)]
pub struct FeedbackInput {
    rating: u8,
    text: String,
    lang: String,
}

const TOOLS: [&str; 9] = ["inspect", "clean", "redact", "convert", "resize", "compress", "background", "studio", "enhance"];

fn post(path: &str, body: serde_json::Value) -> bool {
    let url = format!("{}/{}", api_base(), path);
    agent()
        .post(&url)
        .header("Content-Type", "application/json")
        .send(body.to_string())
        .map(|r| r.status() == 200)
        .unwrap_or(false)
}

/// Sends the weekly anonymous report. Returns false when it could not be delivered (the UI keeps counting).
#[tauri::command]
pub async fn service_send_stats(stats: StatsInput) -> bool {
    tauri::async_runtime::spawn_blocking(move || {
        let id_ok = stats.id.len() <= 64 && stats.id.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
        if !id_ok {
            return false;
        }
        let tools: BTreeMap<String, u32> = stats.tools.into_iter().filter(|(k, _)| TOOLS.contains(&k.as_str())).collect();
        let lang = if stats.lang == "bn" { "bn" } else { "en" };
        post(
            "api/app/stats",
            serde_json::json!({
                "id": stats.id, "v": app_version(), "os": os_version(), "lang": lang, "platform": "windows",
                "days": stats.days, "opens": stats.opens, "saved": stats.saved, "failed": stats.failed, "tools": tools,
            }),
        )
    })
    .await
    .unwrap_or(false)
}

#[tauri::command]
pub async fn service_send_feedback(feedback: FeedbackInput) -> bool {
    tauri::async_runtime::spawn_blocking(move || {
        let lang = if feedback.lang == "bn" { "bn" } else { "en" };
        let text: String = feedback.text.chars().take(4000).collect();
        post(
            "api/app/feedback",
            serde_json::json!({
                "rating": feedback.rating.min(5), "text": text, "v": app_version(), "os": os_version(), "lang": lang, "platform": "windows",
            }),
        )
    })
    .await
    .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    /// Talks to the real website: `cargo test -p mypixelguard -- --ignored`.
    #[test]
    #[ignore]
    fn reads_the_live_manifest() {
        let m = super::fetch_manifest().expect("version.json");
        assert!(!m.version.is_empty() && m.url.starts_with("https://"));
        println!("latest {} at {} (this build {}), os {}", m.version, m.url, m.current, super::os_version());
    }
}

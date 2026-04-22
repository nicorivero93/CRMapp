use std::fs::OpenOptions;
use std::io::Write;
use std::panic;
use tauri::{WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_log::{Target, TargetKind};

fn panic_log_path() -> std::path::PathBuf {
    // %LOCALAPPDATA%\dev.tomerivero.mycrm\logs\panic.log
    let base = std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    base.join("dev.tomerivero.mycrm").join("logs").join("panic.log")
}

fn install_panic_hook() {
    panic::set_hook(Box::new(|info| {
        let path = panic_log_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let msg = format!(
            "[{}] PANIC: {}\n",
            chrono_ish_now(),
            info
        );
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
            let _ = f.write_all(msg.as_bytes());
        }
        eprintln!("{}", msg);
    }));
}

fn chrono_ish_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{}s-epoch", secs)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_panic_hook();

    let result = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: Some("app".into()) }),
                ])
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            log::info!("MyCRM desktop boot; loading wizard.html");
            let window = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::App("wizard.html".into()),
            )
            .title("MyCRM")
            .inner_size(1280.0, 820.0)
            .min_inner_size(960.0, 600.0)
            .build();
            match window {
                Ok(_) => {
                    log::info!("wizard.html window built ok");
                    Ok(())
                }
                Err(e) => {
                    log::error!("window build failed: {}", e);
                    Err(Box::new(e) as Box<dyn std::error::Error>)
                }
            }
        })
        .run(tauri::generate_context!());

    if let Err(e) = result {
        let path = panic_log_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let msg = format!("[{}] RUN ERROR: {}\n", chrono_ish_now(), e);
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
            let _ = f.write_all(msg.as_bytes());
        }
        eprintln!("{}", msg);
    }
}

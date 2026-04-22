use tauri::{WebviewUrl, WebviewWindowBuilder};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Always load wizard.html on boot. The wizard reads localStorage
            // for a saved server host+port and redirects window.location to
            // the remote server when configured; otherwise shows the
            // first-run form.
            let _win = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::App("wizard.html".into()),
            )
            .title("MyCRM")
            .inner_size(1280.0, 820.0)
            .min_inner_size(960.0, 600.0)
            .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

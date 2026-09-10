#[cfg(desktop)]
mod desktop;
mod watcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            watcher::init(app.handle());
            #[cfg(desktop)]
            {
                desktop::init_global_shortcut(app.handle());
                desktop::init_tray(app.handle())?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            watcher::start_watching,
            watcher::stop_watching,
            watcher::watched_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

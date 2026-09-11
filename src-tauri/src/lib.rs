#[cfg(desktop)]
mod ai_cli;
#[cfg(desktop)]
mod keystore;
#[cfg(desktop)]
mod desktop;
#[cfg(desktop)]
mod oauth;
mod watcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
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
            #[cfg(desktop)]
            ai_cli::detect_ai_clis,
            #[cfg(desktop)]
            ai_cli::run_ai_cli,
            #[cfg(desktop)]
            keystore::set_secret,
            #[cfg(desktop)]
            keystore::get_secret,
            #[cfg(desktop)]
            keystore::delete_secret,
            #[cfg(desktop)]
            oauth::oauth_authorize,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

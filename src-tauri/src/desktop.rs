//! Desktop-only extras: a global shortcut and a system tray icon.
//!
//! Both exist for the same reason — on desktop, Lexicon should be reachable
//! without first finding its window. The shortcut drops you straight into a
//! due-cards session; the tray keeps the app one click away when it is closed
//! to the background.
//!
//! Everything here is `#[cfg(desktop)]`: mobile has neither concept.
//!
//! See ROADMAP.md, Phase 4.

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};

/// Emitted when the user asks for a study session from outside the window.
pub const OPEN_FLASHCARDS: &str = "open-flashcards";

/// Default binding. Ctrl/Cmd+Shift+L is unclaimed on all three platforms.
const STUDY_SHORTCUT: &str = "CmdOrCtrl+Shift+L";

/// Bring the main window to the front, restoring it if it was minimised or
/// hidden to the tray.
fn focus_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Show the window and ask the frontend to open a due-cards session.
fn open_flashcards<R: Runtime>(app: &AppHandle<R>) {
    focus_main(app);
    if let Err(error) = app.emit(OPEN_FLASHCARDS, ()) {
        eprintln!("failed to emit {OPEN_FLASHCARDS}: {error}");
    }
}

/// Register the global shortcut. A failure here is not fatal — another app may
/// already own the binding, and Lexicon is still perfectly usable without it.
pub fn init_global_shortcut(app: &AppHandle) {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

    let study = Shortcut::new(
        Some(Modifiers::CONTROL | Modifiers::SHIFT),
        Code::KeyL,
    );

    let handler = app.clone();
    let result = app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |_app, shortcut, event| {
                // Fire on press, not release, or every use fires twice.
                if event.state() == ShortcutState::Pressed && shortcut == &study {
                    open_flashcards(&handler);
                }
            })
            .build(),
    );

    if let Err(error) = result {
        eprintln!("global shortcut unavailable: {error}");
        return;
    }

    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    if let Err(error) = app.global_shortcut().register(study) {
        eprintln!("could not register {STUDY_SHORTCUT}: {error}");
    }
}

/// Build the tray icon and its menu.
pub fn init_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Lexicon", true, None::<&str>)?;
    let study = MenuItem::with_id(
        app,
        "study",
        &format!("Study due cards  ({STUDY_SHORTCUT})"),
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &study, &quit])?;

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().cloned().ok_or_else(|| {
            tauri::Error::AssetNotFound("default window icon".into())
        })?)
        .tooltip("Lexicon")
        .menu(&menu)
        // Without this, a left click opens the menu on Windows and the
        // click handler below never runs.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => focus_main(app),
            "study" => open_flashcards(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                focus_main(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

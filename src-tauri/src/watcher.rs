//! Watch a folder for vocabulary files and tell the frontend when it changes.
//!
//! The frontend used to have to re-pick a folder to notice new files. This
//! replaces that: point Lexicon at a folder once, and dropping a `.json`,
//! `.csv` or `.apkg` into it loads without a refresh.
//!
//! Only one folder is watched at a time — a second `start_watching` replaces
//! the first, which is what a single "Watched folder" setting implies.
//!
//! See ROADMAP.md, Phase 4.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

/// Event name the frontend listens for.
pub const VOCAB_FILE_CHANGED: &str = "vocab-file-changed";

/// Editors and sync clients often write a file several times in quick
/// succession. Collapsing anything closer together than this keeps one save
/// from producing three imports.
const DEBOUNCE: Duration = Duration::from_millis(400);

/// Extensions worth telling the frontend about. Anything else in the folder is
/// none of our business.
const WATCHED_EXTENSIONS: [&str; 3] = ["json", "csv", "apkg"];

#[derive(Clone, Serialize)]
pub struct FileChanged {
    /// Absolute path of the file that changed.
    pub path: String,
    /// File name only, for display.
    pub name: String,
}

/// The active watcher, if any. Dropping it stops the watch.
#[derive(Default)]
pub struct WatcherState {
    inner: Mutex<Option<ActiveWatch>>,
}

struct ActiveWatch {
    /// Held to keep the watch alive; dropping this ends it.
    _watcher: RecommendedWatcher,
    folder: PathBuf,
}

fn is_watched_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| WATCHED_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Start watching `folder`, replacing any folder already being watched.
///
/// Returns the folder actually watched, so the caller can store a canonical
/// path rather than whatever the user typed.
#[tauri::command]
pub fn start_watching(
    app: AppHandle,
    state: State<'_, WatcherState>,
    folder: String,
) -> Result<String, String> {
    let path = PathBuf::from(&folder);
    if !path.is_dir() {
        return Err(format!("{folder} is not a folder"));
    }
    let canonical = path.canonicalize().unwrap_or(path);

    let emitter = app.clone();
    // Debounce state lives in the closure: notify calls it from its own thread.
    let mut last_sent: Option<(PathBuf, Instant)> = None;

    let mut watcher = notify::recommended_watcher(
        move |result: notify::Result<Event>| {
            let event = match result {
                Ok(event) => event,
                // A watch error is not worth killing the app over; the folder
                // may have been unmounted, and the user can re-point it.
                Err(error) => {
                    eprintln!("watch error: {error}");
                    return;
                }
            };

            if !matches!(
                event.kind,
                EventKind::Create(_) | EventKind::Modify(_)
            ) {
                return;
            }

            for changed in event.paths.iter().filter(|p| is_watched_file(p)) {
                let now = Instant::now();
                if let Some((previous, at)) = &last_sent {
                    if previous == changed && now.duration_since(*at) < DEBOUNCE {
                        continue;
                    }
                }
                last_sent = Some((changed.clone(), now));

                let payload = FileChanged {
                    path: changed.to_string_lossy().to_string(),
                    name: changed
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default(),
                };
                if let Err(error) = emitter.emit(VOCAB_FILE_CHANGED, payload) {
                    eprintln!("failed to emit {VOCAB_FILE_CHANGED}: {error}");
                }
            }
        },
    )
    .map_err(|e| format!("could not create a watcher: {e}"))?;

    watcher
        .watch(&canonical, RecursiveMode::NonRecursive)
        .map_err(|e| format!("could not watch {}: {e}", canonical.display()))?;

    // Replacing the previous value drops the old watcher, ending that watch.
    *state.inner.lock().map_err(|_| "watcher state poisoned")? = Some(ActiveWatch {
        _watcher: watcher,
        folder: canonical.clone(),
    });

    Ok(canonical.to_string_lossy().to_string())
}

/// Stop watching. Safe to call when nothing is being watched.
#[tauri::command]
pub fn stop_watching(state: State<'_, WatcherState>) -> Result<(), String> {
    *state.inner.lock().map_err(|_| "watcher state poisoned")? = None;
    Ok(())
}

/// The folder currently being watched, if any.
#[tauri::command]
pub fn watched_folder(state: State<'_, WatcherState>) -> Result<Option<String>, String> {
    Ok(state
        .inner
        .lock()
        .map_err(|_| "watcher state poisoned")?
        .as_ref()
        .map(|w| w.folder.to_string_lossy().to_string()))
}

/// Register the watcher state on the app.
pub fn init(app: &AppHandle) {
    app.manage(WatcherState::default());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_the_vocabulary_extensions() {
        for name in ["a.json", "a.csv", "a.apkg", "A.JSON", "deck.CSV"] {
            assert!(is_watched_file(Path::new(name)), "{name} should be watched");
        }
    }

    #[test]
    fn ignores_everything_else() {
        for name in ["a.txt", "a.json.bak", "notes", "a.png", ".hidden"] {
            assert!(
                !is_watched_file(Path::new(name)),
                "{name} should be ignored"
            );
        }
    }
}

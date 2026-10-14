//! Files shared to Lexicon from another app (Android share sheet).
//!
//! `MainActivity.kt` copies each shared file into `<cache>/shared-inbox/`
//! while it still holds the read grant. The web side drains the inbox with
//! these two commands whenever the app starts or comes back to the front,
//! which is exactly when a share arrives. See ROADMAP.md, Phase 9.
//!
//! On every other platform the inbox never exists, so both commands are
//! harmless no-ops; the web side only calls them where `canReceiveShares()`.

use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use tauri::{ipc::Response, AppHandle, Manager};

const INBOX: &str = "shared-inbox";

fn inbox(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_cache_dir().map_err(|e| e.to_string())?.join(INBOX))
}

/// A stored name is `<millis>-<n>__<original name>`; the web side sees only
/// the original, which is what decides how the file is read.
fn display_name(stored: &str) -> &str {
    stored.split_once("__").map_or(stored, |(_, name)| name)
}

/// A stored name is ours, but it is still checked: this is the one command
/// that turns a string from the web side into a path.
fn is_plain_name(name: &str) -> bool {
    !name.is_empty() && !name.contains(['/', '\\']) && name != "." && name != ".."
}

#[derive(Serialize)]
pub struct SharedFile {
    id: String,
    name: String,
}

/// What is waiting, oldest first.
#[tauri::command]
pub fn list_shared_files(app: AppHandle) -> Result<Vec<SharedFile>, String> {
    let dir = inbox(&app)?;
    let Ok(entries) = fs::read_dir(&dir) else {
        return Ok(Vec::new());
    };
    let mut ids: Vec<String> = entries
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .filter_map(|e| e.file_name().into_string().ok())
        .collect();
    ids.sort();
    Ok(ids
        .into_iter()
        .map(|id| SharedFile { name: display_name(&id).to_string(), id })
        .collect())
}

/// One file's bytes, as an ArrayBuffer on the web side. Taking a file removes
/// it, so a share is imported once however often the app comes to the front.
#[tauri::command]
pub fn take_shared_file(app: AppHandle, id: String) -> Result<Response, String> {
    if !is_plain_name(&id) {
        return Err(format!("not a shared file: {id}"));
    }
    let path = inbox(&app)?.join(&id);
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&path);
    Ok(Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shows_the_original_name() {
        assert_eq!(display_name("1760000000000-0__words.json"), "words.json");
        assert_eq!(display_name("1760000000000-1__my__deck.apkg"), "my__deck.apkg");
        assert_eq!(display_name("no-separator.csv"), "no-separator.csv");
    }

    #[test]
    fn refuses_anything_that_could_leave_the_inbox() {
        assert!(is_plain_name("1760000000000-0__words.json"));
        for bad in ["", ".", "..", "../secrets", "a/b.json", "a\\b.json", "/etc/passwd"] {
            assert!(!is_plain_name(bad), "{bad:?} should be refused");
        }
    }
}

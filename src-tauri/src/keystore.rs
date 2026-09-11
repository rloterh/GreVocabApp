//! Credentials in the OS keychain rather than `localStorage`.
//!
//! On desktop there is somewhere genuinely better than a JSON blob on disk:
//! the platform credential store, which is encrypted at rest and scoped to the
//! user account. The browser has no equivalent, and the app says so there
//! rather than implying a safety it does not have.
//!
//! See docs/adr/0010-secrets-handling.md.

use keyring::Entry;

/// One service name for the whole app, so a user can find and revoke these.
const SERVICE: &str = "com.lexicon.app";

/// Credential names this app may touch.
///
/// An allowlist, so a compromised frontend cannot turn these commands into a
/// way to read arbitrary entries out of the user's keychain — which would be a
/// far worse hole than the one this feature closes.
const ALLOWED_KEYS: &[&str] = &[
    "anthropicApiKey",
    "openaiApiKey",
    "groqApiKey",
    "openrouterApiKey",
    "googleApiKey",
    "customApiKey",
];

fn entry(key: &str) -> Result<Entry, String> {
    if !ALLOWED_KEYS.contains(&key) {
        return Err(format!("{key} is not a credential this app stores"));
    }
    Entry::new(SERVICE, key).map_err(|e| format!("keychain unavailable: {e}"))
}

/// Store a credential. An empty value deletes it.
#[tauri::command]
pub fn set_secret(key: String, value: String) -> Result<(), String> {
    let entry = entry(&key)?;
    if value.is_empty() {
        // Deleting an absent entry is success, not failure.
        return match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("could not clear {key}: {e}")),
        };
    }
    entry
        .set_password(&value)
        .map_err(|e| format!("could not save {key}: {e}"))
}

/// Read a credential, or `None` if it was never stored.
#[tauri::command]
pub fn get_secret(key: String) -> Result<Option<String>, String> {
    match entry(&key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("could not read {key}: {e}")),
    }
}

/// Remove a credential.
#[tauri::command]
pub fn delete_secret(key: String) -> Result<(), String> {
    match entry(&key)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("could not delete {key}: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_known_credentials_are_addressable() {
        assert!(entry("anthropicApiKey").is_ok());
        // The allowlist is the security boundary: without it these commands
        // would read any entry in the user's keychain.
        for key in [
            "",
            "ssh-key",
            "../../other-service",
            "GitHub",
            "anthropicApiKey ",
        ] {
            assert!(entry(key).is_err(), "{key} should be rejected");
        }
    }

    #[test]
    fn every_allowed_key_is_a_credential_name() {
        assert!(ALLOWED_KEYS.iter().all(|k| k.ends_with("ApiKey")));
    }
}

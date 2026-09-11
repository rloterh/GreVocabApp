/**
 * Where a credential lives, per platform.
 *
 * Desktop has the OS keychain — encrypted at rest, scoped to the user account.
 * The browser has nothing better than `localStorage`, and the UI says so rather
 * than implying a safety that is not there.
 *
 * See docs/adr/0010-secrets-handling.md.
 */

import { isTauri } from "@/lib/utils";
import { Secret } from "@/lib/secrets";

export type SecretKey =
  | "anthropicApiKey"
  | "openaiApiKey"
  | "groqApiKey"
  | "openrouterApiKey"
  | "googleApiKey"
  | "customApiKey";

/** Where credentials are being kept right now. Shown to the user. */
export type KeystoreKind = "keychain" | "browser";

export function keystoreKind(): KeystoreKind {
  return isTauri() ? "keychain" : "browser";
}

/** Prefix for the browser fallback, kept distinct from the settings blob. */
const WEB_PREFIX = "lexicon.secret.";

export async function getSecret(key: SecretKey): Promise<Secret | null> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const value = await invoke<string | null>("get_secret", { key });
      return value ? new Secret(value) : null;
    } catch (error) {
      // A keychain that refuses to open is worth surfacing in the console, but
      // must not stop the app: the user can still use a local provider.
      console.warn(`keychain read failed for ${key}`, error);
      return null;
    }
  }
  const value = readWeb(key);
  return value ? new Secret(value) : null;
}

export async function setSecret(key: SecretKey, value: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_secret", { key, value });
    return;
  }
  if (value) {
    localStorage.setItem(WEB_PREFIX + key, value);
  } else {
    localStorage.removeItem(WEB_PREFIX + key);
  }
}

export async function deleteSecret(key: SecretKey): Promise<void> {
  await setSecret(key, "");
}

/**
 * Move a credential out of the old settings blob.
 *
 * Before ADR 0010 the Anthropic key lived in `lexicon.settings.v1`. Leaving a
 * copy there would mean the keychain was an addition rather than a move — and
 * the old copy is the one that leaked into backups.
 *
 * Returns true if something was migrated, so the caller can say so.
 */
export async function migrateLegacySecrets(): Promise<boolean> {
  let migrated = false;
  try {
    const raw = localStorage.getItem("lexicon.settings.v1");
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    const legacy = parsed.state?.anthropicApiKey;

    if (typeof legacy === "string" && legacy.trim()) {
      await setSecret("anthropicApiKey", legacy);
      delete parsed.state!.anthropicApiKey;
      localStorage.setItem("lexicon.settings.v1", JSON.stringify(parsed));
      migrated = true;
    }
  } catch (error) {
    // A failed migration must not brick startup. The key stays where it was,
    // which is no worse than before this ran.
    console.warn("could not migrate the stored API key", error);
  }
  return migrated;
}

function readWeb(key: SecretKey): string | null {
  try {
    return localStorage.getItem(WEB_PREFIX + key);
  } catch {
    return null;
  }
}

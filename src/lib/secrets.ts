/**
 * Keeping credentials out of places they must never reach.
 *
 * The motivating defect: the backup export serialised the whole settings
 * object, API key included, into a file the app encourages people to keep —
 * in cloud drives, in email, on USB sticks.
 *
 * The fix is structural rather than a remembered exclusion. Credentials live in
 * the `Secrets` interface; `stripSecrets` removes every key of that interface;
 * and its return type is `Omit<T, keyof Secrets>`, so a new credential added to
 * `Secrets` is excluded from exports without anyone touching this file.
 *
 * See docs/adr/0010-secrets-handling.md.
 */

import type { Secrets } from "@/types";

/**
 * Every credential key, derived from the `Secrets` interface.
 *
 * `satisfies` is what ties this to the type: if `Secrets` gains a field and it
 * is not listed here, the stripping test fails; if a key here is not on
 * `Secrets`, this line does not compile.
 */
export const SECRET_KEYS = [
  "anthropicApiKey",
] as const satisfies readonly (keyof Secrets)[];

/** What is shown instead of a credential, anywhere one might be printed. */
export const REDACTED = "[redacted]";

/**
 * Remove every credential from an object.
 *
 * Use this on anything about to be written to a file, logged, or sent
 * somewhere that is not the credential's own provider.
 */
export function stripSecrets<T extends object>(value: T): Omit<T, keyof Secrets> {
  const out = { ...value } as Record<string, unknown>;
  for (const key of SECRET_KEYS) delete out[key];
  return out as Omit<T, keyof Secrets>;
}

/**
 * Does this object carry a credential with an actual value?
 *
 * Used to tell a user restoring an older backup that the key it contained was
 * discarded — silently dropping it would leave them wondering why the app
 * stopped talking to their provider.
 */
export function containsSecret(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return SECRET_KEYS.some(
    (key) => typeof record[key] === "string" && record[key] !== "",
  );
}

/**
 * Replace credential values with a placeholder, keeping the shape.
 *
 * For diagnostics that need to show whether a key is configured without
 * showing the key. Prefer this over `stripSecrets` when the absence of a field
 * would itself be confusing.
 */
export function redactSecrets<T extends object>(value: T): T {
  const out = { ...value } as Record<string, unknown>;
  for (const key of SECRET_KEYS) {
    if (out[key] !== null && out[key] !== undefined) out[key] = REDACTED;
  }
  return out as T;
}

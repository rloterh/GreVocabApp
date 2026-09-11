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

/**
 * A credential that cannot be logged by accident.
 *
 * The failure this prevents: a key reaching a console, an error report or a
 * crash log because something stringified an object that happened to contain
 * it. `toString` and `toJSON` both redact, so `${secret}`,
 * `JSON.stringify({ secret })` and `console.log(config)` are all safe.
 *
 * Reading the value is deliberately a verb — `reveal()` — so the one place
 * that needs it is greppable.
 */
export class Secret {
  #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  /** The real value. Call this only at the point of use. */
  reveal(): string {
    return this.#value;
  }

  get isEmpty(): boolean {
    return this.#value.trim() === "";
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  /** Node's console.log uses this; without it, `#value` would be printed. */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return REDACTED;
  }
}

/**
 * A credential bound to the provider and host it belongs to.
 *
 * One OpenAI-compatible adapter serves nine endpoints, including any base URL
 * the user types. Binding means a key cannot be attached to a request to a
 * host it was not issued for — checked at the point of use rather than assumed
 * by the caller.
 */
export interface BoundSecret {
  providerId: string;
  /** Host this credential may be sent to, e.g. "api.openai.com". */
  host: string;
  secret: Secret;
}

/** Does this credential belong to the request about to be made? */
export function secretMatchesHost(bound: BoundSecret, url: string): boolean {
  try {
    return new URL(url).host.toLowerCase() === bound.host.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * The credential for this URL, or none.
 *
 * Returning nothing on a mismatch rather than throwing is deliberate: a local
 * provider legitimately has no credential, and the caller already handles
 * "no key" as a normal case.
 */
export function secretForUrl(
  bound: BoundSecret | undefined,
  url: string,
): string | undefined {
  if (!bound || bound.secret.isEmpty) return undefined;
  return secretMatchesHost(bound, url) ? bound.secret.reveal() : undefined;
}

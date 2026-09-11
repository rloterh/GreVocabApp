/**
 * Connecting to OpenRouter without typing a key.
 *
 * OpenRouter is the only provider of the seven measured in the spike that runs
 * a PKCE flow a third party can actually use: no client registration, no client
 * secret, and a loopback redirect. That matters for a desktop app, which has
 * nowhere to keep a secret — shipping one in the binary ships it to everyone.
 * See docs/adr/0007-authentication-strategy.md.
 *
 * What comes back is a **user-controlled API key**, not an expiring access
 * token. There is no refresh to build: it goes into the keychain beside a
 * pasted key and everything downstream treats it identically.
 *
 * This module is pure. It builds the URL, does the crypto, and parses the
 * exchange — how the authorization code gets back to the app differs between
 * desktop (a loopback listener in Rust) and web (a redirect), and that lives in
 * `src/hooks/useOpenRouterConnect.ts`.
 */

import { AiError } from "./errors";
import type { Transport } from "./transport";

/** Where the user is sent to approve. */
export const AUTHORIZE_URL = "https://openrouter.ai/auth";

/** Where the code is traded for a key. */
export const EXCHANGE_URL = "https://openrouter.ai/api/v1/auth/keys";

/**
 * The placeholder a desktop callback URL carries until a port is bound.
 *
 * The port is not known until Rust binds a listener, but the callback URL has
 * to be percent-encoded into the query string before then. A port is digits, so
 * substituting it into the already-encoded value is safe — which is why this is
 * a token rather than a URL built in two places.
 *
 * It is alphanumeric and underscored on purpose. `application/x-www-form-
 * urlencoded` leaves only `A-Za-z0-9*-._` alone, so a braced `{port}` arrives
 * at the other side as `%7Bport%7D`, the substitution in Rust silently fails to
 * match, and the browser is sent to a callback on a port nothing is listening
 * on — a flow that hangs until it times out, with nothing to show why.
 */
export const PORT_PLACEHOLDER = "__PORT__";

export interface PkcePair {
  /** Kept secret; proves at exchange that we began the flow. */
  verifier: string;
  /** Sent in the open; the SHA-256 of the verifier. */
  challenge: string;
}

/**
 * A verifier and its challenge.
 *
 * S256 only. OpenRouter also accepts `plain`, and falling back to it when
 * SHA-256 is unavailable would silently drop the property that makes PKCE worth
 * doing — an observer of the authorization request could replay the challenge.
 * Better to fail loudly somewhere it cannot happen anyway: both the Tauri
 * origin and `localhost` are secure contexts, so `crypto.subtle` is present.
 */
export async function createPkcePair(): Promise<PkcePair> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new AiError(
      "not-configured",
      "This browser cannot do the cryptography the sign-in needs. Paste a key instead.",
      { provider: "openrouter" },
    );
  }
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

/**
 * Where to send the user.
 *
 * `callbackUrl` may contain {@link PORT_PLACEHOLDER}; it survives encoding
 * intact so Rust can substitute the bound port.
 */
export function buildAuthUrl(callbackUrl: string, challenge: string): string {
  const params = new URLSearchParams({
    callback_url: callbackUrl,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Pull the authorization code out of a callback URL.
 *
 * Returns null when there is no code, which is the ordinary case for every
 * normal page load. A provider-reported `error` is thrown rather than ignored —
 * a user who declined should be told the flow stopped, not left watching a
 * spinner.
 */
export function codeFromCallback(url: string): string | null {
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return null;
  }
  const error = params.get("error");
  if (error) {
    throw new AiError(
      "unauthorized",
      params.get("error_description") ?? `OpenRouter refused the sign-in (${error}).`,
      { provider: "openrouter" },
    );
  }
  return params.get("code");
}

/**
 * Trade the code for a key.
 *
 * No client secret is sent, because the flow has no client to authenticate —
 * the verifier is what proves this is the same app that started it. Measured
 * against the live service during the spike.
 */
export async function exchangeCode(
  code: string,
  verifier: string,
  transport: Transport,
): Promise<string> {
  const response = await transport({
    url: EXCHANGE_URL,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: verifier,
      code_challenge_method: "S256",
    }),
    provider: "openrouter",
  });

  if (!response.ok) {
    throw new AiError("unauthorized", exchangeFailureMessage(response.text), {
      provider: "openrouter",
      status: response.status,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text);
  } catch {
    throw new AiError("malformed", "OpenRouter's reply was not JSON.", {
      provider: "openrouter",
      status: response.status,
    });
  }

  const key = (parsed as { key?: unknown } | null)?.key;
  if (typeof key !== "string" || !key.trim()) {
    throw new AiError("malformed", "OpenRouter's reply contained no key.", {
      provider: "openrouter",
      status: response.status,
    });
  }
  return key;
}

/**
 * The provider's own words where it gave any.
 *
 * A code that has expired is the most likely failure — they last ten minutes —
 * and "Invalid code" from OpenRouter is more useful than anything invented
 * here, so it is passed through rather than replaced.
 */
function exchangeFailureMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    const message = parsed?.error?.message;
    if (typeof message === "string" && message.trim()) {
      return `OpenRouter rejected the sign-in: ${message}.`;
    }
  } catch {
    // Not JSON. Fall through to the generic message.
  }
  return "OpenRouter rejected the sign-in. Codes expire after ten minutes — try connecting again.";
}

/** Base64url, per RFC 7636: no padding, URL-safe alphabet. */
function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

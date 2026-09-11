/**
 * The desktop transport.
 *
 * A browser cannot call `http://127.0.0.1:11434` from an app origin unless
 * Ollama opts in with CORS headers, which it does not by default. Requiring a
 * shell environment variable before the app works is not a feature.
 *
 * Tauri's HTTP plugin performs the request in Rust, where CORS does not apply.
 * Its allowlist lives in `src-tauri/capabilities/default.json` — loopback plus
 * the known provider hosts — so the scope is declared and audited by Tauri
 * rather than enforced by a hand-rolled proxy that could drift.
 *
 * See docs/adr/0003-rust-http-transport.md.
 */

import { AiError } from "./errors";
import { fetchTransport, DEFAULT_TIMEOUT_MS, type Transport } from "./transport";
import { isTauri } from "@/lib/utils";

/** Routes through Rust. Falls back to the browser transport off desktop. */
export const tauriTransport: Transport = async (request) => {
  if (!isTauri()) return fetchTransport(request);

  const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  request.signal?.addEventListener("abort", onAbort);

  try {
    const response = await tauriFetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => (headers[key] = value));
    return {
      status: response.status,
      ok: response.ok,
      text: await response.text(),
      headers,
    };
  } catch (error) {
    if (request.signal?.aborted) throw AiError.cancelled();
    if (controller.signal.aborted) {
      throw AiError.unreachable(
        request.provider,
        "That request timed out. The provider may be busy or unreachable.",
      );
    }
    // A URL outside the capability allowlist fails here. Saying so is more
    // useful than "network error", because the fix is a config change.
    throw AiError.unreachable(
      request.provider,
      describeFailure(request.url, error),
    );
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", onAbort);
  }
};

function describeFailure(url: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/not allowed|scope|forbidden/i.test(message)) {
    return `Requests to ${hostOf(url)} are not permitted by this build. Add it to the HTTP scope in capabilities.`;
  }
  if (/127\.0\.0\.1|localhost/.test(url)) {
    return "Could not reach the local server. Is it running?";
  }
  return "Could not reach the provider. Check your connection.";
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** The right transport for wherever this is running. */
export function platformTransport(): Transport {
  return isTauri() ? tauriTransport : fetchTransport;
}

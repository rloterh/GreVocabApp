/**
 * The HTTP seam.
 *
 * Two reasons this is an interface rather than a direct `fetch`:
 *
 * 1. **CORS.** A browser cannot call `http://127.0.0.1:11434` from an app
 *    origin unless Ollama opts in, which it does not by default. The desktop
 *    and mobile builds have a Rust process that is not subject to CORS, so
 *    they use a different transport. Adapters never know which.
 *    See docs/adr/0003-rust-http-transport.md.
 *
 * 2. **Tests.** Adapters take a transport, so the contract suite runs against
 *    a stub with no global patching. Stubbing `globalThis.fetch` works but
 *    leaks between tests and hides which call was made by whom.
 */

import { AiError } from "./errors";
import type { ProviderId } from "./types";

export interface HttpRequest {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  /** Who is calling, so failures can name a provider. */
  provider: ProviderId;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  /** Raw body. Adapters parse; the transport does not guess at content type. */
  text: string;
  headers: Record<string, string>;
}

export type Transport = (request: HttpRequest) => Promise<HttpResponse>;

/** How long any single provider call may take before we give up on it. */
export const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * The browser transport.
 *
 * Distinguishes "the server said no" from "nothing answered": a non-2xx is a
 * response and is returned for the adapter to map, while a network failure is
 * `unreachable` here, because no adapter can say anything more useful about it.
 */
export const fetchTransport: Transport = async (request) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  // Honour the caller's signal as well as our own timeout.
  const onAbort = () => controller.abort();
  request.signal?.addEventListener("abort", onAbort);

  try {
    const response = await fetch(request.url, {
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
    throw AiError.unreachable(request.provider, describeNetworkFailure(error));
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener("abort", onAbort);
  }
};

/**
 * A `fetch` rejection says almost nothing on purpose — the browser hides
 * whether a cross-origin request was refused, to avoid leaking network shape.
 * For a localhost provider that ambiguity has one overwhelmingly likely cause,
 * and saying so saves the user a long hunt.
 */
function describeNetworkFailure(error: unknown): string {
  const isLoopback = (message: string) =>
    message.includes("127.0.0.1") || message.includes("localhost");
  const message = error instanceof Error ? error.message : String(error);
  if (isLoopback(message)) {
    return "Could not reach the local server. Is it running, and does it allow browser origins?";
  }
  return "Could not reach the provider. Check your connection.";
}

/**
 * Read `Retry-After`, which providers give as either seconds or an HTTP date.
 */
export function retryAfterSeconds(
  headers: Record<string, string>,
): number | undefined {
  const raw = headers["retry-after"] ?? headers["Retry-After"];
  if (!raw) return undefined;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber >= 0) return Math.ceil(asNumber);
  const asDate = Date.parse(raw);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, Math.ceil((asDate - Date.now()) / 1000));
  }
  return undefined;
}

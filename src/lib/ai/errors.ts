/**
 * One error taxonomy for every provider.
 *
 * Nine providers failing nine different ways would push the branching into the
 * UI. Each adapter maps its own failures onto these kinds, so a caller can
 * respond sensibly without knowing who failed.
 *
 * Every kind answers "what should the user do now?" — a distinction with no
 * different answer does not deserve its own kind.
 *
 * See docs/AI-PROVIDERS.md.
 */

import type { ProviderId } from "./types";

export type AiErrorKind =
  /** No provider is usable at all. Offer setup. */
  | "not-configured"
  /** Key or token rejected. Point at settings. */
  | "unauthorized"
  /** Backed off by the provider. `retryAfterSeconds` when it said. */
  | "rate-limited"
  /** Too much input or too much asked for. Suggest a smaller batch. */
  | "context-exceeded"
  /** The model declined. `message` carries its reason where given. */
  | "refused"
  /** Nothing answered — local server stopped, network down, CLI missing. */
  | "unreachable"
  /** Output was not valid even after a repair attempt. */
  | "malformed"
  /** The caller aborted. Not a failure; do not report it as one. */
  | "cancelled";

export interface AiErrorOptions {
  provider?: ProviderId;
  /** HTTP status, where there was one. */
  status?: number;
  retryAfterSeconds?: number;
  cause?: unknown;
}

export class AiError extends Error {
  readonly kind: AiErrorKind;
  readonly provider?: ProviderId;
  readonly status?: number;
  readonly retryAfterSeconds?: number;

  constructor(kind: AiErrorKind, message: string, options: AiErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "AiError";
    this.kind = kind;
    this.provider = options.provider;
    this.status = options.status;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  /** True for failures where trying the same thing again could work. */
  get retryable(): boolean {
    return this.kind === "rate-limited" || this.kind === "unreachable";
  }

  static notConfigured(message = "No AI provider is available."): AiError {
    return new AiError("not-configured", message);
  }
  static unauthorized(provider: ProviderId, message?: string): AiError {
    return new AiError(
      "unauthorized",
      message ?? "That key was rejected. Check it in Settings.",
      { provider, status: 401 },
    );
  }
  static rateLimited(provider: ProviderId, retryAfterSeconds?: number): AiError {
    return new AiError(
      "rate-limited",
      retryAfterSeconds
        ? `Rate limited. Try again in ${retryAfterSeconds}s.`
        : "Rate limited by the provider. Try again shortly.",
      { provider, status: 429, retryAfterSeconds },
    );
  }
  static unreachable(provider: ProviderId, message?: string): AiError {
    return new AiError(
      "unreachable",
      message ?? "Could not reach that provider. Is it still running?",
      { provider },
    );
  }
  static malformed(provider: ProviderId, message: string): AiError {
    return new AiError("malformed", message, { provider });
  }
  static cancelled(): AiError {
    return new AiError("cancelled", "Cancelled.");
  }
}

/** Did this throw because the caller aborted? */
export function isAbort(error: unknown): boolean {
  if (error instanceof AiError) return error.kind === "cancelled";
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "AbortError"
  );
}

/**
 * Map an HTTP status onto a kind.
 *
 * Shared so that nine adapters cannot disagree about what a 429 means.
 */
export function errorFromStatus(
  provider: ProviderId,
  status: number,
  body: string,
  retryAfterSeconds?: number,
): AiError {
  const detail = extractMessage(body);
  if (status === 401 || status === 403) {
    return AiError.unauthorized(provider, detail);
  }
  if (status === 429) return AiError.rateLimited(provider, retryAfterSeconds);
  if (status === 413) {
    return new AiError("context-exceeded", detail ?? "Request too large.", {
      provider,
      status,
    });
  }
  if (status >= 500) {
    return AiError.unreachable(
      provider,
      detail ?? `The provider returned ${status}.`,
    );
  }
  return new AiError(
    "malformed",
    detail ?? `The provider returned ${status}.`,
    { provider, status },
  );
}

/**
 * Pull a human message out of an error body.
 *
 * Providers nest it differently — `{error:{message}}`, `{message}`, `{detail}`,
 * or plain text — and a caller should not have to care which.
 */
function extractMessage(body: string): string | undefined {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const nested = parsed.error;
    if (typeof nested === "string") return nested;
    if (nested && typeof nested === "object") {
      const message = (nested as Record<string, unknown>).message;
      if (typeof message === "string") return message;
    }
    for (const key of ["message", "detail", "error_message"]) {
      const value = parsed[key];
      if (typeof value === "string") return value;
    }
    return undefined;
  } catch {
    // Not JSON. A short plain-text body is still useful; a long one is noise.
    const trimmed = body.trim();
    return trimmed.length > 0 && trimmed.length <= 200 ? trimmed : undefined;
  }
}

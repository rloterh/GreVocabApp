/**
 * The last thing between a credential and the wire.
 *
 * ADR 0010 says a secret is "bound to a provider id and a base URL … checked
 * at the transport, not assumed by the caller". Until now it was checked where
 * the registry builds a provider, which is one layer too early: everything
 * downstream — an adapter bug, a mistyped base URL, a future provider that
 * forwards a request — could still put a key on a host it was never issued
 * for, and nothing would notice.
 *
 * This wraps a transport and refuses to send. It is deliberately a *refusal*
 * rather than a silent strip: a request that was going to carry a credential
 * somewhere unexpected is a bug, and quietly sending it unauthenticated would
 * turn that bug into a confusing 401 instead of an error naming the problem.
 *
 * It matters most for the OpenAI-compatible adapter, where one implementation
 * serves nine endpoints and a user-supplied base URL sits among them.
 */

import { AiError } from "./errors";
import type { HttpRequest, Transport } from "./transport";
import type { ProviderId } from "./types";

/** Headers that carry a credential, lowercased. */
const CREDENTIAL_HEADERS = [
  "authorization",
  "x-api-key",
  "api-key",
  "x-goog-api-key",
];

/** Where each provider's credential is allowed to go. */
export type HostBindings = Partial<Record<ProviderId, string>>;

/**
 * The hosts each cloud provider's key belongs to.
 *
 * Local providers are absent on purpose: they have no credential, and binding
 * loopback to a host would break a user who moved Ollama to another port.
 */
export const DEFAULT_BINDINGS: HostBindings = {
  anthropic: "api.anthropic.com",
  openai: "api.openai.com",
  groq: "api.groq.com",
  openrouter: "openrouter.ai",
  google: "generativelanguage.googleapis.com",
};

/** Does this request carry a credential at all? */
export function carriesCredential(request: HttpRequest): boolean {
  return Object.entries(request.headers).some(
    ([name, value]) =>
      CREDENTIAL_HEADERS.includes(name.toLowerCase()) && Boolean(value?.trim()),
  );
}

/** The host a URL addresses, lowercased, or null if it is not a URL. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Wrap a transport so credentials cannot reach the wrong host.
 *
 * A request with no credential passes untouched — that is every local provider
 * and every detection probe, and they must not be made to care about this.
 */
export function guardCredentials(
  transport: Transport,
  bindings: HostBindings = DEFAULT_BINDINGS,
): Transport {
  return async (request) => {
    if (!carriesCredential(request)) return transport(request);

    const allowed = bindings[request.provider];
    // A provider with no binding — "custom", or a local server the user gave a
    // key to — is the user's own decision about their own endpoint. There is
    // nothing to compare it against, so there is nothing to enforce.
    if (!allowed) return transport(request);

    const target = hostOf(request.url);
    if (target === null) {
      throw new AiError(
        "unreachable",
        `Refusing to send a credential to a malformed address: ${request.url}`,
        { provider: request.provider },
      );
    }

    if (target !== allowed.toLowerCase()) {
      // Named precisely, because the interesting case is a lookalike:
      // api.openai.com.evil.test reads as correct at a glance.
      throw new AiError(
        "unauthorized",
        `Refusing to send the ${request.provider} credential to ${target}; it is only valid for ${allowed}.`,
        { provider: request.provider },
      );
    }

    return transport(request);
  };
}

/**
 * @vitest-environment jsdom
 *
 * jsdom for `crypto.subtle`, `btoa` and `URL`. The transport is stubbed, so no
 * test here reaches the network — the live service was probed once, during the
 * spike, and the results are in docs/adr/0007-authentication-strategy.md.
 */

import { describe, expect, it, vi } from "vitest";
import {
  AUTHORIZE_URL,
  buildAuthUrl,
  codeFromCallback,
  createPkcePair,
  exchangeCode,
  EXCHANGE_URL,
  PORT_PLACEHOLDER,
} from "@/lib/ai/oauth";
import { AiError } from "@/lib/ai/errors";
import type { HttpRequest, HttpResponse, Transport } from "@/lib/ai/transport";

/** A transport that records what it was given and replies with a fixture. */
function stubTransport(response: Partial<HttpResponse>): {
  transport: Transport;
  calls: HttpRequest[];
} {
  const calls: HttpRequest[] = [];
  const transport: Transport = async (request) => {
    calls.push(request);
    return {
      status: 200,
      ok: true,
      text: "",
      headers: {},
      ...response,
    };
  };
  return { transport, calls };
}

describe("createPkcePair", () => {
  it("derives the challenge as the base64url SHA-256 of the verifier", async () => {
    const { verifier, challenge } = await createPkcePair();
    // Recomputed independently: if the challenge were derived wrongly, every
    // exchange would fail at the provider with nothing local to show why.
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(verifier),
    );
    const expected = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(challenge).toBe(expected);
  });

  it.each([
    ["verifier", (p: { verifier: string }) => p.verifier],
    ["challenge", (p: { challenge: string }) => p.challenge],
  ])("emits a url-safe, unpadded %s", async (_name, pick) => {
    const value = pick(await createPkcePair());
    // RFC 7636: base64url, no padding. A '+' or '/' would be mangled in a
    // query string and a '=' would be re-encoded.
    expect(value).toMatch(/^[A-Za-z0-9._~-]+$/);
    expect(value).not.toContain("=");
  });

  it("meets the RFC's length floor", async () => {
    const { verifier } = await createPkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it("is different every time", async () => {
    const pairs = await Promise.all([createPkcePair(), createPkcePair()]);
    // A reused verifier would let one intercepted authorization be replayed.
    expect(pairs[0].verifier).not.toBe(pairs[1].verifier);
  });

  it("refuses rather than silently downgrading when SHA-256 is missing", async () => {
    // `subtle` is getter-only, which is why this is a spy and not an assignment.
    const spy = vi
      .spyOn(globalThis.crypto, "subtle", "get")
      .mockReturnValue(undefined as unknown as SubtleCrypto);
    try {
      // OpenRouter accepts `plain`. Falling back to it would drop the only
      // property PKCE provides, quietly.
      await expect(createPkcePair()).rejects.toBeInstanceOf(AiError);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("buildAuthUrl", () => {
  const url = () =>
    new URL(buildAuthUrl(`http://localhost:${PORT_PLACEHOLDER}/callback`, "CHAL"));

  it("points at the authorize endpoint", () => {
    expect(buildAuthUrl("http://localhost:1/cb", "C").startsWith(AUTHORIZE_URL)).toBe(
      true,
    );
    expect(url().origin + url().pathname).toBe(AUTHORIZE_URL);
  });

  it("carries the challenge and declares S256", () => {
    expect(url().searchParams.get("code_challenge")).toBe("CHAL");
    expect(url().searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("encodes the callback so it survives as one parameter", () => {
    expect(url().searchParams.get("callback_url")).toBe(
      `http://localhost:${PORT_PLACEHOLDER}/callback`,
    );
    // The ':' and '/' must be escaped in the raw query, or the callback is
    // truncated at the first delimiter.
    expect(url().search).toContain("callback_url=http%3A%2F%2Flocalhost");
  });

  it("keeps the port placeholder intact through encoding", () => {
    // The bug this caught: form-encoding escapes braces, so a `{port}` token
    // reached Rust as `%7Bport%7D`, the substitution silently did nothing, and
    // the browser was sent to a callback on a port nothing was listening on.
    // The flow then hung until it timed out, with nothing to show why.
    expect(url().search).toContain(PORT_PLACEHOLDER);
    expect(url().search).not.toContain("%7B");
  });

  it("sends no client id or secret", () => {
    // The spike's central finding: this flow needs neither, which is what
    // makes it usable from a binary that ships to everyone.
    expect(url().search).not.toContain("client_id");
    expect(url().search).not.toContain("client_secret");
  });
});

describe("codeFromCallback", () => {
  it("finds the code", () => {
    expect(codeFromCallback("http://localhost:51423/callback?code=abc")).toBe("abc");
  });

  it.each([
    ["no query at all", "http://localhost:51423/callback"],
    ["other parameters only", "http://localhost:51423/callback?state=1"],
    ["not a url", "::::"],
  ])("returns null for %s", (_name, url) => {
    // Every ordinary page load takes this path; it must not throw.
    expect(codeFromCallback(url)).toBeNull();
  });

  it("throws when the provider reported an error", () => {
    expect(() =>
      codeFromCallback("http://localhost:1/callback?error=access_denied"),
    ).toThrow(AiError);
  });

  it("prefers the provider's description of the error", () => {
    expect(() =>
      codeFromCallback(
        "http://localhost:1/callback?error=access_denied&error_description=You%20declined",
      ),
    ).toThrow(/You declined/);
  });
});

describe("exchangeCode", () => {
  it("returns the key", async () => {
    const { transport } = stubTransport({ text: JSON.stringify({ key: "sk-or-v1-x" }) });
    expect(await exchangeCode("CODE", "VERIFIER", transport)).toBe("sk-or-v1-x");
  });

  it("posts the code and verifier to the exchange endpoint", async () => {
    const { transport, calls } = stubTransport({
      text: JSON.stringify({ key: "k" }),
    });
    await exchangeCode("CODE", "VERIFIER", transport);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(EXCHANGE_URL);
    expect(calls[0].method).toBe("POST");
    expect(JSON.parse(calls[0].body!)).toEqual({
      code: "CODE",
      code_verifier: "VERIFIER",
      code_challenge_method: "S256",
    });
  });

  it("sends no client secret", async () => {
    const { transport, calls } = stubTransport({
      text: JSON.stringify({ key: "k" }),
    });
    await exchangeCode("CODE", "VERIFIER", transport);
    const sent = calls[0].body! + JSON.stringify(calls[0].headers);
    expect(sent).not.toMatch(/client_secret|Authorization/i);
  });

  it("attributes the call to OpenRouter so a failure can name it", async () => {
    const { transport, calls } = stubTransport({
      text: JSON.stringify({ key: "k" }),
    });
    await exchangeCode("C", "V", transport);
    expect(calls[0].provider).toBe("openrouter");
  });

  it("passes through the provider's reason for refusing", async () => {
    const { transport } = stubTransport({
      ok: false,
      status: 400,
      text: JSON.stringify({ error: { message: "Invalid code", code: 400 } }),
    });
    // This is the exact body the live service returned during the spike, and
    // "Invalid code" is more useful to the user than anything invented here.
    await expect(exchangeCode("C", "V", transport)).rejects.toThrow(/Invalid code/);
  });

  it("explains the likely cause when the provider says nothing useful", async () => {
    const { transport } = stubTransport({ ok: false, status: 500, text: "<html>" });
    await expect(exchangeCode("C", "V", transport)).rejects.toThrow(/ten minutes/);
  });

  it.each([
    ["a non-JSON body", "not json at all"],
    ["JSON with no key", JSON.stringify({ ok: true })],
    ["a key of the wrong type", JSON.stringify({ key: 42 })],
    ["an empty key", JSON.stringify({ key: "  " })],
  ])("rejects %s rather than storing it", async (_name, text) => {
    const { transport } = stubTransport({ text });
    // Storing a non-key would leave the UI saying "Connected" over something
    // that fails on the next request.
    await expect(exchangeCode("C", "V", transport)).rejects.toBeInstanceOf(AiError);
  });

  it("reports failures as unauthorized, which points the user at reconnecting", async () => {
    const { transport } = stubTransport({ ok: false, status: 400, text: "{}" });
    await expect(exchangeCode("C", "V", transport)).rejects.toMatchObject({
      kind: "unauthorized",
      provider: "openrouter",
    });
  });

  it("never lets the key reach the console through the error path", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { transport } = stubTransport({ text: JSON.stringify({ key: "sk-or-secret" }) });
    await exchangeCode("C", "V", transport);
    for (const spy of [warn, log]) {
      expect(spy.mock.calls.flat().join(" ")).not.toContain("sk-or-secret");
    }
    vi.restoreAllMocks();
  });
});

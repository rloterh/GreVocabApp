import { describe, expect, it, vi } from "vitest";
import {
  carriesCredential,
  DEFAULT_BINDINGS,
  guardCredentials,
  hostOf,
} from "@/lib/ai/credential-guard";
import { AiError } from "@/lib/ai/errors";
import type { HttpRequest, Transport } from "@/lib/ai/transport";
import type { ProviderId } from "@/lib/ai/types";

function request(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return {
    url: "https://api.openai.com/v1/chat/completions",
    method: "POST",
    headers: { authorization: "Bearer sk-secret" },
    provider: "openai" as ProviderId,
    ...overrides,
  };
}

/** A transport that records what reached it. */
function spyTransport() {
  const sent: HttpRequest[] = [];
  const transport: Transport = async (r) => {
    sent.push(r);
    return { status: 200, ok: true, text: "{}", headers: {} };
  };
  return { transport, sent };
}

describe("recognising a credential", () => {
  it.each([
    ["authorization", { authorization: "Bearer x" }],
    ["x-api-key", { "x-api-key": "sk-ant-x" }],
    ["api-key", { "api-key": "x" }],
    ["x-goog-api-key", { "x-goog-api-key": "x" }],
    ["a differently cased header", { Authorization: "Bearer x" }],
  ])("sees %s", (_name, headers) => {
    expect(carriesCredential(request({ headers }))).toBe(true);
  });

  it.each([
    ["no headers", {}],
    ["only content-type", { "content-type": "application/json" }],
    ["an empty credential", { authorization: "" }],
    ["a whitespace credential", { authorization: "   " }],
  ])("does not see one in %s", (_name, headers) => {
    expect(carriesCredential(request({ headers }))).toBe(false);
  });
});

describe("guarding the wire", () => {
  it("lets a credential through to the host it belongs to", async () => {
    const { transport, sent } = spyTransport();
    await guardCredentials(transport)(request());
    expect(sent).toHaveLength(1);
  });

  it("refuses a credential bound elsewhere", async () => {
    const { transport, sent } = spyTransport();
    const guarded = guardCredentials(transport);
    await expect(
      guarded(request({ url: "https://evil.example.com/v1/chat" })),
    ).rejects.toBeInstanceOf(AiError);
    // Refused, not stripped and sent anyway.
    expect(sent).toHaveLength(0);
  });

  it("refuses a lookalike host", async () => {
    // The case the whole module is for: this reads as correct at a glance.
    const { transport, sent } = spyTransport();
    await expect(
      guardCredentials(transport)(
        request({ url: "https://api.openai.com.evil.test/v1/chat" }),
      ),
    ).rejects.toThrow(/only valid for api\.openai\.com/);
    expect(sent).toHaveLength(0);
  });

  it("names both hosts, so the error is actionable", async () => {
    const { transport } = spyTransport();
    await expect(
      guardCredentials(transport)(request({ url: "https://elsewhere.test/v1" })),
    ).rejects.toThrow(/elsewhere\.test[\s\S]*api\.openai\.com/);
  });

  it("refuses a malformed address rather than guessing", async () => {
    const { transport, sent } = spyTransport();
    await expect(
      guardCredentials(transport)(request({ url: "not a url" })),
    ).rejects.toBeInstanceOf(AiError);
    expect(sent).toHaveLength(0);
  });

  it("catches an Anthropic key pointed at OpenAI", async () => {
    // One adapter serves nine endpoints; this is the mix-up that matters.
    const { transport, sent } = spyTransport();
    await expect(
      guardCredentials(transport)(
        request({
          provider: "anthropic" as ProviderId,
          url: "https://api.openai.com/v1/chat",
          headers: { "x-api-key": "sk-ant-secret" },
        }),
      ),
    ).rejects.toThrow(/api\.anthropic\.com/);
    expect(sent).toHaveLength(0);
  });

  it("ignores port and path, comparing only the host", async () => {
    const { transport, sent } = spyTransport();
    await guardCredentials(transport)(
      request({ url: "https://api.openai.com/v1/anything/else?x=1" }),
    );
    expect(sent).toHaveLength(1);
  });

  it("is case-insensitive about the host", async () => {
    const { transport, sent } = spyTransport();
    await guardCredentials(transport)(
      request({ url: "https://API.OpenAI.COM/v1/chat" }),
    );
    expect(sent).toHaveLength(1);
  });
});

describe("what it deliberately does not guard", () => {
  it("passes a request with no credential straight through", async () => {
    // Every local provider and every detection probe. They must not be made
    // to care about any of this.
    const { transport, sent } = spyTransport();
    await guardCredentials(transport)(
      request({
        url: "http://127.0.0.1:11434/v1/models",
        headers: { "content-type": "application/json" },
        provider: "ollama" as ProviderId,
      }),
    );
    expect(sent).toHaveLength(1);
  });

  it("allows a credential for a provider with no binding", async () => {
    // A user-supplied endpoint is the user's own decision about their own
    // server. There is nothing to compare it against.
    const { transport, sent } = spyTransport();
    await guardCredentials(transport)(
      request({
        provider: "custom" as ProviderId,
        url: "https://my-own-llm.example.com/v1/chat",
      }),
    );
    expect(sent).toHaveLength(1);
  });

  it("does not alter the request it forwards", async () => {
    const { transport, sent } = spyTransport();
    const original = request();
    await guardCredentials(transport)(original);
    expect(sent[0]).toEqual(original);
  });
});

describe("the bindings themselves", () => {
  it("binds every cloud provider that takes a key", () => {
    for (const id of ["anthropic", "openai", "groq", "openrouter", "google"]) {
      expect(DEFAULT_BINDINGS[id as ProviderId], id).toBeTruthy();
    }
  });

  it("binds no local provider", () => {
    // Binding loopback to a host would break a user who moved Ollama.
    for (const id of ["ollama", "lmstudio", "llamacpp", "custom", "cli"]) {
      expect(DEFAULT_BINDINGS[id as ProviderId], id).toBeUndefined();
    }
  });

  it("names bare hosts, not URLs", () => {
    for (const host of Object.values(DEFAULT_BINDINGS)) {
      expect(host).not.toMatch(/^https?:|\//);
    }
  });
});

describe("hostOf", () => {
  it("lowercases", () => {
    expect(hostOf("https://API.Example.COM/x")).toBe("api.example.com");
  });

  it("keeps the port, which is part of the host", () => {
    expect(hostOf("http://127.0.0.1:11434/x")).toBe("127.0.0.1:11434");
  });

  it("returns null rather than throwing", () => {
    expect(hostOf("nonsense")).toBeNull();
  });
});

describe("the credential never reaches a log", () => {
  it("is not in the refusal message", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { transport } = spyTransport();
    const error = await guardCredentials(transport)(
      request({ url: "https://evil.test/v1" }),
    ).catch((e: Error) => e);
    expect(String(error)).not.toContain("sk-secret");
    expect(warn.mock.calls.flat().join(" ")).not.toContain("sk-secret");
    vi.restoreAllMocks();
  });
});

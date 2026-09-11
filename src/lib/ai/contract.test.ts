/**
 * The provider contract.
 *
 * One suite, run against every adapter. A new provider is not done until it
 * passes this unchanged — which is what stops nine adapters from disagreeing
 * about what a 429 means or whether validation runs.
 *
 * Everything here goes through a stub transport. These tests verify *our* side
 * of the contract; they never assert anything about a model's output quality.
 */

import { describe, expect, it, vi } from "vitest";
import { AiError } from "@/lib/ai/errors";
import type { HttpRequest, HttpResponse, Transport } from "@/lib/ai/transport";
import type { Provider, StructuredRequest } from "@/lib/ai/types";
import { OpenAiCompatibleProvider } from "@/lib/ai/providers/openai-compatible";
import { AnthropicProvider } from "@/lib/ai/providers/anthropic";

/** A transport that returns canned responses and records what it was asked. */
function stubTransport(
  responses: Array<Partial<HttpResponse>> | Partial<HttpResponse>,
) {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const calls: HttpRequest[] = [];
  const transport: Transport = vi.fn(async (request: HttpRequest) => {
    calls.push(request);
    const next = queue.length > 1 ? queue.shift()! : queue[0];
    return {
      status: next.status ?? 200,
      ok: next.ok ?? (next.status ?? 200) < 400,
      text: next.text ?? "",
      headers: next.headers ?? {},
    };
  });
  return { transport, calls };
}

/** The shape every structured test asks for. */
const SCHEMA = {
  type: "object",
  properties: { word: { type: "string" } },
  required: ["word"],
  additionalProperties: false,
};

interface Word {
  word: string;
}

function request(overrides: Partial<StructuredRequest<Word>> = {}) {
  return {
    name: "emit_word",
    prompt: "Give me a word.",
    schema: SCHEMA,
    validate: (value: unknown): Word => {
      const v = value as Record<string, unknown>;
      if (!v || typeof v.word !== "string") {
        throw new Error("word must be a string");
      }
      return { word: v.word };
    },
    ...overrides,
  } satisfies StructuredRequest<Word>;
}

/** How each adapter expresses a successful structured reply. */
interface Subject {
  name: string;
  make: (transport: Transport, apiKey?: string) => Provider;
  /** A body carrying `{ word: "abate" }` as that provider would return it. */
  structuredBody: string;
  /**
   * The same shape but with a wrong-typed field, to prove validation runs.
   * Spelled out per adapter rather than patched into `structuredBody` by
   * string replacement — the OpenAI shape escapes its payload, so a naive
   * replace silently matched nothing and the test passed vacuously.
   */
  wrongTypeBody: string;
  /** A body carrying plain text. */
  textBody: (text: string) => string;
  /** Whether this adapter needs a key to do anything. */
  requiresKey: boolean;
}

const SUBJECTS: Subject[] = [
  {
    name: "OpenAI-compatible (cloud, json_schema)",
    make: (transport, apiKey = "sk-test") =>
      new OpenAiCompatibleProvider(
        {
          id: "openai",
          label: "OpenAI",
          tier: 6,
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-test",
          apiKey,
          requiresKey: true,
          onDevice: false,
          supportsJsonSchema: true,
        },
        transport,
      ),
    structuredBody: JSON.stringify({
      choices: [{ message: { content: '{"word":"abate"}' } }],
    }),
    wrongTypeBody: JSON.stringify({
      choices: [{ message: { content: '{"word":42}' } }],
    }),
    textBody: (text) =>
      JSON.stringify({ choices: [{ message: { content: text } }] }),
    requiresKey: true,
  },
  {
    name: "OpenAI-compatible (local, prompt-only)",
    make: (transport) =>
      new OpenAiCompatibleProvider(
        {
          id: "ollama",
          label: "Ollama",
          tier: 2,
          baseUrl: "http://127.0.0.1:11434/v1",
          model: "llama3.2",
          requiresKey: false,
          onDevice: true,
          supportsJsonSchema: false,
        },
        transport,
      ),
    structuredBody: JSON.stringify({
      choices: [{ message: { content: '{"word":"abate"}' } }],
    }),
    wrongTypeBody: JSON.stringify({
      choices: [{ message: { content: '{"word":42}' } }],
    }),
    textBody: (text) =>
      JSON.stringify({ choices: [{ message: { content: text } }] }),
    requiresKey: false,
  },
  {
    name: "Anthropic (strict tool)",
    make: (transport, apiKey = "sk-ant-test") =>
      new AnthropicProvider({ apiKey }, transport),
    structuredBody: JSON.stringify({
      stop_reason: "tool_use",
      content: [
        { type: "text", text: "here you go" },
        { type: "tool_use", name: "emit_word", input: { word: "abate" } },
      ],
    }),
    wrongTypeBody: JSON.stringify({
      stop_reason: "tool_use",
      content: [
        { type: "tool_use", name: "emit_word", input: { word: 42 } },
      ],
    }),
    textBody: (text) =>
      JSON.stringify({ content: [{ type: "text", text }] }),
    requiresKey: true,
  },
];

describe.each(SUBJECTS)("provider contract: $name", (subject) => {
  it("reports its identity and tier", () => {
    const { transport } = stubTransport({});
    const provider = subject.make(transport);
    expect(provider.id).toBeTruthy();
    expect(provider.label).toBeTruthy();
    expect(provider.tier).toBeGreaterThanOrEqual(1);
    expect(provider.tier).toBeLessThanOrEqual(6);
  });

  it("describes its capabilities", () => {
    const { transport } = stubTransport({});
    const caps = subject.make(transport).capabilities();
    expect(["schema", "tool", "grammar", "prompt-only"]).toContain(
      caps.structuredOutput,
    );
    expect(caps.maxOutputTokens).toBeGreaterThan(0);
    expect(caps.contextTokens).toBeGreaterThan(0);
    expect(typeof caps.onDevice).toBe("boolean");
  });

  it("returns a validated result", async () => {
    const { transport } = stubTransport({ text: subject.structuredBody });
    const result = await subject.make(transport).completeStructured(request());
    expect(result).toEqual({ word: "abate" });
  });

  it("attributes plain completions to itself", async () => {
    const { transport } = stubTransport({ text: subject.textBody("hello") });
    const provider = subject.make(transport);
    const response = await provider.complete({ prompt: "hi" });
    expect(response.text).toBe("hello");
    expect(response.provider).toBe(provider.id);
  });

  it("never throws from detect()", async () => {
    const transport: Transport = vi.fn(async () => {
      throw new Error("network on fire");
    });
    await expect(subject.make(transport).detect()).resolves.toBeTruthy();
  });

  it("reports needs-setup rather than available without a key", async () => {
    if (!subject.requiresKey) return;
    const { transport } = stubTransport({});
    await expect(subject.make(transport, "").detect()).resolves.toBe(
      "needs-setup",
    );
  });

  it.each([
    [401, "unauthorized"],
    [403, "unauthorized"],
    [429, "rate-limited"],
    [500, "unreachable"],
    [503, "unreachable"],
  ])("maps HTTP %i to %s", async (status, kind) => {
    const { transport } = stubTransport({ status, ok: false, text: "{}" });
    const error = await subject
      .make(transport)
      .completeStructured(request())
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiError);
    expect((error as AiError).kind).toBe(kind);
  });

  it("surfaces the provider's own error message", async () => {
    const { transport } = stubTransport({
      status: 401,
      ok: false,
      text: JSON.stringify({ error: { message: "invalid key, friend" } }),
    });
    const error = await subject
      .make(transport)
      .completeStructured(request())
      .catch((e: unknown) => e);
    expect((error as AiError).message).toContain("invalid key, friend");
  });

  it("carries Retry-After on a 429", async () => {
    const { transport } = stubTransport({
      status: 429,
      ok: false,
      text: "{}",
      headers: { "retry-after": "30" },
    });
    const error = await subject
      .make(transport)
      .completeStructured(request())
      .catch((e: unknown) => e);
    expect((error as AiError).retryAfterSeconds).toBe(30);
    expect((error as AiError).retryable).toBe(true);
  });

  it("validates even when the provider claims to enforce a schema", async () => {
    // A reply of the right shape but the wrong type must still be rejected,
    // however confidently the provider claims to enforce a schema.
    const { transport } = stubTransport({ text: subject.wrongTypeBody });
    const error = await subject
      .make(transport)
      .completeStructured(request())
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiError);
    expect((error as AiError).kind).toBe("malformed");
  });

  it("names itself on every error", async () => {
    const { transport } = stubTransport({ status: 500, ok: false, text: "{}" });
    const provider = subject.make(transport);
    const error = await provider
      .completeStructured(request())
      .catch((e: unknown) => e);
    expect((error as AiError).provider).toBe(provider.id);
  });

  it("passes the abort signal through to the transport", async () => {
    const { transport, calls } = stubTransport({
      text: subject.structuredBody,
    });
    const controller = new AbortController();
    await subject
      .make(transport)
      .completeStructured(request({ signal: controller.signal }));
    expect(calls.at(-1)?.signal).toBe(controller.signal);
  });

  it("sends no credential it was not given", async () => {
    const { transport, calls } = stubTransport({
      text: subject.structuredBody,
    });
    await subject.make(transport, "sk-secret-value").completeStructured(request());
    const sent = JSON.stringify(calls.at(-1));
    if (subject.requiresKey) {
      expect(sent).toContain("sk-secret-value");
    } else {
      // A local provider must not invent an Authorization header.
      expect(sent).not.toContain("authorization");
    }
  });
});

describe("prompt-only providers repair their own output", () => {
  const make = (transport: Transport) =>
    new OpenAiCompatibleProvider(
      {
        id: "ollama",
        label: "Ollama",
        tier: 2,
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "llama3.2",
        requiresKey: false,
        onDevice: true,
        supportsJsonSchema: false,
      },
      transport,
    );
  const reply = (content: string) =>
    JSON.stringify({ choices: [{ message: { content } }] });

  it("puts the schema in the prompt", async () => {
    const { transport, calls } = stubTransport({
      text: reply('{"word":"abate"}'),
    });
    await make(transport).completeStructured(request());
    expect(calls[0].body).toContain("additionalProperties");
  });

  it("strips code fences a chat model adds anyway", async () => {
    const { transport } = stubTransport({
      text: reply('```json\n{"word":"abate"}\n```'),
    });
    await expect(
      make(transport).completeStructured(request()),
    ).resolves.toEqual({ word: "abate" });
  });

  it("retries once with the validator's reason, then succeeds", async () => {
    const { transport, calls } = stubTransport([
      { text: reply('{"word":42}') },
      { text: reply('{"word":"abate"}') },
    ]);
    await expect(
      make(transport).completeStructured(request()),
    ).resolves.toEqual({ word: "abate" });
    expect(calls).toHaveLength(2);
    // The model must be shown what was wrong, in its own words.
    expect(calls[1].body).toContain("word must be a string");
  });

  it("gives up after one repair rather than looping", async () => {
    const { transport, calls } = stubTransport({ text: reply('{"word":42}') });
    const error = await make(transport)
      .completeStructured(request())
      .catch((e: unknown) => e);
    expect((error as AiError).kind).toBe("malformed");
    expect((error as AiError).message).toContain("even after being shown");
    expect(calls).toHaveLength(2);
  });
});

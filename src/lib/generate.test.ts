import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateMonth, toMonth, WORDS_PER_DAY } from "@/lib/generate";
import { parseVocabMonth } from "@/lib/vocabulary";

/**
 * There is no API key here, so these tests stub fetch. That still pins the
 * things most likely to break silently: the request we send, and what the user
 * is told when the call goes wrong.
 */

const word = (n: number) => ({
  word: `word${n}`,
  partOfSpeech: "noun",
  definition: `Definition ${n}.`,
  example: `An example using word${n}.`,
  mnemonic: `Mnemonic ${n}.`,
  synonyms: ["a", "b"],
  antonyms: ["c"],
});

const BASE = {
  apiKey: "sk-test",
  topic: "GRE verbs",
  wordCount: 3,
  monthKey: "2026-07",
};

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: {
    model: string;
    max_tokens: number;
    output_config?: { effort?: string };
    thinking?: Record<string, unknown>;
    tools: Array<{
      name: string;
      strict: boolean;
      input_schema: {
        additionalProperties: boolean;
        properties: {
          words: { items: { additionalProperties: boolean; required: string[] } };
        };
      };
    }>;
    tool_choice: unknown;
    messages: Array<{ role: string; content: string }>;
  };
}

let captured: Captured | null = null;

/** Point fetch at a canned response and record what was sent. */
function stubFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      captured = {
        url,
        headers: init.headers as Record<string, string>,
        body: JSON.parse(init.body as string),
      };
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      } as Response;
    }),
  );
}

const toolUse = (words: unknown[]) => ({
  stop_reason: "tool_use",
  content: [
    { type: "text", text: "here you go" },
    { type: "tool_use", name: "emit_vocabulary", input: { words } },
  ],
});

beforeEach(() => {
  captured = null;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("toMonth — day layout happens in code, not in the prompt", () => {
  it("fills days three words at a time", () => {
    const m = toMonth([1, 2, 3, 4, 5, 6, 7].map(word), "2026-07", "topic");
    expect(WORDS_PER_DAY).toBe(3);
    expect(m.days.map((d) => d.day)).toEqual([1, 2, 3]);
    expect(m.days.map((d) => d.words.length)).toEqual([3, 3, 1]);
  });

  it("gives words the same id rule as every other import path", () => {
    const m = toMonth([word(1)], "2026-07", "topic");
    expect(m.days[0].words[0].id).toBe("2026-07-word1");
  });

  it("lays 90 words across 30 full days", () => {
    const m = toMonth(
      Array.from({ length: 90 }, (_, i) => word(i)),
      "2026-08",
      "topic",
    );
    expect(m.days).toHaveLength(30);
    expect(m.days.every((d) => d.words.length === 3)).toBe(true);
  });

  it("produces something parseVocabMonth accepts", () => {
    const m = toMonth([1, 2, 3, 4].map(word), "2026-07", "topic");
    const validated = parseVocabMonth(m);
    expect(validated.days).toHaveLength(2);
    expect(validated.days[0].words[0].synonyms).toEqual(["a", "b"]);
  });

  it("records the topic and a timestamp", () => {
    const m = toMonth([word(1)], "2026-07", "my topic");
    expect(m.description).toContain("my topic");
    expect(Number.isNaN(Date.parse(m.createdAt ?? ""))).toBe(false);
  });
});

describe("input guards run before any network call", () => {
  it.each([
    ["a blank api key", { apiKey: "   " }, /API key/],
    ["zero words", { wordCount: 0 }, /between 1 and 90/],
    ["more than 90 words", { wordCount: 91 }, /between 1 and 90/],
    ["a fractional count", { wordCount: 2.5 }, /between 1 and 90/],
    ["a malformed month", { monthKey: "July" }, /2026-07/],
  ])("rejects %s", async (_name, over, message) => {
    stubFetch(200, toolUse([word(1)]));
    await expect(generateMonth({ ...BASE, ...over })).rejects.toThrow(message);
    expect(captured).toBeNull();
  });
});

describe("the request we send", () => {
  beforeEach(async () => {
    stubFetch(200, toolUse([word(1), word(2), word(3), word(4)]));
    await generateMonth({
      ...BASE,
      wordCount: 4,
      existingWords: ["abate", "cogent"],
    });
  });

  it("posts to the messages endpoint with the browser-access header", () => {
    expect(captured!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(captured!.headers["anthropic-version"]).toBe("2023-06-01");
    expect(captured!.headers["x-api-key"]).toBe("sk-test");
    expect(
      captured!.headers["anthropic-dangerous-direct-browser-access"],
    ).toBe("true");
  });

  it("uses a current model and current parameter shapes", () => {
    expect(captured!.body.model).toBe("claude-opus-5");
    expect(captured!.body.max_tokens).toBeGreaterThan(0);
    expect(typeof captured!.body.output_config?.effort).toBe("string");
    // budget_tokens is rejected by current models; effort replaced it.
    expect(captured!.body.thinking ?? {}).not.toHaveProperty("budget_tokens");
  });

  it("constrains the output with a strict tool schema", () => {
    const tool = captured!.body.tools[0];
    expect(captured!.body.tools).toHaveLength(1);
    expect(tool.name).toBe("emit_vocabulary");
    expect(tool.strict).toBe(true);
    expect(tool.input_schema.additionalProperties).toBe(false);
    expect(tool.input_schema.properties.words.items.additionalProperties).toBe(
      false,
    );
    expect(tool.input_schema.properties.words.items.required).toEqual([
      "word",
      "partOfSpeech",
      "definition",
      "example",
      "mnemonic",
      "synonyms",
      "antonyms",
    ]);
  });

  it("asks for the tool rather than forcing it", () => {
    // Forced tool_choice is rejected on some current models; auto plus an
    // explicit instruction behaves the same everywhere.
    expect(captured!.body.tool_choice).toEqual({ type: "auto" });
    expect(captured!.body.messages[0].content).toContain("emit_vocabulary");
  });

  it("passes the topic and the words to avoid", () => {
    const prompt = captured!.body.messages[0].content;
    expect(prompt).toContain("GRE verbs");
    expect(prompt).toContain("abate");
    expect(prompt).toContain("cogent");
  });
});

describe("the avoid-list is capped so it cannot dominate the prompt", () => {
  it("sends at most 300 words", async () => {
    stubFetch(200, toolUse([word(1)]));
    await generateMonth({
      ...BASE,
      wordCount: 1,
      existingWords: Array.from({ length: 500 }, (_, i) => `w${i}`),
    });
    const prompt = captured!.body.messages[0].content;
    expect(prompt).toContain("w299");
    expect(prompt).not.toContain("w300");
  });
});

describe("failures are reported in terms the user can act on", () => {
  it.each([
    [
      "a rejected key",
      401,
      { error: { message: "invalid x-api-key" } },
      /invalid x-api-key/,
    ],
    ["an opaque server error", 500, null, /500/],
    ["rate limiting", 429, {}, /Rate limited/],
  ])("explains %s", async (_name, status, body, message) => {
    stubFetch(status, body);
    await expect(generateMonth(BASE)).rejects.toThrow(message);
  });

  it.each([
    [
      "a refusal",
      {
        stop_reason: "refusal",
        stop_details: { explanation: "declined for policy" },
        content: [],
      },
      /declined for policy/,
    ],
    [
      "truncated output",
      { stop_reason: "max_tokens", content: [{ type: "text", text: "partial" }] },
      /fewer words/,
    ],
    [
      "a reply with no tool call",
      { stop_reason: "end_turn", content: [{ type: "text", text: "nope" }] },
      /did not return any vocabulary/,
    ],
    ["an empty word list", toolUse([]), /empty word list/],
  ])("explains %s", async (_name, body, message) => {
    stubFetch(200, body);
    await expect(generateMonth(BASE)).rejects.toThrow(message);
  });
});

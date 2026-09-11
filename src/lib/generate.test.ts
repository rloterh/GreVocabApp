import { describe, expect, it, vi } from "vitest";
import { generateMonth, toMonth, validateWords, WORDS_PER_DAY } from "@/lib/generate";
import { parseVocabMonth } from "@/lib/vocabulary";
import type { Provider, StructuredRequest } from "@/lib/ai/types";

/**
 * These tests cover generation, not transport. What the HTTP request looks
 * like, how a 429 is mapped and whether a key is sent are properties of the
 * provider layer and are covered by `src/lib/ai/contract.test.ts` against every
 * adapter — asserting them again here would pin this module to one provider,
 * which is the thing the seam exists to prevent.
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

/** A provider that returns canned words and records what it was asked for. */
function stubProvider(words: unknown[] = [word(1), word(2), word(3)]) {
  const requests: StructuredRequest<unknown>[] = [];
  const provider: Provider = {
    id: "ollama",
    label: "Stub",
    tier: 2,
    detect: async () => "available",
    capabilities: () => ({
      structuredOutput: "schema",
      maxOutputTokens: 16_000,
      contextTokens: 32_000,
      onDevice: true,
    }),
    complete: async () => ({ text: "", provider: "ollama" }),
    // Cast: the stub answers every T the same way, which the generic
    // signature cannot express but is exactly what a test double wants.
    completeStructured: vi.fn(async (req: StructuredRequest<unknown>) => {
      requests.push(req);
      // Exercise the real validator, the way a provider would.
      return req.validate({ words });
    }) as Provider["completeStructured"],
  };
  return { provider, requests };
}

const BASE = {
  topic: "GRE verbs",
  wordCount: 3,
  monthKey: "2026-07",
};

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
    const validated = parseVocabMonth(toMonth([1, 2, 3, 4].map(word), "2026-07", "t"));
    expect(validated.days).toHaveLength(2);
    expect(validated.days[0].words[0].synonyms).toEqual(["a", "b"]);
  });

  it("records the topic and a timestamp", () => {
    const m = toMonth([word(1)], "2026-07", "my topic");
    expect(m.description).toContain("my topic");
    expect(Number.isNaN(Date.parse(m.createdAt ?? ""))).toBe(false);
  });
});

describe("validateWords — its message is fed back to repair the output", () => {
  it("accepts a well-formed batch", () => {
    expect(validateWords({ words: [word(1)] })).toHaveLength(1);
  });

  it.each([
    ["a missing words array", {}, /words.*array/i],
    ["an empty batch", { words: [] }, /empty/i],
    ["a non-array", { words: "nope" }, /array/i],
  ])("rejects %s", (_name, value, message) => {
    expect(() => validateWords(value)).toThrow(message);
  });

  it("names the field and the index that is wrong", () => {
    // Specific enough for a model to act on. "Invalid" would not be.
    expect(() =>
      validateWords({ words: [word(1), { ...word(2), definition: "" }] }),
    ).toThrow("words[1].definition");
  });

  it.each(["word", "partOfSpeech", "definition", "example", "mnemonic"])(
    "requires %s",
    (field) => {
      const bad = { ...word(1), [field]: "" };
      expect(() => validateWords({ words: [bad] })).toThrow(field);
    },
  );
});

describe("input guards run before the provider is called", () => {
  it.each([
    ["zero words", { wordCount: 0 }, /between 1 and 90/],
    ["more than 90 words", { wordCount: 91 }, /between 1 and 90/],
    ["a fractional count", { wordCount: 2.5 }, /between 1 and 90/],
    ["a malformed month", { monthKey: "July" }, /2026-07/],
  ])("rejects %s", async (_name, over, message) => {
    const { provider, requests } = stubProvider();
    await expect(
      generateMonth({ ...BASE, ...over, provider }),
    ).rejects.toThrow(message);
    expect(requests).toHaveLength(0);
  });
});

describe("what we ask the provider for", () => {
  it("passes a schema that forbids extra properties", async () => {
    const { provider, requests } = stubProvider();
    await generateMonth({ ...BASE, provider });

    const schema = requests[0].schema as Record<string, unknown>;
    expect(schema.additionalProperties).toBe(false);
    const words = (schema.properties as Record<string, Record<string, unknown>>)
      .words;
    const item = words.items as Record<string, unknown>;
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toEqual([
      "word",
      "partOfSpeech",
      "definition",
      "example",
      "mnemonic",
      "synonyms",
      "antonyms",
    ]);
  });

  it("names the tool in both the schema request and the prompt", async () => {
    const { provider, requests } = stubProvider();
    await generateMonth({ ...BASE, provider });
    expect(requests[0].name).toBe("emit_vocabulary");
    expect(requests[0].prompt).toContain("emit_vocabulary");
  });

  it("carries the topic and the words to avoid", async () => {
    const { provider, requests } = stubProvider();
    await generateMonth({
      ...BASE,
      provider,
      existingWords: ["abate", "cogent"],
    });
    expect(requests[0].prompt).toContain("GRE verbs");
    expect(requests[0].prompt).toContain("abate");
    expect(requests[0].prompt).toContain("cogent");
  });

  it("caps the avoid-list so it cannot dominate the prompt", async () => {
    const { provider, requests } = stubProvider([word(1)]);
    await generateMonth({
      ...BASE,
      wordCount: 1,
      provider,
      existingWords: Array.from({ length: 500 }, (_, i) => `w${i}`),
    });
    expect(requests[0].prompt).toContain("w299");
    expect(requests[0].prompt).not.toContain("w300");
  });

  it("forwards the abort signal", async () => {
    const { provider, requests } = stubProvider();
    const controller = new AbortController();
    await generateMonth({ ...BASE, provider, signal: controller.signal });
    expect(requests[0].signal).toBe(controller.signal);
  });
});

describe("the generated month", () => {
  it("is laid out and validated like any import", async () => {
    const { provider } = stubProvider([word(1), word(2), word(3), word(4)]);
    const month = await generateMonth({ ...BASE, wordCount: 4, provider });
    expect(month.month).toBe("2026-07");
    expect(month.days).toHaveLength(2);
    expect(parseVocabMonth(month).days).toHaveLength(2);
  });

  it("propagates a provider failure rather than swallowing it", async () => {
    const provider = {
      ...stubProvider().provider,
      completeStructured: vi.fn(async () => {
        throw new Error("rate limited, friend");
      }),
    } as unknown as Provider;
    await expect(generateMonth({ ...BASE, provider })).rejects.toThrow(
      "rate limited, friend",
    );
  });
});

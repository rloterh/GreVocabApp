import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiVerify,
  heuristicVerify,
  validateVerification,
} from "@/lib/verify";
import type { Provider, StructuredRequest } from "@/lib/ai/types";
import type { VocabWord } from "@/types";

const WORD: VocabWord = {
  id: "2026-07-laconic",
  word: "laconic",
  partOfSpeech: "adjective",
  definition: "Using very few words.",
  example: "His laconic reply ended the conversation.",
  mnemonic: "laconic = lacking words",
};

/**
 * A provider stub. What the HTTP looked like is the provider layer's business
 * and is covered by src/lib/ai/contract.test.ts; these tests cover grading.
 */
function stubProvider(
  behaviour: { reply?: unknown; error?: Error },
): { provider: Provider; requests: StructuredRequest<unknown>[] } {
  const requests: StructuredRequest<unknown>[] = [];
  const provider: Provider = {
    id: "ollama",
    label: "Stub",
    tier: 2,
    detect: async () => "available",
    capabilities: () => ({
      structuredOutput: "schema",
      maxOutputTokens: 4096,
      contextTokens: 32_000,
      onDevice: true,
    }),
    complete: async () => ({ text: "", provider: "ollama" }),
    completeStructured: (vi.fn(async (req: StructuredRequest<unknown>) => {
      requests.push(req);
      if (behaviour.error) throw behaviour.error;
      // Run the real validator, as a provider would.
      return req.validate(behaviour.reply);
    }) as unknown) as Provider["completeStructured"],
  };
  return { provider, requests };
}

const VERDICT = {
  overall: "good",
  perSentence: [
    {
      sentence: "He was laconic.",
      usesWordCorrectly: true,
      grammaticallyValid: true,
      correct: true,
      feedback: "Correct use.",
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("heuristicVerify", () => {
  it("accepts a well-formed sentence that uses the word", () => {
    const r = heuristicVerify(WORD, ["His laconic answer said everything."]);
    expect(r.method).toBe("heuristic");
    expect(r.perSentence[0].correct).toBe(true);
  });

  it("rejects a sentence that never uses the word", () => {
    const r = heuristicVerify(WORD, ["He said almost nothing at all today."]);
    expect(r.perSentence[0].usesWordCorrectly).toBe(false);
  });

  it("rejects a sentence copied from the provided example", () => {
    const r = heuristicVerify(WORD, [WORD.example]);
    expect(r.perSentence[0].correct).toBe(false);
  });
});

describe("apiVerify — what it asks for", () => {
  it("asks for the grading schema, keeping output small", async () => {
    const { provider, requests } = stubProvider({ reply: VERDICT });
    await apiVerify(WORD, ["He was laconic."], provider);

    expect(requests[0].name).toBe("grade_sentences");
    expect(requests[0].schema).toHaveProperty("properties.overall");
    expect(requests[0].maxOutputTokens).toBeLessThanOrEqual(4096);
  });

  it("puts the word and every sentence in the prompt", async () => {
    const { provider, requests } = stubProvider({ reply: VERDICT });
    await apiVerify(WORD, ["One sentence.", "Two sentences."], provider);
    expect(requests[0].prompt).toContain("laconic");
    expect(requests[0].prompt).toContain("One sentence.");
    expect(requests[0].prompt).toContain("Two sentences.");
  });
});

describe("apiVerify — reading the verdict", () => {
  it("returns the model's grading", async () => {
    const { provider } = stubProvider({ reply: VERDICT });
    const r = await apiVerify(WORD, ["He was laconic."], provider);
    expect(r.method).toBe("api");
    expect(r.overall).toBe("good");
    expect(r.perSentence[0].feedback).toBe("Correct use.");
  });

  it("keeps the user's own sentences rather than the model's echo", async () => {
    // A model paraphrases. Attaching feedback to a sentence the user did not
    // write is worse than no feedback.
    const { provider } = stubProvider({
      reply: {
        overall: "good",
        perSentence: [{ sentence: "something else", correct: true }],
      },
    });
    const r = await apiVerify(WORD, ["He was laconic."], provider);
    expect(r.perSentence[0].sentence).toBe("He was laconic.");
  });

  it("pads a short reply out to one entry per sentence", async () => {
    const { provider } = stubProvider({
      reply: { overall: "needs-work", perSentence: [] },
    });
    const r = await apiVerify(WORD, ["One.", "Two."], provider);
    expect(r.perSentence).toHaveLength(2);
    expect(r.perSentence[1].feedback).toBe("No feedback provided.");
  });
});

describe("validateVerification — its message is fed back to repair output", () => {
  it.each([
    ["a missing overall", { perSentence: [] }, /overall/],
    ["an unknown overall", { overall: "brilliant", perSentence: [] }, /overall/],
    ["a non-array perSentence", { overall: "good", perSentence: 3 }, /array/],
  ])("rejects %s", (_name, value, message) => {
    expect(() => validateVerification(value, ["x"])).toThrow(message);
  });
});

describe("apiVerify — falls back rather than failing", () => {
  it.each([
    ["a provider error", new Error("rate limited")],
    ["a malformed reply", new Error("overall must be one of...")],
  ])("falls back on %s", async (_name, error) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { provider } = stubProvider({ error });
    const r = await apiVerify(
      WORD,
      ["His laconic answer said everything."],
      provider,
    );
    // The user always gets a usable verdict, whatever went wrong upstream.
    expect(r.method).toBe("heuristic");
    expect(r.perSentence).toHaveLength(1);
  });
});

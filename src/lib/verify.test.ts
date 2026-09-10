import { afterEach, describe, expect, it, vi } from "vitest";
import { apiVerify, heuristicVerify } from "@/lib/verify";
import type { VocabWord } from "@/types";

const WORD: VocabWord = {
  id: "2026-07-laconic",
  word: "laconic",
  partOfSpeech: "adjective",
  definition: "Using very few words.",
  example: "His laconic reply ended the conversation.",
  mnemonic: "laconic = lacking words",
};

let captured: { headers: Record<string, string>; body: Record<string, unknown> } | null =
  null;

function stubFetch(status: number, body: unknown) {
  captured = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      captured = {
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

const VERDICT = JSON.stringify({
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
});

afterEach(() => {
  vi.unstubAllGlobals();
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

describe("apiVerify — the request", () => {
  it("uses a current model and effort instead of a token budget", async () => {
    stubFetch(200, { content: [{ type: "text", text: VERDICT }] });
    await apiVerify(WORD, ["He was laconic."], "sk-test");

    expect(captured!.body.model).toBe("claude-opus-5");
    expect(
      (captured!.body.output_config as { effort?: string }).effort,
    ).toBeTypeOf("string");
    expect(captured!.body).not.toHaveProperty("thinking.budget_tokens");
    expect(
      captured!.headers["anthropic-dangerous-direct-browser-access"],
    ).toBe("true");
  });
});

describe("apiVerify — reading the response", () => {
  it("finds the verdict even when a thinking block comes first", async () => {
    // Regression: this used to read content[0].text, so any leading block
    // silently sent every call down the heuristic path.
    stubFetch(200, {
      content: [
        { type: "thinking", thinking: "considering the sentence" },
        { type: "text", text: VERDICT },
      ],
    });
    const r = await apiVerify(WORD, ["He was laconic."], "sk-test");
    expect(r.method).toBe("api");
    expect(r.overall).toBe("good");
    expect(r.perSentence[0].feedback).toBe("Correct use.");
  });

  it("strips markdown fences around the JSON", async () => {
    stubFetch(200, {
      content: [{ type: "text", text: "```json\n" + VERDICT + "\n```" }],
    });
    const r = await apiVerify(WORD, ["He was laconic."], "sk-test");
    expect(r.method).toBe("api");
    expect(r.overall).toBe("good");
  });

  it("keeps the user's own sentences rather than the model's echo", async () => {
    stubFetch(200, {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            overall: "good",
            perSentence: [{ sentence: "something else", correct: true }],
          }),
        },
      ],
    });
    const r = await apiVerify(WORD, ["He was laconic."], "sk-test");
    expect(r.perSentence[0].sentence).toBe("He was laconic.");
  });
});

describe("apiVerify — falls back to the heuristic rather than failing", () => {
  it.each([
    ["an HTTP error", 500, {}],
    ["a body with no text block", 200, { content: [{ type: "thinking" }] }],
    ["unparseable JSON", 200, { content: [{ type: "text", text: "not json" }] }],
    [
      "a refusal",
      200,
      { stop_reason: "refusal", stop_details: {}, content: [] },
    ],
  ])("falls back on %s", async (_name, status, body) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stubFetch(status, body);
    const r = await apiVerify(WORD, ["His laconic answer said everything."], "sk");
    expect(r.method).toBe("heuristic");
    // The user still gets a usable verdict.
    expect(r.perSentence).toHaveLength(1);
  });
});

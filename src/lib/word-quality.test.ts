import { describe, expect, it } from "vitest";
import {
  checkWord,
  partitionByQuality,
  RESTATEMENT_THRESHOLD,
} from "@/lib/word-quality";
import { normalizeText, overlapRatio } from "@/lib/text-overlap";
import type { VocabWord } from "@/types";

/** A card that passes everything, to vary one field at a time. */
function card(overrides: Partial<VocabWord> = {}): VocabWord {
  return {
    id: "laconic",
    word: "laconic",
    partOfSpeech: "adjective",
    definition: "Using very few words.",
    example: "His laconic reply ended the meeting before it began.",
    mnemonic: "Sounds like LACK-onic — lacking words.",
    ...overrides,
  };
}

function fields(word: VocabWord): string[] {
  return checkWord(word).map((i) => i.field);
}

describe("a good card passes", () => {
  it("reports nothing", () => {
    expect(checkWord(card())).toEqual([]);
  });

  it.each([
    ["an example that shares some definition words", {
      definition: "Using very few words.",
      example: "She answered in words few enough to seem laconic.",
    }],
    ["a mnemonic naming the root", {
      mnemonic: "From Laconia, whose people were famously terse.",
    }],
  ])("tolerates %s", (_name, overrides) => {
    // The threshold has to leave room for legitimate overlap, or it rejects
    // exactly the examples that teach best.
    expect(checkWord(card(overrides as Partial<VocabWord>))).toEqual([]);
  });
});

describe("circular definitions", () => {
  it("catches a definition using the word itself", () => {
    const issues = checkWord(
      card({ definition: "Being laconic in speech." }),
    );
    expect(issues[0].field).toBe("definition");
    expect(issues[0].message).toMatch(/uses the word itself/);
  });

  it("catches an inflection, which is what a model actually reaches for", () => {
    expect(
      fields(card({ word: "abate", definition: "The abatement of something." })),
    ).toContain("definition");
  });

  it("ignores a merely similar word", () => {
    expect(
      checkWord(
        card({
          word: "abate",
          definition: "To make less intense.",
          example: "The storm began to abate at dawn.",
          mnemonic: "A-BATE: the bait shrinks.",
        }),
      ),
    ).toEqual([]);
  });

  it("says what to do, not just what is wrong", () => {
    // These messages are fed back to a model as instructions.
    const [issue] = checkWord(card({ definition: "Being laconic." }));
    expect(issue.message).toMatch(/Define it without/);
  });
});

describe("definition length", () => {
  it("accepts a normal one", () => {
    expect(fields(card())).not.toContain("definition");
  });

  it("rejects a paragraph", () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    expect(fields(card({ definition: long }))).toContain("definition");
  });
});

describe("examples", () => {
  it("must contain the word", () => {
    const issues = checkWord(
      card({ example: "He said almost nothing at all." }),
    );
    expect(issues[0].field).toBe("example");
    expect(issues[0].message).toMatch(/does not use the word/);
  });

  it("accepts an inflected form of the word", () => {
    expect(
      fields(card({ word: "abate", example: "The storm abated by morning." })),
    ).not.toContain("example");
  });

  it("must not simply restate the definition", () => {
    const issues = checkWord(
      card({
        definition: "Using very few words.",
        example: "Laconic means using very few words.",
      }),
    );
    expect(issues.some((i) => i.field === "example")).toBe(true);
    expect(issues.find((i) => i.field === "example")?.message).toMatch(
      /restates the definition/,
    );
  });

  it("complains about the missing word rather than both at once", () => {
    // One instruction at a time gets followed more reliably than two, and
    // "it does not contain the word" is the more useful complaint.
    const issues = checkWord(
      card({
        definition: "Using very few words.",
        example: "Using very few words.",
      }),
    );
    const exampleIssues = issues.filter((i) => i.field === "example");
    expect(exampleIssues).toHaveLength(1);
    expect(exampleIssues[0].message).toMatch(/does not use the word/);
  });
});

describe("mnemonics", () => {
  it("must not be the definition again", () => {
    const issues = checkWord(
      card({
        definition: "Using very few words.",
        mnemonic: "It means using very few words.",
      }),
    );
    expect(issues.some((i) => i.field === "mnemonic")).toBe(true);
  });

  it("accepts a sound-alike", () => {
    expect(
      fields(card({ mnemonic: "LAC-onic: lacking in words." })),
    ).not.toContain("mnemonic");
  });

  it("suggests what a real mnemonic looks like", () => {
    const [issue] = checkWord(
      card({ definition: "Using very few words.", mnemonic: "Using very few words." }),
    );
    expect(issue.message).toMatch(/sound-alike|root breakdown|vivid image/);
  });
});

describe("partitionByQuality", () => {
  it("separates the good from the bad", () => {
    const good = card();
    const bad = card({ id: "x", word: "abate", definition: "To abate." });
    const result = partitionByQuality([good, bad]);
    expect(result.good).toEqual([good]);
    expect(result.bad).toHaveLength(1);
    expect(result.bad[0].word.word).toBe("abate");
    expect(result.bad[0].issues.length).toBeGreaterThan(0);
  });

  it("handles an empty batch", () => {
    expect(partitionByQuality([])).toEqual({ good: [], bad: [] });
  });

  it("keeps order", () => {
    const a = card({ id: "a", word: "laconic" });
    const b = card({ id: "b", word: "terse", definition: "Brief and direct.", example: "His terse note explained nothing.", mnemonic: "TERSE sounds like TERSE-ly short." });
    expect(partitionByQuality([a, b]).good.map((w) => w.id)).toEqual(["a", "b"]);
  });
});

describe("the shared overlap measure", () => {
  it("is 1 when the candidate is wholly recycled", () => {
    expect(overlapRatio("using very few words", "using very few words")).toBe(1);
  });

  it("is 0 when nothing is shared", () => {
    expect(overlapRatio("abcd", "efgh")).toBe(0);
  });

  it("is asymmetric, because the question is about the candidate", () => {
    // A short mnemonic lifted from a long definition must score high, even
    // though the definition contains much the mnemonic does not.
    const short = "very few words";
    const long = "using very few words in a manner that seems abrupt or curt";
    expect(overlapRatio(short, long)).toBe(1);
    expect(overlapRatio(long, short)).toBeLessThan(1);
  });

  it("ignores punctuation and case", () => {
    expect(overlapRatio("Very, few words!", "very few words")).toBe(1);
  });

  it("is 0 for empty input rather than dividing by zero", () => {
    expect(overlapRatio("", "anything")).toBe(0);
    expect(overlapRatio("anything", "")).toBe(0);
    expect(Number.isNaN(overlapRatio("", ""))).toBe(false);
  });

  it("has a threshold that leaves room for real overlap", () => {
    expect(RESTATEMENT_THRESHOLD).toBeGreaterThan(0.5);
    expect(RESTATEMENT_THRESHOLD).toBeLessThan(1);
  });

  it("normalises consistently", () => {
    expect(normalizeText("  Hello,   WORLD! ")).toBe("hello world");
  });
});

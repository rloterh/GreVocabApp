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

describe("inflections the stemmer does not fully reduce", () => {
  // All four were reported as "the example does not use the word" by an
  // earlier equality-based check, on cards that plainly do use it. The
  // stemmer is deliberately conservative and its keys are asymmetric.
  it.each([
    ["sate", "After three helpings, the hikers were finally sated."],
    ["compel", "A sense of duty compelled her to report the crime."],
    ["rebuff", "Every time he tried to help, she rebuffed him coldly."],
    ["abate", "The storm abated by morning."],
    ["quash", "The judge quashed the subpoena without comment."],
    // The `-ie/-ied` family. `belie` stems to `beli` and `belied` to `bely`:
    // they differ in the last character, so no prefix rule reaches across
    // them. Found in the SAT corpus, on the only card the audit flagged.
    ["belie", "Her calm voice belied the panic she felt as the plane dropped."],
    ["vie", "The two candidates vied for the same handful of votes."],
    ["tie", "She tied the parcel with string before posting it."],
  ])("accepts %s in an example that inflects it", (word, example) => {
    const issues = checkWord(card({ word, id: word, example }));
    expect(issues.filter((i) => i.field === "example")).toEqual([]);
  });

  it("does not let the y/i merge match unrelated words", () => {
    // The merge is one ending, not a licence. "carry" must not satisfy
    // "carp" — nor anything else that merely starts the same way.
    const issues = checkWord(
      card({
        word: "belie",
        id: "belie",
        definition: "To give a false impression of something.",
        example: "The bell rang twice before anyone answered the door.",
      }),
    );
    expect(issues.some((i) => i.message.includes("does not use the word"))).toBe(true);
  });

  it("still catches an example that omits the word entirely", () => {
    // The leniency must not go so far that the check stops working.
    const issues = checkWord(
      card({ word: "laconic", id: "laconic", example: "He said nothing at all." }),
    );
    expect(issues.some((i) => i.message.includes("does not use the word"))).toBe(true);
  });

  it("reads a word attached to punctuation", () => {
    // "misfeasance—operating" was one token before punctuation became a
    // separator, so the sentence read as not containing the word.
    const issues = checkWord(
      card({
        word: "misfeasance",
        id: "misfeasance",
        definition: "Doing a lawful act in an improper way.",
        example: "The surgeon's misfeasance—operating with unsterile tools—was plain.",
      }),
    );
    expect(issues.filter((i) => i.field === "example")).toEqual([]);
  });
});

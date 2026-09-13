import { describe, expect, it } from "vitest";
import {
  CONFUSABLE_PAIRS,
  blankOut,
  buildConfusableDrill,
} from "./confusables";
import type { VocabWord } from "@/types";

function card(word: string, example: string): VocabWord {
  return {
    id: `gre-${word}`,
    word,
    partOfSpeech: "adjective",
    definition: `The quality of being ${word}.`,
    example,
    mnemonic: "A mnemonic.",
  };
}

describe("the pair table", () => {
  it("never lists a word against itself", () => {
    for (const pair of CONFUSABLE_PAIRS) {
      expect(pair.a).not.toBe(pair.b);
    }
  });

  it("gives every pair a distinction worth reading", () => {
    for (const pair of CONFUSABLE_PAIRS) {
      expect(pair.note.length, `${pair.a}/${pair.b}`).toBeGreaterThan(30);
      // The note has to mention both words, or it is not telling them apart.
      expect(pair.note.toLowerCase(), `${pair.a}/${pair.b}`).toContain(pair.a);
      expect(pair.note.toLowerCase(), `${pair.a}/${pair.b}`).toContain(pair.b);
    }
  });

  it("does not use one word in two pairs", () => {
    // A word in two pairs would produce two drills that contradict each
    // other's framing in the same session.
    const seen = new Set<string>();
    for (const pair of CONFUSABLE_PAIRS) {
      for (const word of [pair.a, pair.b]) {
        expect(seen.has(word), `${word} appears twice`).toBe(false);
        seen.add(word);
      }
    }
  });
});

describe("blankOut", () => {
  it("replaces the word", () => {
    expect(blankOut("She was discreet about it.", "discreet")).toBe(
      "She was ____ about it.",
    );
  });

  it("replaces an inflected form", () => {
    expect(blankOut("He elicited a confession.", "elicit")).toContain("____");
  });

  it("keeps the punctuation attached to the word", () => {
    expect(blankOut("Was he discreet?", "discreet")).toBe("Was he ____?");
  });

  it("replaces only the first occurrence", () => {
    const out = blankOut("Discreet people are discreet.", "discreet")!;
    expect(out.match(/____/g)).toHaveLength(1);
  });

  it("is null when the sentence does not contain the word", () => {
    expect(blankOut("Nothing relevant here.", "discreet")).toBeNull();
  });
});

describe("buildConfusableDrill", () => {
  const loaded = [
    card("discreet", "She was discreet about the whole affair."),
    card("discrete", "The report divided the year into discrete phases."),
    card("elicit", "The lawyer hoped to elicit a confession."),
    card("illicit", "They were charged over an illicit shipment."),
    card("aardvark", "An aardvark appeared."),
  ];

  it("uses a pair only when both words are loaded", () => {
    // Choosing between a word you have studied and one you have never been
    // given is a trick, not a discrimination exercise.
    const onlyOne = [card("discreet", "She was discreet about it.")];
    expect(buildConfusableDrill(onlyOne, "s")).toEqual([]);
  });

  it("builds a question per qualifying pair", () => {
    const drill = buildConfusableDrill(loaded, "seed");
    expect(drill).toHaveLength(2);
  });

  it("blanks the answer out of its own example", () => {
    for (const q of buildConfusableDrill(loaded, "seed")) {
      expect(q.sentence).toContain("____");
      expect(q.sentence.toLowerCase()).not.toContain(q.answer.toLowerCase());
    }
  });

  it("offers exactly the pair, and includes the answer", () => {
    for (const q of buildConfusableDrill(loaded, "seed")) {
      expect(q.options).toHaveLength(2);
      expect(q.options).toContain(q.answer);
      expect(new Set(q.options).size).toBe(2);
    }
  });

  it("never leaves the sibling in the sentence", () => {
    // Two defensible answers is a broken question, not a hard one. Asserted
    // over every seed rather than one: which of the pair a seed picks is not
    // something this test should know, and an earlier version that assumed it
    // failed for a question that was perfectly good.
    const ambiguous = [
      card("discreet", "A discreet person keeps discrete facts apart."),
      card("discrete", "The phases were discrete."),
    ];
    for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      for (const q of buildConfusableDrill(ambiguous, seed)) {
        const sibling = q.answer === q.pair.a ? q.pair.b : q.pair.a;
        expect(q.sentence.toLowerCase(), seed).not.toContain(sibling);
      }
    }
  });

  it("tells apart words that differ only at the end", () => {
    // The whole point of the module. Elsewhere the app matches inflections by
    // shared stem prefix, which would treat `discrete` as a form of
    // `discreet` and blank the wrong word out of its own sentence.
    expect(blankOut("The phases were discrete.", "discreet")).toBeNull();
    expect(blankOut("She was discreet.", "discrete")).toBeNull();
    expect(blankOut("He elicited a confession.", "illicit")).toBeNull();
  });

  it("is stable for a seed and different across seeds", () => {
    const a = buildConfusableDrill(loaded, "one");
    const b = buildConfusableDrill(loaded, "one");
    expect(a).toEqual(b);
    const seeds = ["a", "b", "c", "d", "e", "f"].map(
      (s) => buildConfusableDrill(loaded, s).map((q) => q.answer).join(","),
    );
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });
});

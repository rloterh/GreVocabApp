import { describe, expect, it } from "vitest";
import {
  DISTRACTOR_COUNT,
  pickDistractors,
  scoreDistractor,
  WEIGHTS,
} from "@/lib/distractors";
import type { VocabWord, WordProgress } from "@/types";

function word(overrides: Partial<VocabWord> & { id: string }): VocabWord {
  return {
    word: overrides.id,
    partOfSpeech: "verb",
    definition: "To lessen in intensity over time.",
    example: "An example.",
    mnemonic: "A mnemonic.",
    ...overrides,
  };
}

function seen(id: string): WordProgress {
  return {
    wordId: id,
    monthKey: "2026-04",
    mastered: false,
    timesReviewed: 3,
    quizAttempts: 0,
    quizCorrect: 0,
    lastReviewed: "2026-09-01",
    masteredAt: null,
  } as WordProgress;
}

const ANSWER = word({
  id: "abate",
  word: "abate",
  partOfSpeech: "verb",
  definition: "To lessen in intensity over time.",
  synonyms: ["subside", "wane"],
});

/** Everything scored against the same answer, one signal at a time. */
const PROGRESS = {
  abate: seen("abate"),
  subside: seen("subside"),
  ponder: seen("ponder"),
  gauche: seen("gauche"),
  amble: seen("amble"),
  brief: seen("brief"),
};

describe("scoring", () => {
  const base = (overrides: Partial<VocabWord> & { id: string }) =>
    scoreDistractor(word(overrides), ANSWER, { progress: PROGRESS });

  it("rewards the same part of speech", () => {
    const verb = base({ id: "ponder", partOfSpeech: "verb" });
    const noun = base({ id: "gauche", partOfSpeech: "noun" });
    expect(verb - noun).toBe(WEIGHTS.samePartOfSpeech);
  });

  it("rewards a similar definition length", () => {
    // A conspicuously short option gives itself away without being read.
    const similar = base({ id: "ponder", definition: "To think about deeply." });
    const short = base({ id: "amble", definition: "Walk." });
    expect(similar).toBeGreaterThan(short);
  });

  it("rewards the same month, for register and difficulty", () => {
    const context = {
      progress: PROGRESS,
      monthOf: { abate: "2026-04", ponder: "2026-04", gauche: "2026-09" },
    };
    const sameMonth = scoreDistractor(word({ id: "ponder" }), ANSWER, context);
    const otherMonth = scoreDistractor(word({ id: "gauche" }), ANSWER, context);
    expect(sameMonth - otherMonth).toBe(WEIGHTS.sameMonth);
  });

  it("rewards a shared first letter", () => {
    const shares = base({ id: "amble", word: "amble" });
    const differs = base({ id: "ponder", word: "ponder" });
    expect(shares - differs).toBe(WEIGHTS.sharesFirstLetter);
  });

  it("penalises a synonym hard enough to bury it", () => {
    // The one weight that is correctness rather than preference: a distractor
    // that is arguably right makes the whole quiz feel broken.
    const synonym = base({ id: "subside", word: "subside", partOfSpeech: "verb" });
    const ordinary = base({ id: "ponder", word: "ponder", partOfSpeech: "verb" });
    expect(synonym).toBeLessThan(ordinary);
    expect(ordinary - synonym).toBe(-WEIGHTS.synonym);
  });

  it("catches a synonym listed on the candidate instead of the answer", () => {
    // A list is only as good as whichever card was written more carefully.
    const reverse = word({ id: "wax", word: "wax", synonyms: ["abate"] });
    const plain = word({ id: "wane2", word: "ponder" });
    expect(scoreDistractor(reverse, ANSWER, { progress: PROGRESS })).toBeLessThan(
      scoreDistractor(plain, ANSWER, { progress: PROGRESS }),
    );
  });

  it("catches an inflected synonym", () => {
    const inflected = word({ id: "subsided", word: "subsided" });
    const plain = word({ id: "ponder", word: "ponder" });
    expect(
      scoreDistractor(inflected, ANSWER, { progress: PROGRESS }),
    ).toBeLessThan(scoreDistractor(plain, ANSWER, { progress: PROGRESS }));
  });

  it("penalises a word the user has never seen", () => {
    const known = base({ id: "ponder" });
    const unknown = scoreDistractor(word({ id: "unheard" }), ANSWER, {
      progress: PROGRESS,
    });
    expect(known - unknown).toBe(-WEIGHTS.unseen);
  });

  it("treats a word with zero reviews as unseen", () => {
    const never = { ...seen("fresh"), timesReviewed: 0 };
    expect(
      scoreDistractor(word({ id: "fresh" }), ANSWER, {
        progress: { ...PROGRESS, fresh: never },
      }),
    ).toBe(
      scoreDistractor(word({ id: "fresh" }), ANSWER, { progress: PROGRESS }),
    );
  });
});

describe("picking", () => {
  const pool = [
    word({ id: "subside", word: "subside", synonyms: [] }), // synonym of answer
    word({ id: "ponder", word: "ponder", definition: "To think about deeply." }),
    word({ id: "amble", word: "amble", definition: "To walk at a slow pace." }),
    word({ id: "gauche", word: "gauche", partOfSpeech: "adjective", definition: "Lacking social grace." }),
    word({ id: "brief", word: "brief", definition: "Lasting a short time." }),
  ];
  const context = { pool, progress: PROGRESS, random: () => 0.5 };

  it("returns three by default", () => {
    expect(pickDistractors(ANSWER, context)).toHaveLength(DISTRACTOR_COUNT);
  });

  it("never returns the answer", () => {
    const withAnswer = { ...context, pool: [...pool, ANSWER] };
    expect(
      pickDistractors(ANSWER, withAnswer).map((w) => w.id),
    ).not.toContain("abate");
  });

  it("never returns a synonym of the answer", () => {
    // The definition-of-done property for this whole phase.
    expect(pickDistractors(ANSWER, context).map((w) => w.id)).not.toContain(
      "subside",
    );
  });

  it("never returns another form of the same word", () => {
    const reimported = word({ id: "abate-may", word: "abated" });
    const result = pickDistractors(ANSWER, {
      ...context,
      pool: [...pool, reimported],
    });
    expect(result.map((w) => w.id)).not.toContain("abate-may");
  });

  it("never returns a word with an identical definition", () => {
    // Two options meaning the same thing make the question unanswerable.
    const twin = word({ id: "twin", word: "twin", definition: ANSWER.definition });
    const result = pickDistractors(ANSWER, {
      ...context,
      pool: [...pool, twin],
    });
    expect(result.map((w) => w.id)).not.toContain("twin");
  });

  it("prefers the same part of speech", () => {
    // `gauche` is the only adjective; with verbs available it should lose.
    expect(pickDistractors(ANSWER, context).map((w) => w.id)).not.toContain(
      "gauche",
    );
  });

  it("returns fewer rather than padding when the pool is thin", () => {
    const thin = { ...context, pool: [pool[1]] };
    // Padding with the answer repeated would be worse than a short question;
    // the caller decides what to do about it.
    expect(pickDistractors(ANSWER, thin)).toHaveLength(1);
  });

  it("returns nothing for an empty pool", () => {
    expect(pickDistractors(ANSWER, { ...context, pool: [] })).toEqual([]);
  });

  it("is deterministic when the tie-break is pinned", () => {
    const a = pickDistractors(ANSWER, context).map((w) => w.id);
    const b = pickDistractors(ANSWER, context).map((w) => w.id);
    expect(a).toEqual(b);
  });

  it("varies between draws when it is not", () => {
    // Otherwise the same word always produces the same three options, and the
    // question becomes memorable as a shape rather than as vocabulary.
    const many = Array.from({ length: 12 }, (_, i) =>
      word({ id: `w${i}`, word: `w${i}`, definition: "To do a thing slowly." }),
    );
    const seenSets = new Set<string>();
    for (let i = 0; i < 20; i++) {
      seenSets.add(
        pickDistractors(ANSWER, { pool: many, progress: PROGRESS })
          .map((w) => w.id)
          .sort()
          .join(","),
      );
    }
    expect(seenSets.size).toBeGreaterThan(1);
  });

  it("does not mutate the pool", () => {
    const order = pool.map((w) => w.id);
    pickDistractors(ANSWER, context);
    expect(pool.map((w) => w.id)).toEqual(order);
  });
});

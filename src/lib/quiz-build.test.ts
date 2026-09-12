import { describe, expect, it } from "vitest";
import {
  buildQuestion,
  buildQuestions,
  byNeed,
  PERIOD_LENGTH,
  poolForPeriod,
} from "@/lib/quiz-build";
import type { VocabWord, WordProgress } from "@/types";

function word(id: string, overrides: Partial<VocabWord> = {}): VocabWord {
  return {
    id,
    word: id,
    partOfSpeech: "verb",
    definition: `To ${id} in a characteristic manner.`,
    example: "An example.",
    mnemonic: "A mnemonic.",
    ...overrides,
  };
}

function progressFor(
  id: string,
  overrides: Partial<WordProgress> = {},
): WordProgress {
  return {
    wordId: id,
    monthKey: "2026-04",
    mastered: false,
    timesReviewed: 3,
    quizAttempts: 0,
    quizCorrect: 0,
    lastReviewed: "2026-09-01",
    masteredAt: null,
    easeFactor: 2.5,
    reps: 3,
    ...overrides,
  } as WordProgress;
}

const POOL = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"].map((w) =>
  word(w),
);
const PROGRESS = Object.fromEntries(POOL.map((w) => [w.id, progressFor(w.id)]));
const CONTEXT = { pool: POOL, progress: PROGRESS, random: () => 0.5 };

describe("building a question", () => {
  it("has four options, one of them right", () => {
    const q = buildQuestion(POOL[0], { ...CONTEXT, mode: "word-to-def" })!;
    expect(q.options).toHaveLength(4);
    expect(q.options).toContain(q.correct);
  });

  it("has no duplicate options", () => {
    // Two identical options make the question unanswerable and look broken.
    const q = buildQuestion(POOL[0], { ...CONTEXT, mode: "word-to-def" })!;
    expect(new Set(q.options).size).toBe(4);
  });

  it("asks the word and answers the definition in word-to-def", () => {
    const q = buildQuestion(POOL[0], { ...CONTEXT, mode: "word-to-def" })!;
    expect(q.prompt).toBe(POOL[0].word);
    expect(q.correct).toBe(POOL[0].definition);
  });

  it("reverses it in def-to-word", () => {
    const q = buildQuestion(POOL[0], { ...CONTEXT, mode: "def-to-word" })!;
    expect(q.prompt).toBe(POOL[0].definition);
    expect(q.correct).toBe(POOL[0].word);
  });

  it("picks a direction per question in mixed", () => {
    const modes = new Set(
      Array.from({ length: 40 }, () =>
        buildQuestion(POOL[0], { pool: POOL, progress: PROGRESS, mode: "mixed" })
          ?.mode,
      ),
    );
    expect(modes.size).toBe(2);
  });

  it("returns null rather than a guessable question", () => {
    // Two options can be solved by elimination; one question fewer is better.
    const thin = { pool: [POOL[1]], progress: PROGRESS, mode: "word-to-def" as const };
    expect(buildQuestion(POOL[0], thin)).toBeNull();
  });

  it("names the word it is about, for the scheduler", () => {
    const q = buildQuestion(POOL[0], { ...CONTEXT, mode: "word-to-def" })!;
    expect(q.wordId).toBe("alpha");
  });

  it("skips words it cannot build for, rather than failing the batch", () => {
    const questions = buildQuestions(POOL, { ...CONTEXT, mode: "word-to-def" });
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.length).toBeLessThanOrEqual(POOL.length);
  });

  it("never offers a synonym as a wrong answer", () => {
    // The definition-of-done property: no distractor may be defensible.
    const answer = word("wane", { synonyms: ["ebb"] });
    const pool = [answer, word("ebb"), ...POOL];
    const q = buildQuestion(answer, {
      pool,
      progress: { ...PROGRESS, wane: progressFor("wane"), ebb: progressFor("ebb") },
      mode: "def-to-word",
      random: () => 0.5,
    });
    expect(q?.options).not.toContain("ebb");
  });
});

describe("what a periodic test asks about", () => {
  const now = new Date("2026-09-12T10:00:00Z");

  it("asks ten, twenty-five and fifty", () => {
    expect(PERIOD_LENGTH).toEqual({ daily: 10, weekly: 25, monthly: 50 });
  });

  it("puts due words first, because the scheduler says they are at risk", () => {
    const due = { ...PROGRESS };
    due.echo = progressFor("echo", { dueAt: "2026-09-01T00:00:00Z" });
    const pool = poolForPeriod("daily", { all: POOL, progress: due, now });
    expect(pool[0].id).toBe("echo");
  });

  it("then the period's own material", () => {
    const pool = poolForPeriod("daily", {
      all: POOL,
      progress: PROGRESS,
      todaysWords: [word("charlie")],
      now,
    });
    expect(pool[0].id).toBe("charlie");
  });

  it("uses the right material for each period", () => {
    const context = {
      all: POOL,
      progress: PROGRESS,
      todaysWords: [word("alpha")],
      recentWords: [word("bravo")],
      monthWords: [word("charlie")],
      now,
    };
    expect(poolForPeriod("daily", context)[0].id).toBe("alpha");
    expect(poolForPeriod("weekly", context)[0].id).toBe("bravo");
    expect(poolForPeriod("monthly", context)[0].id).toBe("charlie");
  });

  it("never repeats a word within one test", () => {
    const pool = poolForPeriod("monthly", {
      all: POOL,
      progress: PROGRESS,
      todaysWords: POOL,
      monthWords: POOL,
      now,
    });
    expect(new Set(pool.map((w) => w.id)).size).toBe(pool.length);
  });

  it("stops at the period's length", () => {
    const many = Array.from({ length: 200 }, (_, i) => word(`w${i}`));
    const pool = poolForPeriod("daily", { all: many, progress: {}, now });
    expect(pool).toHaveLength(10);
  });

  it("returns what it can when there is not enough", () => {
    const pool = poolForPeriod("monthly", { all: POOL, progress: PROGRESS, now });
    expect(pool).toHaveLength(POOL.length);
  });
});

describe("weighting toward what needs work", () => {
  it("puts a low ease factor first", () => {
    // A uniform sample of a large corpus mostly asks about words the user
    // knows cold, which is what makes a long test feel like a formality.
    const progress = {
      alpha: progressFor("alpha", { easeFactor: 2.8 }),
      bravo: progressFor("bravo", { easeFactor: 1.4 }),
      charlie: progressFor("charlie", { easeFactor: 2.2 }),
    };
    const ordered = byNeed(POOL.slice(0, 3), progress, () => 0.5);
    expect(ordered.map((w) => w.id)).toEqual(["bravo", "charlie", "alpha"]);
  });

  it("treats a word with no successes behind it as needing work", () => {
    // SM-2 resets reps to zero on an "again", so this is the lapse signal.
    const progress = {
      alpha: progressFor("alpha", { easeFactor: 2.0, reps: 9 }),
      bravo: progressFor("bravo", { easeFactor: 2.0, reps: 0 }),
    };
    expect(byNeed(POOL.slice(0, 2), progress, () => 0.5)[0].id).toBe("bravo");
  });

  it("treats an unrated word as needing work rather than as mastered", () => {
    const progress = { alpha: progressFor("alpha", { easeFactor: 2.9, reps: 5 }) };
    expect(byNeed(POOL.slice(0, 2), progress, () => 0.5)[0].id).toBe("bravo");
  });

  it("varies between runs so two tests are not identical", () => {
    const flat = Object.fromEntries(
      POOL.map((w) => [w.id, progressFor(w.id, { easeFactor: 2.5, reps: 3 })]),
    );
    const orders = new Set(
      Array.from({ length: 20 }, () =>
        byNeed(POOL, flat).map((w) => w.id).join(","),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("does not mutate the input", () => {
    const order = POOL.map((w) => w.id);
    byNeed(POOL, PROGRESS, () => 0.5);
    expect(POOL.map((w) => w.id)).toEqual(order);
  });
});

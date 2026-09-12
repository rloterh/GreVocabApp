/**
 * The domain contract.
 *
 * CLAUDE.md calls `src/types/index.ts` the contract everything follows; this
 * is the gate every word passes through to get there — imported files,
 * generated months, Anki decks and the bundled corpus alike. It had no tests,
 * and writing them found two real integrity defects, both marked below.
 */

import { describe, expect, it } from "vitest";
import {
  allWordsInMonth,
  firstFreeMonthKey,
  parseVocabMonth,
  wordsForDay,
} from "@/lib/vocabulary";

function word(w: string, extra: Record<string, unknown> = {}) {
  return {
    word: w,
    partOfSpeech: "noun",
    definition: "A definition.",
    example: "An example.",
    mnemonic: "A mnemonic.",
    ...extra,
  };
}

function month(days: Array<{ day: number; words: unknown[] }>, extra = {}) {
  return { month: "2026-04", days, ...extra };
}

describe("a well-formed month", () => {
  it("parses", () => {
    const parsed = parseVocabMonth(month([{ day: 1, words: [word("abate")] }]));
    expect(parsed.month).toBe("2026-04");
    expect(parsed.days).toHaveLength(1);
    expect(parsed.days[0].words[0].word).toBe("abate");
  });

  it("falls back to the month key for a display name", () => {
    expect(parseVocabMonth(month([{ day: 1, words: [word("a")] }])).displayName).toBe(
      "2026-04",
    );
  });

  it("keeps optional metadata", () => {
    const parsed = parseVocabMonth(
      month([{ day: 1, words: [word("a")] }], {
        author: "Someone",
        description: "A description",
        createdAt: "2026-04-01T00:00:00Z",
      }),
    );
    expect(parsed.author).toBe("Someone");
    expect(parsed.description).toBe("A description");
  });

  it("sorts days, so a file listing them out of order still reads correctly", () => {
    const parsed = parseVocabMonth(
      month([
        { day: 3, words: [word("c")] },
        { day: 1, words: [word("a")] },
        { day: 2, words: [word("b")] },
      ]),
    );
    expect(parsed.days.map((d) => d.day)).toEqual([1, 2, 3]);
  });

  it("keeps synonyms and antonyms, dropping non-strings", () => {
    const parsed = parseVocabMonth(
      month([
        { day: 1, words: [word("a", { synonyms: ["x", 42, "y"], antonyms: [] })] },
      ]),
    );
    expect(parsed.days[0].words[0].synonyms).toEqual(["x", "y"]);
  });
});

describe("word ids are unique within a month", () => {
  // Found by audit. Progress records are keyed by word id, so two words
  // sharing one means mastering either marks both — silently.
  it("separates two words whose slugs collide", () => {
    const parsed = parseVocabMonth(
      month([{ day: 1, words: [word("well-being"), word("well being")] }]),
    );
    const ids = allWordsInMonth(parsed).map((w) => w.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("separates two words given the same explicit id", () => {
    const parsed = parseVocabMonth(
      month([
        { day: 1, words: [word("alpha", { id: "same" }), word("bravo", { id: "same" })] },
      ]),
    );
    expect(new Set(allWordsInMonth(parsed).map((w) => w.id)).size).toBe(2);
  });

  it("separates a collision across different days", () => {
    const parsed = parseVocabMonth(
      month([
        { day: 1, words: [word("abate")] },
        { day: 2, words: [word("abate")] },
      ]),
    );
    expect(new Set(allWordsInMonth(parsed).map((w) => w.id)).size).toBe(2);
  });

  it("leaves the first one alone, so existing progress still matches", () => {
    const parsed = parseVocabMonth(
      month([{ day: 1, words: [word("well-being"), word("well being")] }]),
    );
    expect(allWordsInMonth(parsed)[0].id).toBe("2026-04-well-being");
  });

  it("is deterministic — progress survives a reload", () => {
    // Ids must not depend on when the file was parsed, or every reload
    // orphans the progress recorded against the previous ids.
    const input = month([{ day: 1, words: [word("well-being"), word("well being")] }]);
    const first = allWordsInMonth(parseVocabMonth(input)).map((w) => w.id);
    const second = allWordsInMonth(parseVocabMonth(input)).map((w) => w.id);
    expect(first).toEqual(second);
  });
});

describe("a day may only be listed once", () => {
  // Found by audit. Two day-1 entries both parsed, but `wordsForDay` returns
  // only the first — so a word was counted in the totals and never shown, and
  // the progress bar read "0 of 2 mastered" beside a single card.
  it("is rejected", () => {
    expect(() =>
      parseVocabMonth(
        month([
          { day: 1, words: [word("alpha")] },
          { day: 1, words: [word("bravo")] },
        ]),
      ),
    ).toThrow(/more than once/);
  });

  it("names the day, so the file can be fixed", () => {
    expect(() =>
      parseVocabMonth(
        month([
          { day: 7, words: [word("a")] },
          { day: 7, words: [word("b")] },
        ]),
      ),
    ).toThrow(/Day 7/);
  });

  it("still accepts every day used once", () => {
    const parsed = parseVocabMonth(
      month(Array.from({ length: 31 }, (_, i) => ({ day: i + 1, words: [word(`w${i}`)] }))),
    );
    expect(parsed.days).toHaveLength(31);
  });
});

describe("rejecting malformed input", () => {
  it.each([
    ["null", null],
    ["a string", "not a month"],
    ["a number", 7],
    ["an array", []],
  ])("rejects %s", (_name, raw) => {
    expect(() => parseVocabMonth(raw)).toThrow();
  });

  it.each([
    ["a missing month", { days: [{ day: 1, words: [word("a")] }] }],
    ["a malformed month", month([{ day: 1, words: [word("a")] }], { month: "April" })],
    ["no days", { month: "2026-04", days: [] }],
    ["days that are not an array", { month: "2026-04", days: {} }],
  ])("rejects %s", (_name, raw) => {
    expect(() => parseVocabMonth(raw as unknown)).toThrow();
  });

  it.each([
    ["day 0", 0],
    ["day 32", 32],
    ["a fractional day", 1.5],
  ])("rejects %s", (_name, day) => {
    expect(() =>
      parseVocabMonth(month([{ day: day as number, words: [word("a")] }])),
    ).toThrow();
  });

  it("rejects a day with no words", () => {
    expect(() => parseVocabMonth(month([{ day: 1, words: [] }]))).toThrow(/no words/);
  });

  it.each(["word", "partOfSpeech", "definition", "example", "mnemonic"])(
    "rejects a word missing %s",
    (field) => {
      const incomplete = word("abate");
      delete (incomplete as Record<string, unknown>)[field];
      expect(() => parseVocabMonth(month([{ day: 1, words: [incomplete] }]))).toThrow();
    },
  );

  it("rejects a whitespace-only field", () => {
    expect(() =>
      parseVocabMonth(month([{ day: 1, words: [word("a", { definition: "   " })] }])),
    ).toThrow(/definition/);
  });

  it("names the word in the message, not just an index", () => {
    expect(() =>
      parseVocabMonth(month([{ day: 1, words: [word("perspicacious", { example: "" })] }])),
    ).toThrow(/perspicacious/);
  });
});

describe("reading a month", () => {
  const parsed = parseVocabMonth(
    month([
      { day: 1, words: [word("alpha"), word("bravo")] },
      { day: 2, words: [word("charlie")] },
    ]),
  );

  it("flattens every word in day order", () => {
    expect(allWordsInMonth(parsed).map((w) => w.word)).toEqual([
      "alpha",
      "bravo",
      "charlie",
    ]);
  });

  it("returns one day's words", () => {
    expect(wordsForDay(parsed, 1).map((w) => w.word)).toEqual(["alpha", "bravo"]);
  });

  it("returns nothing for a day the month does not have", () => {
    expect(wordsForDay(parsed, 9)).toEqual([]);
  });

  it("agrees with itself: every day's words are in the flattened list", () => {
    const flat = allWordsInMonth(parsed).length;
    const byDay = parsed.days.reduce((n, d) => n + wordsForDay(parsed, d.day).length, 0);
    // This is what the duplicate-day defect broke.
    expect(byDay).toBe(flat);
  });
});

describe("firstFreeMonthKey", () => {
  it("is a well-formed month key", () => {
    expect(firstFreeMonthKey({})).toMatch(/^\d{4}-\d{2}$/);
  });

  it("skips months already loaded", () => {
    const taken = firstFreeMonthKey({});
    expect(firstFreeMonthKey({ [taken]: {} })).not.toBe(taken);
  });

  it("keeps skipping across a run of loaded months", () => {
    const loaded: Record<string, unknown> = {};
    for (let i = 0; i < 5; i++) loaded[firstFreeMonthKey(loaded)] = {};
    expect(Object.keys(loaded)).toHaveLength(5);
    expect(new Set(Object.keys(loaded)).size).toBe(5);
  });
});

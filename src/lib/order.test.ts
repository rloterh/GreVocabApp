import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORD_ORDER,
  dayKey,
  orderWords,
  seedFor,
  WORD_ORDERS,
  type WordOrder,
} from "@/lib/order";
import type { VocabWord } from "@/types";

function word(w: string): VocabWord {
  return {
    id: w,
    word: w,
    partOfSpeech: "noun",
    definition: "A definition.",
    example: "An example.",
    mnemonic: "A mnemonic.",
  };
}

/** Deliberately not alphabetical: a teaching order, as a month would have. */
const WORDS = ["zealous", "abate", "mercurial", "cogent", "belie"].map(word);
const NAMES = (words: VocabWord[]) => words.map((w) => w.word);

describe("the default", () => {
  it("is authored, because the stored order is a teaching decision", () => {
    // A generated month builds difficulty deliberately; alphabetising it
    // throws that away.
    expect(DEFAULT_WORD_ORDER).toBe("authored");
  });

  it("offers exactly the three documented orders", () => {
    expect(WORD_ORDERS.map((o) => o.value)).toEqual([
      "authored",
      "alphabetical",
      "random",
    ]);
  });
});

describe("authored", () => {
  it("keeps the order exactly", () => {
    expect(NAMES(orderWords(WORDS, "authored"))).toEqual(NAMES(WORDS));
  });

  it("ignores the seed", () => {
    expect(NAMES(orderWords(WORDS, "authored", 1))).toEqual(
      NAMES(orderWords(WORDS, "authored", 999)),
    );
  });
});

describe("alphabetical", () => {
  it("sorts A to Z", () => {
    expect(NAMES(orderWords(WORDS, "alphabetical"))).toEqual([
      "abate",
      "belie",
      "cogent",
      "mercurial",
      "zealous",
    ]);
  });

  it("ignores case and leading punctuation", () => {
    const mixed = ["Zebra", "apple", '"Banana"'].map(word);
    expect(NAMES(orderWords(mixed, "alphabetical"))).toEqual([
      "apple",
      '"Banana"',
      "Zebra",
    ]);
  });

  it("ignores the seed", () => {
    expect(NAMES(orderWords(WORDS, "alphabetical", 7))).toEqual(
      NAMES(orderWords(WORDS, "alphabetical", 8)),
    );
  });
});

describe("random is stable", () => {
  it("gives the same permutation for the same seed", () => {
    // The property the whole design rests on. A shuffle that changed on every
    // render would move the card being read.
    const a = NAMES(orderWords(WORDS, "random", 12345));
    const b = NAMES(orderWords(WORDS, "random", 12345));
    expect(a).toEqual(b);
  });

  it("usually gives a different one for a different seed", () => {
    const permutations = new Set(
      Array.from({ length: 20 }, (_, i) =>
        NAMES(orderWords(WORDS, "random", i)).join(","),
      ),
    );
    // Not "always": two seeds may collide on a five-element list. But a PRNG
    // returning one permutation for twenty seeds is broken.
    expect(permutations.size).toBeGreaterThan(5);
  });

  it("actually shuffles", () => {
    const seeds = Array.from({ length: 20 }, (_, i) => i);
    const changed = seeds.some(
      (s) => NAMES(orderWords(WORDS, "random", s)).join() !== NAMES(WORDS).join(),
    );
    expect(changed).toBe(true);
  });

  it("keeps every word, exactly once", () => {
    for (let seed = 0; seed < 50; seed++) {
      const result = NAMES(orderWords(WORDS, "random", seed));
      // A shuffle that dropped or duplicated a word would lose vocabulary.
      expect(result.slice().sort()).toEqual(NAMES(WORDS).slice().sort());
    }
  });
});

describe("seeds", () => {
  it("are stable for the same inputs", () => {
    expect(seedFor(["2026-04", "month", "2026-09-11"])).toBe(
      seedFor(["2026-04", "month", "2026-09-11"]),
    );
  });

  it("differ by day, so tomorrow is a new order", () => {
    expect(seedFor(["2026-04", "month", "2026-09-11"])).not.toBe(
      seedFor(["2026-04", "month", "2026-09-12"]),
    );
  });

  it("differ by deck, so two decks of the same month are not identical", () => {
    expect(seedFor(["2026-04", "month", "d"])).not.toBe(
      seedFor(["2026-04", "mastered", "d"]),
    );
  });

  it("differ by month", () => {
    expect(seedFor(["2026-04", "month", "d"])).not.toBe(
      seedFor(["2026-05", "month", "d"]),
    );
  });

  it("are unsigned 32-bit, which the PRNG assumes", () => {
    for (const parts of [["a"], ["zzz", "yyy"], [""], ["2026-04", "month"]]) {
      const seed = seedFor(parts);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 32);
    }
  });

  it("spread, rather than clustering", () => {
    const seeds = new Set(
      Array.from({ length: 200 }, (_, i) => seedFor(["2026-04", "month", String(i)])),
    );
    expect(seeds.size).toBe(200);
  });
});

describe("dayKey", () => {
  it("is the local calendar day", () => {
    expect(dayKey(new Date(2026, 8, 11))).toBe("2026-09-11");
  });

  it("pads, so string comparison matches date order", () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("changes at midnight and not before", () => {
    expect(dayKey(new Date(2026, 8, 11, 23, 59))).toBe("2026-09-11");
    expect(dayKey(new Date(2026, 8, 12, 0, 0))).toBe("2026-09-12");
  });
});

describe("orderWords never mutates its input", () => {
  it.each(["authored", "alphabetical", "random"] as WordOrder[])("%s", (order) => {
    const original = [...WORDS];
    orderWords(WORDS, order, 42);
    // The store holds the authored order; it must stay recoverable.
    expect(WORDS).toEqual(original);
  });

  it("returns a new array every time", () => {
    expect(orderWords(WORDS, "authored")).not.toBe(WORDS);
  });
});

describe("edge cases", () => {
  it.each(["authored", "alphabetical", "random"] as WordOrder[])(
    "%s handles an empty list",
    (order) => {
      expect(orderWords([], order, 1)).toEqual([]);
    },
  );

  it.each(["authored", "alphabetical", "random"] as WordOrder[])(
    "%s handles one word",
    (order) => {
      expect(NAMES(orderWords([word("solo")], order, 1))).toEqual(["solo"]);
    },
  );
});

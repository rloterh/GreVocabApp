/**
 * The schedule: the only place a teaching position becomes a date.
 *
 * Everything here is arithmetic, and all of it is load-bearing — a schedule
 * that is off by one month shows the wrong words for a month before anybody
 * notices, and by then they have studied them.
 */

import { describe, expect, it } from "vitest";
import {
  GAP,
  addCalendarMonths,
  calendarMonthAt,
  calendarMonthOf,
  calendarMonthOfDate,
  calendarMonthsBetween,
  identitySchedule,
  isCalendarMonth,
  isUnarranged,
  lastCalendarMonth,
  ordinalForCalendarMonth,
  positionOf,
  reconcile,
  redistributeWords,
  shuffledSchedule,
  timeline,
} from "./schedule";
import type { Schedule, VocabMonth } from "@/types";

const THIRTY_SIX = Array.from({ length: 36 }, (_, i) => i + 1);

function schedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    track: "gre",
    startMonth: "2027-03",
    order: THIRTY_SIX,
    shuffleSeed: null,
    ...overrides,
  };
}

// --- Calendar arithmetic -----------------------------------------------------

describe("addCalendarMonths", () => {
  it("adds within a year", () => {
    expect(addCalendarMonths("2027-03", 2)).toBe("2027-05");
  });

  it("rolls over a year boundary", () => {
    expect(addCalendarMonths("2026-11", 3)).toBe("2027-02");
  });

  it("goes backwards", () => {
    expect(addCalendarMonths("2027-02", -3)).toBe("2026-11");
  });

  it("crosses several years", () => {
    expect(addCalendarMonths("2026-10", 36)).toBe("2029-10");
  });

  it("never skips February", () => {
    // Doing this through a Date lands 31 January + 1 month on 3 March in
    // every JavaScript engine. A schedule that skips a month is not one.
    expect(addCalendarMonths("2027-01", 1)).toBe("2027-02");
  });

  it("is its own inverse", () => {
    for (let n = -30; n <= 30; n++) {
      expect(addCalendarMonths(addCalendarMonths("2027-06", n), -n)).toBe("2027-06");
    }
  });
});

describe("calendarMonthsBetween", () => {
  it("counts forwards", () => {
    expect(calendarMonthsBetween("2027-03", "2027-06")).toBe(3);
  });

  it("counts backwards as negative", () => {
    expect(calendarMonthsBetween("2027-06", "2027-03")).toBe(-3);
  });

  it("is zero for the same month", () => {
    expect(calendarMonthsBetween("2027-03", "2027-03")).toBe(0);
  });

  it("agrees with addCalendarMonths", () => {
    for (let n = 0; n < 40; n++) {
      expect(
        calendarMonthsBetween("2026-08", addCalendarMonths("2026-08", n)),
      ).toBe(n);
    }
  });
});

describe("isCalendarMonth", () => {
  it.each([
    ["2027-03", true],
    ["2027-12", true],
    ["2027-13", false],
    ["2027-00", false],
    ["2027-3", false],
    ["gre/01", false],
    ["", false],
  ])("%s -> %s", (value, expected) => {
    expect(isCalendarMonth(value)).toBe(expected);
  });
});

describe("calendarMonthOfDate", () => {
  it("pads a single-digit month", () => {
    expect(calendarMonthOfDate(new Date(2027, 2, 15))).toBe("2027-03");
  });

  it("reads local time, not UTC", () => {
    // The user's month is the one on their wall, not on a server's.
    const lastMomentOfMarch = new Date(2027, 2, 31, 23, 59);
    expect(calendarMonthOfDate(lastMomentOfMarch)).toBe("2027-03");
  });
});

// --- Reading a schedule ------------------------------------------------------

describe("calendarMonthOf and ordinalForCalendarMonth", () => {
  it("puts month one in the start month", () => {
    expect(calendarMonthOf(schedule(), 1)).toBe("2027-03");
  });

  it("runs consecutively from there", () => {
    expect(calendarMonthOf(schedule(), 12)).toBe("2028-02");
    expect(calendarMonthOf(schedule(), 36)).toBe("2030-02");
  });

  it("round-trips for every month of a three-year track", () => {
    const s = schedule();
    for (const ordinal of THIRTY_SIX) {
      expect(ordinalForCalendarMonth(s, calendarMonthOf(s, ordinal)!)).toBe(ordinal);
    }
  });

  it("answers null before the start and after the end", () => {
    const s = schedule();
    expect(ordinalForCalendarMonth(s, "2027-02")).toBeNull();
    expect(ordinalForCalendarMonth(s, "2030-03")).toBeNull();
  });

  it("follows a reordering rather than the ordinal", () => {
    const s = schedule({ order: [7, 3, 1] });
    expect(calendarMonthOf(s, 7)).toBe("2027-03");
    expect(calendarMonthOf(s, 1)).toBe("2027-05");
    expect(ordinalForCalendarMonth(s, "2027-04")).toBe(3);
  });

  it("answers null for an ordinal the schedule does not hold", () => {
    expect(calendarMonthOf(schedule({ order: [1, 2] }), 9)).toBeNull();
  });

  it("treats a gap as nothing studied", () => {
    const s = schedule({ order: [1, GAP, 2] });
    expect(ordinalForCalendarMonth(s, "2027-04")).toBeNull();
    expect(ordinalForCalendarMonth(s, "2027-05")).toBe(2);
    expect(positionOf(s, GAP)).toBe(-1);
  });
});

describe("timeline", () => {
  it("pairs each month with its calendar month, in teaching order", () => {
    expect(timeline(schedule({ order: [3, 1, 2] }))).toEqual([
      { ordinal: 3, position: 0, month: "2027-03" },
      { ordinal: 1, position: 1, month: "2027-04" },
      { ordinal: 2, position: 2, month: "2027-05" },
    ]);
  });

  it("omits gaps without shifting what follows", () => {
    expect(timeline(schedule({ order: [1, GAP, 2] }))).toEqual([
      { ordinal: 1, position: 0, month: "2027-03" },
      { ordinal: 2, position: 2, month: "2027-05" },
    ]);
  });
});

describe("lastCalendarMonth", () => {
  it("is the month the schedule runs out", () => {
    expect(lastCalendarMonth(schedule())).toBe("2030-02");
  });

  it("is null for an empty schedule", () => {
    expect(lastCalendarMonth(schedule({ order: [] }))).toBeNull();
  });
});

// --- Building and maintaining -------------------------------------------------

describe("identitySchedule", () => {
  it("is the corpus's own order", () => {
    expect(identitySchedule("gre", "2027-03", [3, 1, 2]).order).toEqual([1, 2, 3]);
  });
});

describe("shuffledSchedule", () => {
  it("is a permutation — nothing gained, nothing lost", () => {
    const s = shuffledSchedule("gre", "2027-03", THIRTY_SIX, "seed");
    expect([...s.order].sort((a, b) => a - b)).toEqual(THIRTY_SIX);
  });

  it("reproduces the same layout from the same seed", () => {
    expect(shuffledSchedule("gre", "2027-03", THIRTY_SIX, "abc").order).toEqual(
      shuffledSchedule("gre", "2027-03", THIRTY_SIX, "abc").order,
    );
  });

  it("gives a different layout for a different seed", () => {
    expect(shuffledSchedule("gre", "2027-03", THIRTY_SIX, "abc").order).not.toEqual(
      shuffledSchedule("gre", "2027-03", THIRTY_SIX, "xyz").order,
    );
  });

  it("shuffles the two tracks independently", () => {
    expect(shuffledSchedule("gre", "2027-03", THIRTY_SIX, "s").order).not.toEqual(
      shuffledSchedule("sat", "2027-03", THIRTY_SIX, "s").order,
    );
  });

  it("actually moves something", () => {
    expect(shuffledSchedule("gre", "2027-03", THIRTY_SIX, "s").order).not.toEqual(
      THIRTY_SIX,
    );
  });
});

describe("reconcile", () => {
  it("returns the same object when nothing changed", () => {
    const s = schedule({ order: [1, 2, 3] });
    expect(reconcile(s, [1, 2, 3])).toBe(s);
  });

  it("drops an ordinal whose month is gone", () => {
    expect(reconcile(schedule({ order: [1, 2, 3] }), [1, 3]).order).toEqual([1, 3]);
  });

  it("keeps an unarranged schedule in teaching order", () => {
    // Loading month 3 after month 5 must not teach them in arrival order.
    expect(reconcile(schedule({ order: [5] }), [3, 5]).order).toEqual([3, 5]);
  });

  it("appends to an arranged one rather than resorting it", () => {
    // The user put these in this order. A new month goes on the end; it does
    // not get slotted into their sequence.
    const arranged = schedule({ order: [3, 1], shuffleSeed: "s" });
    expect(reconcile(arranged, [1, 2, 3]).order).toEqual([3, 1, 2]);
  });

  it("preserves a migrated gap", () => {
    const gapped = schedule({ order: [1, GAP, 2] });
    expect(reconcile(gapped, [1, 2, 3]).order).toEqual([1, GAP, 2, 3]);
  });
});

describe("isUnarranged", () => {
  it.each<[string, Schedule, boolean]>([
    ["the corpus's own order", schedule({ order: [1, 2, 3] }), true],
    ["a reordering", schedule({ order: [2, 1, 3] }), false],
    ["a shuffled corpus", schedule({ shuffleSeed: "s" }), false],
    ["one with a gap", schedule({ order: [1, GAP, 2] }), false],
    ["an empty one", schedule({ order: [] }), true],
  ])("%s -> %s", (_name, s, expected) => {
    expect(isUnarranged(s)).toBe(expected);
  });
});

// --- Redistribution ----------------------------------------------------------

function month(ordinal: number, words: string[]): VocabMonth {
  return {
    track: "gre",
    ordinal,
    title: `Month ${ordinal}`,
    days: words.map((w, i) => ({
      day: i + 1,
      words: [
        {
          id: `gre-${w}`,
          word: w,
          partOfSpeech: "verb",
          definition: "d",
          example: "e",
          mnemonic: "m",
        },
      ],
    })),
  };
}

const CORPUS = [
  month(1, ["abate", "cogent", "ephemeral"]),
  month(2, ["laconic", "obdurate"]),
];

describe("redistributeWords", () => {
  const shuffled = redistributeWords(CORPUS, "seed");
  const wordsOf = (ms: VocabMonth[]) =>
    ms.flatMap((m) => m.days.flatMap((d) => d.words.map((w) => w.word))).sort();

  it("keeps every word", () => {
    expect(wordsOf(shuffled)).toEqual(wordsOf(CORPUS));
  });

  it("keeps every id, which is what keeps every progress record", () => {
    const ids = (ms: VocabMonth[]) =>
      ms.flatMap((m) => m.days.flatMap((d) => d.words.map((w) => w.id))).sort();
    expect(ids(shuffled)).toEqual(ids(CORPUS));
  });

  it("keeps the shape of every month and day", () => {
    expect(shuffled.map((m) => m.days.map((d) => d.words.length))).toEqual(
      CORPUS.map((m) => m.days.map((d) => d.words.length)),
    );
    expect(shuffled.map((m) => m.ordinal)).toEqual([1, 2]);
  });

  it("does not mutate what it was given", () => {
    expect(CORPUS[0].days[0].words[0].word).toBe("abate");
  });

  it("reproduces the same layout from the same seed", () => {
    expect(redistributeWords(CORPUS, "seed")).toEqual(shuffled);
  });

  it("moves something", () => {
    expect(shuffled).not.toEqual(CORPUS);
  });

  it("handles an empty corpus", () => {
    expect(redistributeWords([], "seed")).toEqual([]);
  });
});

describe("calendarMonthAt", () => {
  it("counts positions from the start month", () => {
    expect(calendarMonthAt(schedule(), 0)).toBe("2027-03");
    expect(calendarMonthAt(schedule(), 11)).toBe("2028-02");
  });
});

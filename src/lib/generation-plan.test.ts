import { describe, expect, it } from "vitest";
import {
  DAYS_PER_MONTH,
  defaultPlan,
  difficultyAt,
  difficultyLabel,
  dedupeRequested,
  distributeMustInclude,
  HORIZON_MONTHS,
  planErrors,
  planMonths,
  previewPlan,
  requestCount,
  splitWordList,
  totalWords,
  type GenerationPlan,
  type Horizon,
} from "@/lib/generation-plan";
import { VocabIndex } from "@/lib/vocab-index";
import type { VocabMonth } from "@/types";

function plan(overrides: Partial<GenerationPlan> = {}): GenerationPlan {
  return { ...defaultPlan("2026-10"), ...overrides };
}

function monthOf(key: string, words: string[]): VocabMonth {
  return {
    month: key,
    displayName: key,
    days: words.map((w, i) => ({
      day: i + 1,
      words: [
        {
          id: w,
          word: w,
          partOfSpeech: "noun",
          definition: "d",
          example: "e",
          mnemonic: "m",
        },
      ],
    })),
  };
}

describe("planMonths", () => {
  it.each<[Horizon, number]>([
    ["month", 1],
    ["quarter", 3],
    ["half-year", 6],
    ["year", 12],
  ])("produces %s months for a %s", (horizon, count) => {
    expect(planMonths(plan({ horizon }))).toHaveLength(count);
  });

  it("starts at the start month", () => {
    expect(planMonths(plan({ horizon: "quarter" }))).toEqual([
      "2026-10",
      "2026-11",
      "2026-12",
    ]);
  });

  it("rolls over the year boundary", () => {
    // December + 1 is January of the next year, not month 13.
    expect(planMonths(plan({ startMonth: "2026-11", horizon: "quarter" }))).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
    ]);
  });

  it("produces no duplicate months across a year", () => {
    const months = planMonths(plan({ horizon: "year" }));
    expect(new Set(months).size).toBe(12);
  });
});

describe("sizing", () => {
  it("a year at three a day is about 1,100 words", () => {
    // The figure the definition of done names.
    const total = totalWords(plan({ horizon: "year", wordsPerDay: 3 }));
    expect(total).toBe(12 * 30 * 3);
    expect(total).toBeGreaterThan(1000);
  });

  it("scales with words per day", () => {
    expect(totalWords(plan({ horizon: "month", wordsPerDay: 5 }))).toBe(
      5 * DAYS_PER_MONTH,
    );
  });

  it("asks for 25% more than it needs", () => {
    // The core trick: enforce uniqueness locally rather than trusting a long
    // avoid-list to be respected.
    expect(requestCount(90)).toBe(113);
    expect(requestCount(4)).toBe(5);
    expect(requestCount(1)).toBe(2);
  });

  it("never asks for less than it needs", () => {
    for (let n = 1; n < 200; n++) expect(requestCount(n)).toBeGreaterThanOrEqual(n);
  });
});

describe("the difficulty curve", () => {
  it("climbs across a year when steady", () => {
    const p = plan({ horizon: "year", difficulty: "steady" });
    const first = difficultyAt(p, 0);
    const last = difficultyAt(p, 11);
    expect(last).toBeGreaterThan(first);
  });

  it("stays low when gentle", () => {
    const p = plan({ horizon: "year", difficulty: "gentle" });
    // Gentle is the promise that month 12 is still approachable.
    expect(difficultyAt(p, 11)).toBeLessThan(0.5);
  });

  it("starts hard when aggressive", () => {
    const p = plan({ horizon: "year", difficulty: "aggressive" });
    expect(difficultyAt(p, 0)).toBeGreaterThan(0.7);
  });

  it("is monotonic for every setting", () => {
    for (const difficulty of ["gentle", "steady", "aggressive"] as const) {
      const p = plan({ horizon: "year", difficulty });
      for (let i = 1; i < 12; i++) {
        expect(difficultyAt(p, i), `${difficulty} at ${i}`).toBeGreaterThanOrEqual(
          difficultyAt(p, i - 1),
        );
      }
    }
  });

  it("stays within 0 and 1", () => {
    for (const difficulty of ["gentle", "steady", "aggressive"] as const) {
      for (const horizon of Object.keys(HORIZON_MONTHS) as Horizon[]) {
        const p = plan({ horizon, difficulty });
        for (let i = 0; i < HORIZON_MONTHS[horizon]; i++) {
          const level = difficultyAt(p, i);
          expect(level).toBeGreaterThanOrEqual(0);
          expect(level).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("gives a single month a sensible midpoint rather than dividing by zero", () => {
    const level = difficultyAt(plan({ horizon: "month" }), 0);
    expect(Number.isFinite(level)).toBe(true);
  });

  it("turns a level into words a prompt can use", () => {
    expect(difficultyLabel(0.1)).toMatch(/approachable/);
    expect(difficultyLabel(0.9)).toMatch(/hardest/);
  });
});

describe("required words", () => {
  it("drops repeats, keeping the first spelling", () => {
    expect(dedupeRequested(["Abate", "abate", "  abate  ", "cogent"])).toEqual([
      "Abate",
      "cogent",
    ]);
  });

  it("drops entries that are not words", () => {
    expect(dedupeRequested(["", "   ", "...", "cogent"])).toEqual(["cogent"]);
  });

  it("puts them in the earliest months", () => {
    // A word the user asked for should not land in month 11 of a year they
    // may never finish.
    const p = plan({ horizon: "year", wordsPerDay: 1, mustInclude: ["abate"] });
    const spread = distributeMustInclude(p);
    expect(spread.get("2026-10")).toEqual(["abate"]);
    expect(spread.get("2027-09")).toEqual([]);
  });

  it("spills into later months once one is full", () => {
    const p = plan({
      horizon: "quarter",
      wordsPerDay: 1,
      // 30 words per month at 1/day, so the 31st belongs to month two.
      mustInclude: Array.from({ length: 31 }, (_, i) => `word${i}`),
    });
    const spread = distributeMustInclude(p);
    expect(spread.get("2026-10")).toHaveLength(30);
    expect(spread.get("2026-11")).toEqual(["word30"]);
  });

  it("covers every month of the plan", () => {
    const spread = distributeMustInclude(plan({ horizon: "quarter" }));
    expect([...spread.keys()]).toEqual(["2026-10", "2026-11", "2026-12"]);
  });
});

describe("previewPlan", () => {
  it("describes each month without contacting anything", () => {
    const preview = previewPlan(plan({ horizon: "quarter", wordsPerDay: 3 }));
    expect(preview.months).toHaveLength(3);
    expect(preview.months[0].words).toBe(90);
    expect(preview.totalWords).toBe(270);
  });

  it("carries themes through when supplied", () => {
    const preview = previewPlan(
      plan({ horizon: "quarter", themes: ["law", "science", "art"] }),
    );
    expect(preview.months.map((m) => m.theme)).toEqual(["law", "science", "art"]);
  });

  it("warns when the list does not fit, rather than truncating in silence", () => {
    const preview = previewPlan(
      plan({
        horizon: "month",
        wordsPerDay: 1,
        mustInclude: Array.from({ length: 40 }, (_, i) => `w${i}`),
      }),
    );
    expect(preview.warnings.join(" ")).toMatch(/only holds 30/);
  });

  it("warns about repeats in the user's own list", () => {
    const preview = previewPlan(plan({ mustInclude: ["abate", "abate"] }));
    expect(preview.warnings.join(" ")).toMatch(/repeated word/);
  });

  it("says which requested words the user already has", () => {
    const index = VocabIndex.from([monthOf("2026-04", ["abate", "cogent"])]);
    const preview = previewPlan(
      plan({ mustInclude: ["abating", "perspicacious"] }),
      index,
    );
    expect(preview.alreadyHave).toEqual([
      { word: "abating", monthKey: "2026-04", retired: false },
    ]);
    expect(preview.warnings.join(" ")).toMatch(/already in your vocabulary/);
  });

  it("flags a retired collision as retired", () => {
    const index = VocabIndex.from([monthOf("2026-04", ["abate"])]);
    index.retireMonth("2026-04");
    const preview = previewPlan(plan({ mustInclude: ["abate"] }), index);
    expect(preview.alreadyHave[0].retired).toBe(true);
  });

  it("is quiet when there is nothing to say", () => {
    expect(previewPlan(plan()).warnings).toEqual([]);
  });
});

describe("planErrors", () => {
  it("accepts a sane plan", () => {
    expect(planErrors(plan())).toEqual([]);
  });

  it.each([
    ["a malformed start month", { startMonth: "October" }],
    ["zero words per day", { wordsPerDay: 0 }],
    ["a fractional words per day", { wordsPerDay: 2.5 }],
    ["too many words per day", { wordsPerDay: 40 }],
    ["an empty register", { register: "  " }],
  ])("rejects %s", (_name, overrides) => {
    expect(planErrors(plan(overrides as Partial<GenerationPlan>)).length)
      .toBeGreaterThan(0);
  });
});

describe("splitWordList", () => {
  it("accepts one per line", () => {
    expect(splitWordList("abate\ncogent\nlaconic")).toEqual([
      "abate",
      "cogent",
      "laconic",
    ]);
  });

  it("accepts commas", () => {
    expect(splitWordList("abate, cogent,laconic")).toEqual([
      "abate",
      "cogent",
      "laconic",
    ]);
  });

  it("accepts both at once, because users do both and neither is wrong", () => {
    expect(splitWordList("abate, cogent\nlaconic")).toEqual([
      "abate",
      "cogent",
      "laconic",
    ]);
  });

  it("ignores blank lines and stray separators", () => {
    expect(splitWordList("\n\nabate,,\n  ,cogent\n")).toEqual(["abate", "cogent"]);
  });

  it("is empty for empty input", () => {
    expect(splitWordList("")).toEqual([]);
    expect(splitWordList("   \n  ")).toEqual([]);
  });
});

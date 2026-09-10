import { beforeEach, describe, expect, it } from "vitest";
import { useVocabStore } from "@/store/useVocabStore";
import type { VocabMonth } from "@/types";

const store = () => useVocabStore.getState();

function month(key: string, days = [1, 2]): VocabMonth {
  return {
    month: key,
    displayName: key,
    days: days.map((day) => ({
      day,
      words: [
        {
          id: `${key}-w${day}`,
          word: `word${day}`,
          partOfSpeech: "noun",
          definition: "A definition.",
          example: "An example sentence.",
          mnemonic: "A mnemonic.",
        },
      ],
    })),
  };
}

beforeEach(() => {
  useVocabStore.setState({ months: {}, activeMonthKey: null, selectedDay: 1 });
});

describe("loadMonth", () => {
  it("validates, stores, and reports the key", () => {
    const result = store().loadMonth(month("2026-04"));
    expect(result).toEqual({ ok: true, monthKey: "2026-04" });
    expect(store().hasMonthKey("2026-04")).toBe(true);
  });

  it("makes the first loaded month active, and leaves it that way", () => {
    store().loadMonth(month("2026-04"));
    expect(store().activeMonthKey).toBe("2026-04");
    store().loadMonth(month("2026-05"));
    expect(store().activeMonthKey).toBe("2026-04");
  });

  it("returns the validator's message instead of throwing", () => {
    const result = store().loadMonth({ month: "nope", days: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/month/i);
    expect(store().getAllMonths()).toHaveLength(0);
  });

  it("replaces a month loaded twice rather than duplicating it", () => {
    store().loadMonth(month("2026-04", [1, 2]));
    store().loadMonth(month("2026-04", [1, 2, 3]));
    expect(store().getAllMonths()).toHaveLength(1);
    expect(store().months["2026-04"].days).toHaveLength(3);
  });
});

describe("removeMonth", () => {
  it("drops the month and moves active to another one", () => {
    store().loadMonth(month("2026-04"));
    store().loadMonth(month("2026-05"));
    store().removeMonth("2026-04");

    expect(store().hasMonthKey("2026-04")).toBe(false);
    expect(store().activeMonthKey).toBe("2026-05");
  });

  it("clears the active key when the last month goes", () => {
    store().loadMonth(month("2026-04"));
    store().removeMonth("2026-04");
    expect(store().activeMonthKey).toBeNull();
    expect(store().getActiveMonth()).toBeNull();
  });

  it("leaves the active key alone when removing some other month", () => {
    store().loadMonth(month("2026-04"));
    store().loadMonth(month("2026-05"));
    store().removeMonth("2026-05");
    expect(store().activeMonthKey).toBe("2026-04");
  });
});

describe("selection", () => {
  it("resets to day 1 when the month changes", () => {
    store().loadMonth(month("2026-04"));
    store().loadMonth(month("2026-05"));
    store().setSelectedDay(2);
    store().setActiveMonth("2026-05");
    expect(store().selectedDay).toBe(1);
  });

  it("returns the selected day's words", () => {
    store().loadMonth(month("2026-04", [1, 2]));
    store().setSelectedDay(2);
    expect(store().getWordsForSelectedDay().map((w) => w.word)).toEqual([
      "word2",
    ]);
  });

  it("returns nothing for a day the month does not have", () => {
    store().loadMonth(month("2026-04", [1]));
    store().setSelectedDay(9);
    expect(store().getWordsForSelectedDay()).toEqual([]);
    expect(store().hasDayInMonth("2026-04", 9)).toBe(false);
  });

  it("returns nothing when no month is active", () => {
    expect(store().getWordsForSelectedDay()).toEqual([]);
  });
});

describe("getAllMonths", () => {
  it("sorts chronologically regardless of load order", () => {
    store().loadMonth(month("2026-05"));
    store().loadMonth(month("2026-04"));
    store().loadMonth(month("2026-06"));
    expect(store().getAllMonths().map((m) => m.month)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
  });
});

/**
 * @vitest-environment jsdom
 *
 * jsdom for a real `localStorage`: the retired-words ledger has to survive a
 * restart, and asserting that against a store that silently skipped persisting
 * would prove nothing.
 */

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
  localStorage.clear();
  useVocabStore.setState({
    months: {},
    retiredWords: [],
    activeMonthKey: null,
    selectedDay: 1,
  });
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

/** A month whose words are named, for the index tests below. */
function namedMonth(key: string, words: string[]): VocabMonth {
  return {
    month: key,
    displayName: key,
    days: words.map((w, i) => ({
      day: i + 1,
      words: [
        {
          id: `${key}-${w}`,
          word: w,
          partOfSpeech: "noun",
          definition: "A definition.",
          example: "An example sentence.",
          mnemonic: "A mnemonic.",
        },
      ],
    })),
  };
}

describe("the vocabulary index", () => {
  it("knows every loaded word", () => {
    store().loadMonth(namedMonth("2026-04", ["abate", "cogent"]));
    const index = store().getVocabIndex();
    expect(index.has("abate")).toBe(true);
    expect(index.has("cogent")).toBe(true);
  });

  it("catches inflections, not just exact strings", () => {
    store().loadMonth(namedMonth("2026-04", ["abate"]));
    expect(store().getVocabIndex().has("abatement")).toBe(true);
  });

  it("is rebuilt from the months, so it cannot go stale", () => {
    store().loadMonth(namedMonth("2026-04", ["abate"]));
    expect(store().getVocabIndex().size).toBe(1);
    store().loadMonth(namedMonth("2026-05", ["cogent"]));
    expect(store().getVocabIndex().size).toBe(2);
  });
});

describe("removing a month retires its words", () => {
  beforeEach(() => {
    store().loadMonth(namedMonth("2026-04", ["abate", "cogent"]));
    store().loadMonth(namedMonth("2026-05", ["laconic"]));
    store().removeMonth("2026-04");
  });

  it("still blocks them from being generated again", () => {
    // The whole point of retirement: the user already studied these, and
    // handing them back would also silently reattach their progress records.
    const index = store().getVocabIndex();
    expect(index.has("abate")).toBe(true);
    expect(index.has("cogent")).toBe(true);
  });

  it("blocks their inflections too", () => {
    expect(store().getVocabIndex().has("abating")).toBe(true);
  });

  it("marks them retired rather than as belonging to a live month", () => {
    const index = store().getVocabIndex();
    expect(index.lookup("abate")?.retiredAt).toBeTruthy();
    expect(index.lookup("laconic")?.retiredAt).toBeUndefined();
  });

  it("persists the ledger, because the month it came from is gone", () => {
    const stored = JSON.parse(localStorage.getItem("lexicon.vocab.v1") ?? "{}");
    const words = stored.state.retiredWords.map((e: { word: string }) => e.word);
    expect(words.sort()).toEqual(["abate", "cogent"]);
  });

  it("keeps the block across a restart", () => {
    const stored = JSON.parse(localStorage.getItem("lexicon.vocab.v1") ?? "{}");
    // Rehydrate the way a fresh launch would: months from storage, and a
    // ledger that is now the only record April ever existed.
    useVocabStore.setState({
      months: stored.state.months,
      retiredWords: stored.state.retiredWords,
    });
    expect(store().getVocabIndex().has("abate")).toBe(true);
  });

  it("does not record the same word twice", () => {
    store().loadMonth(namedMonth("2026-04", ["abate", "cogent"]));
    store().removeMonth("2026-04");
    expect(store().retiredWords).toHaveLength(2);
  });
});

describe("releasing retired words", () => {
  beforeEach(() => {
    store().loadMonth(namedMonth("2026-04", ["abate"]));
    store().loadMonth(namedMonth("2026-05", ["laconic"]));
    store().removeMonth("2026-04");
    store().removeMonth("2026-05");
  });

  it("frees one month's words when asked", () => {
    expect(store().releaseRetired("2026-04")).toBe(1);
    const index = store().getVocabIndex();
    expect(index.has("abate")).toBe(false);
    expect(index.has("laconic")).toBe(true);
  });

  it("frees everything when asked for everything", () => {
    expect(store().releaseRetired()).toBe(2);
    expect(store().getVocabIndex().size).toBe(0);
  });

  it("never touches a word that is still loaded", () => {
    store().loadMonth(namedMonth("2026-06", ["turgid"]));
    store().releaseRetired();
    expect(store().getVocabIndex().has("turgid")).toBe(true);
  });
});

describe("reloading a month that was retired", () => {
  it("lets the live copy outrank the retired record", () => {
    store().loadMonth(namedMonth("2026-04", ["abate"]));
    store().removeMonth("2026-04");
    store().loadMonth(namedMonth("2026-06", ["abate"]));

    // The truthful answer to "where is this word?" is the month it is in.
    const index = store().getVocabIndex();
    expect(index.lookup("abate")?.monthKey).toBe("2026-06");
    expect(index.lookup("abate")?.retiredAt).toBeUndefined();
  });
});

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

function month(ordinal: number, days = [1, 2]): VocabMonth {
  const key = `gre/${String(ordinal).padStart(2, "0")}`;
  return {
    track: "gre",
    ordinal,
    title: key,
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
    const result = store().loadMonth(month(1));
    expect(result).toEqual({ ok: true, monthKey: "gre/01" });
    expect(store().hasMonthKey("gre/01")).toBe(true);
  });

  it("makes the first loaded month active, and leaves it that way", () => {
    store().loadMonth(month(1));
    expect(store().activeMonthKey).toBe("gre/01");
    store().loadMonth(month(2));
    expect(store().activeMonthKey).toBe("gre/01");
  });

  it("returns the validator's message instead of throwing", () => {
    const result = store().loadMonth({ track: "gre", ordinal: 1, days: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/days/i);
    expect(store().getAllMonths()).toHaveLength(0);
  });

  it("replaces a month loaded twice rather than duplicating it", () => {
    store().loadMonth(month(1, [1, 2]));
    store().loadMonth(month(1, [1, 2, 3]));
    expect(store().getAllMonths()).toHaveLength(1);
    expect(store().months["gre/01"].days).toHaveLength(3);
  });
});

describe("removeMonth", () => {
  it("drops the month and moves active to another one", () => {
    store().loadMonth(month(1));
    store().loadMonth(month(2));
    store().removeMonth("gre/01");

    expect(store().hasMonthKey("gre/01")).toBe(false);
    expect(store().activeMonthKey).toBe("gre/02");
  });

  it("clears the active key when the last month goes", () => {
    store().loadMonth(month(1));
    store().removeMonth("gre/01");
    expect(store().activeMonthKey).toBeNull();
    expect(store().getActiveMonth()).toBeNull();
  });

  it("leaves the active key alone when removing some other month", () => {
    store().loadMonth(month(1));
    store().loadMonth(month(2));
    store().removeMonth("gre/02");
    expect(store().activeMonthKey).toBe("gre/01");
  });
});

describe("selection", () => {
  it("resets to day 1 when the month changes", () => {
    store().loadMonth(month(1));
    store().loadMonth(month(2));
    store().setSelectedDay(2);
    store().setActiveMonth("gre/02");
    expect(store().selectedDay).toBe(1);
  });

  it("returns the selected day's words", () => {
    store().loadMonth(month(1, [1, 2]));
    store().setSelectedDay(2);
    expect(store().getWordsForSelectedDay().map((w) => w.word)).toEqual([
      "word2",
    ]);
  });

  it("returns nothing for a day the month does not have", () => {
    store().loadMonth(month(1, [1]));
    store().setSelectedDay(9);
    expect(store().getWordsForSelectedDay()).toEqual([]);
    expect(store().hasDayInMonth("gre/01", 9)).toBe(false);
  });

  it("returns nothing when no month is active", () => {
    expect(store().getWordsForSelectedDay()).toEqual([]);
  });
});

describe("getAllMonths", () => {
  it("returns teaching order regardless of load order", () => {
    store().loadMonth(month(2));
    store().loadMonth(month(1));
    store().loadMonth(month(3));
    expect(store().getAllMonths().map((m) => m.ordinal)).toEqual([1, 2, 3]);
  });
});

/** A month whose words are named, for the index tests below. */
function namedMonth(ordinal: number, words: string[]): VocabMonth {
  const key = `gre/${String(ordinal).padStart(2, "0")}`;
  return {
    track: "gre",
    ordinal,
    title: key,
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
    store().loadMonth(namedMonth(1, ["abate", "cogent"]));
    const index = store().getVocabIndex();
    expect(index.has("abate")).toBe(true);
    expect(index.has("cogent")).toBe(true);
  });

  it("catches inflections, not just exact strings", () => {
    store().loadMonth(namedMonth(1, ["abate"]));
    expect(store().getVocabIndex().has("abatement")).toBe(true);
  });

  it("is rebuilt from the months, so it cannot go stale", () => {
    store().loadMonth(namedMonth(1, ["abate"]));
    expect(store().getVocabIndex().size).toBe(1);
    store().loadMonth(namedMonth(2, ["cogent"]));
    expect(store().getVocabIndex().size).toBe(2);
  });
});

describe("removing a month retires its words", () => {
  beforeEach(() => {
    store().loadMonth(namedMonth(1, ["abate", "cogent"]));
    store().loadMonth(namedMonth(2, ["laconic"]));
    store().removeMonth("gre/01");
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
    store().loadMonth(namedMonth(1, ["abate", "cogent"]));
    store().removeMonth("gre/01");
    expect(store().retiredWords).toHaveLength(2);
  });
});

describe("releasing retired words", () => {
  beforeEach(() => {
    store().loadMonth(namedMonth(1, ["abate"]));
    store().loadMonth(namedMonth(2, ["laconic"]));
    store().removeMonth("gre/01");
    store().removeMonth("gre/02");
  });

  it("frees one month's words when asked", () => {
    expect(store().releaseRetired("gre/01")).toBe(1);
    const index = store().getVocabIndex();
    expect(index.has("abate")).toBe(false);
    expect(index.has("laconic")).toBe(true);
  });

  it("frees everything when asked for everything", () => {
    expect(store().releaseRetired()).toBe(2);
    expect(store().getVocabIndex().size).toBe(0);
  });

  it("never touches a word that is still loaded", () => {
    store().loadMonth(namedMonth(3, ["turgid"]));
    store().releaseRetired();
    expect(store().getVocabIndex().has("turgid")).toBe(true);
  });
});

describe("reloading a month that was retired", () => {
  it("lets the live copy outrank the retired record", () => {
    store().loadMonth(namedMonth(1, ["abate"]));
    store().removeMonth("gre/01");
    store().loadMonth(namedMonth(3, ["abate"]));

    // The truthful answer to "where is this word?" is the month it is in.
    const index = store().getVocabIndex();
    expect(index.lookup("abate")?.monthKey).toBe("gre/03");
    expect(index.lookup("abate")?.retiredAt).toBeUndefined();
  });
});

describe("adding words to an existing month", () => {
  /** Cards as `generateCards` returns them. */
  function cards(...words: string[]) {
    return words.map((w) => ({
      id: `2026-04-${w}`,
      word: w,
      partOfSpeech: "noun",
      definition: "A definition.",
      example: "An example sentence.",
      mnemonic: "A mnemonic.",
    }));
  }

  beforeEach(() => {
    store().loadMonth(namedMonth(1, ["abate", "cogent"]));
  });

  it("appends them and reports how many landed", () => {
    const result = store().addWordsToMonth("gre/01", cards("turgid"));
    expect(result).toEqual({ ok: true, added: 1 });
    const words = store()
      .months["gre/01"].days.flatMap((d) => d.words)
      .map((w) => w.word);
    expect(words).toEqual(["abate", "cogent", "turgid"]);
  });

  it("leaves existing days exactly as they were", () => {
    const before = JSON.stringify(store().months["gre/01"].days[0]);
    store().addWordsToMonth("gre/01", cards("turgid", "laconic", "fervid", "dearth"));
    // A user part-way through a month must not find yesterday rearranged.
    expect(JSON.stringify(store().months["gre/01"].days[0])).toBe(before);
  });

  it("tops up the last day before opening a new one", () => {
    // The seeded month has one word on its last day, so two more belong there
    // rather than on a fresh day.
    store().addWordsToMonth("gre/01", cards("turgid", "laconic"), 3);
    const days = store().months["gre/01"].days;
    expect(days).toHaveLength(2);
    expect(days[1].words.map((w) => w.word)).toEqual(["cogent", "turgid", "laconic"]);
  });

  it("starts new days once the last one is full", () => {
    store().addWordsToMonth(
      "gre/01",
      cards("a", "b", "c", "d", "e"),
      3,
    );
    const days = store().months["gre/01"].days;
    expect(days.map((d) => d.day)).toEqual([1, 2, 3]);
    expect(days[2].words.map((w) => w.word)).toEqual(["c", "d", "e"]);
  });

  it("refuses a month that is not loaded", () => {
    const result = store().addWordsToMonth("gre/09", cards("turgid"));
    expect(result.ok).toBe(false);
  });

  it("is a no-op for an empty list", () => {
    const before = JSON.stringify(store().months["gre/01"]);
    expect(store().addWordsToMonth("gre/01", [])).toEqual({ ok: true, added: 0 });
    expect(JSON.stringify(store().months["gre/01"])).toBe(before);
  });

  it("reports what did not fit rather than silently dropping it", () => {
    // A month is 31 days. Anything past that has nowhere to go, and the
    // caller has to be able to say so.
    const many = cards(...Array.from({ length: 200 }, (_, i) => `w${i}`));
    const result = store().addWordsToMonth("gre/01", many, 3);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.added).toBeLessThan(many.length);
      expect(store().months["gre/01"].days.length).toBeLessThanOrEqual(31);
    }
  });

  it("puts the new words into the index", () => {
    store().addWordsToMonth("gre/01", cards("turgid"));
    expect(store().getVocabIndex().has("turgid")).toBe(true);
  });
});

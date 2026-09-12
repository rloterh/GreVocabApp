import { describe, expect, it } from "vitest";
import { VocabIndex, type VocabIndexEntry } from "@/lib/vocab-index";
import type { VocabMonth, VocabWord } from "@/types";

function word(w: string): VocabWord {
  return {
    id: w.toLowerCase(),
    word: w,
    partOfSpeech: "noun",
    definition: `The quality of being ${w}.`,
    example: `He was ${w}.`,
    mnemonic: `Think of ${w}.`,
  };
}

function month(ordinal: number, words: string[]): VocabMonth {
  return {
    track: "gre",
    ordinal,
    title: `Month ${ordinal}`,
    days: words.map((w, i) => ({ day: i + 1, words: [word(w)] })),
  };
}

const APRIL = month(1, ["abate", "cogent", "ephemeral"]);
const MAY = month(2, ["laconic", "obdurate"]);

describe("building the index", () => {
  it("holds every word from every month", () => {
    const index = VocabIndex.from([APRIL, MAY]);
    expect(index.size).toBe(5);
    for (const w of ["abate", "cogent", "ephemeral", "laconic", "obdurate"]) {
      expect(index.has(w), w).toBe(true);
    }
  });

  it("is empty for no months", () => {
    expect(VocabIndex.from([]).size).toBe(0);
  });

  it("does not know a word nobody has", () => {
    expect(VocabIndex.from([APRIL]).has("perspicacious")).toBe(false);
  });

  it("is idempotent — months are re-derived on every mutation", () => {
    const index = VocabIndex.from([APRIL]);
    index.addMonth(APRIL);
    index.addMonth(APRIL);
    expect(index.size).toBe(3);
  });

  it("says where a word came from", () => {
    const index = VocabIndex.from([APRIL]);
    expect(index.lookup("abate")?.monthKey).toBe("gre/01");
    expect(index.lookup("laconic")).toBeUndefined();
  });
});

describe("collisions are by stem, not by string", () => {
  const index = VocabIndex.from([APRIL]);

  it.each(["abate", "Abate", "abated", "abating", "abates", "abatement", '"abate."'])(
    "%s collides with the stored abate",
    (variant) => {
      expect(index.has(variant)).toBe(true);
      expect(index.lookup(variant)?.word).toBe("abate");
    },
  );

  it("does not collide a merely similar word", () => {
    expect(index.has("abase")).toBe(false);
    expect(index.has("abbot")).toBe(false);
  });
});

describe("filtering a generated batch", () => {
  const index = VocabIndex.from([APRIL]);

  it("keeps what is new and rejects what is not", () => {
    const result = index.filter(
      ["perspicacious", "abating", "laconic"],
      (w) => w,
    );
    expect(result.kept).toEqual(["perspicacious", "laconic"]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].candidate).toBe("abating");
    expect(result.rejected[0].collidesWith.word).toBe("abate");
  });

  it("catches a duplicate inside the batch itself", () => {
    // A model asked for 40 words will sometimes return the same one twice. A
    // filter that only consulted the stored index would pass both through and
    // the month would contain a visible duplicate.
    const result = index.filter(["fulsome", "fulsomeness", "turgid"], (w) => w);
    expect(result.kept).toEqual(["fulsome", "turgid"]);
    expect(result.rejected[0].candidate).toBe("fulsomeness");
    expect(result.rejected[0].collidesWith.monthKey).toBe("(this batch)");
  });

  it("drops junk that normalises to nothing", () => {
    const result = index.filter(["...", "  ", "turgid"], (w) => w);
    expect(result.kept).toEqual(["turgid"]);
    // Not a collision — there was never a word here to collide.
    expect(result.rejected).toHaveLength(0);
  });

  it("does not mutate the index", () => {
    const before = index.size;
    index.filter(["brand", "new", "words"], (w) => w);
    expect(index.size).toBe(before);
  });

  it("works on objects, not just strings", () => {
    const result = index.filter([word("abate"), word("turgid")], (w) => w.word);
    expect(result.kept.map((w) => w.word)).toEqual(["turgid"]);
  });
});

describe("retirement — removing a month does not free its words", () => {
  function retiredIndex() {
    const index = VocabIndex.from([APRIL, MAY]);
    const retired = index.retireMonth("gre/01", "2026-09-11T00:00:00.000Z");
    return { index, retired };
  }

  it("still blocks the removed month's words", () => {
    const { index } = retiredIndex();
    // The whole point: regenerating after removing April must not hand April
    // back, because the user already studied it.
    expect(index.has("abate")).toBe(true);
    expect(index.has("cogent")).toBe(true);
  });

  it("blocks their inflections too", () => {
    const { index } = retiredIndex();
    expect(index.has("abatement")).toBe(true);
  });

  it("marks them retired rather than deleting them", () => {
    const { index } = retiredIndex();
    expect(index.lookup("abate")?.retiredAt).toBe("2026-09-11T00:00:00.000Z");
    expect(index.retiredCount).toBe(3);
  });

  it("leaves other months alone", () => {
    const { index } = retiredIndex();
    expect(index.lookup("laconic")?.retiredAt).toBeUndefined();
  });

  it("returns the entries so the caller can persist them", () => {
    const { retired } = retiredIndex();
    // The index is rebuilt from loaded months on next launch, and a removed
    // month is not among them — so this ledger is the only record left.
    expect(retired.map((e) => e.word).sort()).toEqual([
      "abate",
      "cogent",
      "ephemeral",
    ]);
    expect(retired.every((e) => e.retiredAt)).toBe(true);
  });

  it("is idempotent", () => {
    const { index } = retiredIndex();
    expect(index.retireMonth("gre/01")).toHaveLength(0);
    expect(index.retiredCount).toBe(3);
  });

  it("rejects a generated batch containing a retired word", () => {
    const { index } = retiredIndex();
    const result = index.filter(["abate", "novel"], (w) => w);
    expect(result.kept).toEqual(["novel"]);
  });
});

describe("rebuilding from a persisted ledger", () => {
  const ledger: VocabIndexEntry[] = [
    {
      stem: "abat",
      word: "abate",
      monthKey: "gre/01",
      source: "generated",
      retiredAt: "2026-09-11T00:00:00.000Z",
    },
  ];

  it("restores the block across a restart", () => {
    // April is gone from `months`; only the ledger remains.
    const index = VocabIndex.from([MAY], ledger);
    expect(index.has("abate")).toBe(true);
    expect(index.lookup("abate")?.retiredAt).toBeTruthy();
  });

  it("lets a live month outrank a retired entry for the same word", () => {
    // The user removed April, then imported a month containing `abate` again.
    // The live copy is the truthful answer to "where is this word?".
    const reimported = month(3, ["abate"]);
    const index = VocabIndex.from([reimported], ledger);
    expect(index.lookup("abate")?.monthKey).toBe("gre/03");
    expect(index.lookup("abate")?.retiredAt).toBeUndefined();
  });
});

describe("release", () => {
  it("frees retired words when the user explicitly asks", () => {
    const index = VocabIndex.from([APRIL]);
    index.retireMonth("gre/01");
    expect(index.release("gre/01")).toBe(3);
    expect(index.has("abate")).toBe(false);
  });

  it("never frees a live month's words", () => {
    const index = VocabIndex.from([APRIL, MAY]);
    index.retireMonth("gre/01");
    // May is still loaded; releasing everything retired must not touch it.
    expect(index.release()).toBe(3);
    expect(index.has("laconic")).toBe(true);
  });
});

describe("the prompt sample", () => {
  const many = month(4,
    ["abate", "abscond", "belie", "cogent", "dearth", "ennui", "fervid"],
  );
  const index = VocabIndex.from([many]);

  it("respects the limit", () => {
    expect(index.sample(3)).toHaveLength(3);
    expect(index.sample(0)).toHaveLength(0);
  });

  it("returns everything when the limit exceeds the index", () => {
    expect(index.sample(100)).toHaveLength(7);
  });

  it("puts words sharing a first letter first", () => {
    // A model asked for more A-words is most likely to reach for the ones
    // already used, so those are the ones worth spending context on.
    const sample = index.sample(3, ["abrogate"]);
    expect(sample.slice(0, 2).sort()).toEqual(["abate", "abscond"]);
  });

  it("returns words as written, not stems", () => {
    expect(index.sample(10)).toContain("abate");
  });
});

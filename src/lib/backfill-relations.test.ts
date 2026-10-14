import { describe, expect, it } from "vitest";
import type { VocabMonth, VocabWord } from "@/types";
import {
  backfillRelations,
  isDateTitle,
  needsRelations,
  retitleIfDated,
} from "./backfill-relations";

const word = (id: string, extra: Partial<VocabWord> = {}): VocabWord => ({
  id,
  word: id.replace(/^gre-/, ""),
  partOfSpeech: "adjective",
  definition: "A definition.",
  example: "An example.",
  mnemonic: "A mnemonic.",
  ...extra,
});

const month = (words: VocabWord[][]): VocabMonth => ({
  track: "gre",
  ordinal: 1,
  title: "April 2026",
  days: words.map((ws, i) => ({ day: i + 1, words: ws })),
});

describe("backfillRelations", () => {
  it("fills a word that has none", () => {
    const stored = month([[word("gre-abate")]]);
    const source = month([
      [word("gre-abate", { synonyms: ["lessen"], antonyms: ["intensify"] })],
    ]);
    const { month: out, filled } = backfillRelations(stored, source);
    expect(filled).toBe(1);
    expect(out.days[0].words[0].synonyms).toEqual(["lessen"]);
    expect(out.days[0].words[0].antonyms).toEqual(["intensify"]);
  });

  it("never overwrites what is already there", () => {
    // A hand-edited entry is the user's, not the corpus's.
    const stored = month([[word("gre-abate", { synonyms: ["mine"] })]]);
    const source = month([[word("gre-abate", { synonyms: ["theirs"] })]]);
    const { month: out, filled } = backfillRelations(stored, source);
    expect(filled).toBe(0);
    expect(out.days[0].words[0].synonyms).toEqual(["mine"]);
  });

  it("returns the same object when there is nothing to do", () => {
    // The caller skips the write on identity, so this is load-bearing.
    const stored = month([[word("gre-abate", { synonyms: ["lessen"] })]]);
    const { month: out } = backfillRelations(stored, month([[word("gre-abate")]]));
    expect(out).toBe(stored);
  });

  it("keeps words the user added, which the source has never heard of", () => {
    const stored = month([[word("gre-abate"), word("gre-mine")]]);
    const source = month([[word("gre-abate", { synonyms: ["lessen"] })]]);
    const { month: out, filled } = backfillRelations(stored, source);
    expect(filled).toBe(1);
    expect(out.days[0].words.map((w) => w.id)).toEqual(["gre-abate", "gre-mine"]);
    expect(out.days[0].words[1].synonyms).toBeUndefined();
  });

  it("adds, removes and moves nothing", () => {
    const stored = month([
      [word("gre-a"), word("gre-b")],
      [word("gre-c")],
    ]);
    const source = month([
      [word("gre-c", { synonyms: ["x"] })],
      [word("gre-a", { synonyms: ["y"] }), word("gre-b", { synonyms: ["z"] })],
    ]);
    const { month: out } = backfillRelations(stored, source);
    expect(out.days.map((d) => d.words.map((w) => w.id))).toEqual([
      ["gre-a", "gre-b"],
      ["gre-c"],
    ]);
    expect(out.days.map((d) => d.day)).toEqual([1, 2]);
  });

  it("leaves antonyms absent when the corpus has none either", () => {
    // Many nouns have no true opposite; an empty list is an answer.
    const stored = month([[word("gre-nadir")]]);
    const source = month([[word("gre-nadir", { synonyms: ["bottom"] })]]);
    const { month: out } = backfillRelations(stored, source);
    expect(out.days[0].words[0].synonyms).toEqual(["bottom"]);
    expect(out.days[0].words[0].antonyms).toBeUndefined();
  });

  it("ignores a source word whose id does not match", () => {
    const stored = month([[word("gre-abate")]]);
    const source = month([[word("sat-abate", { synonyms: ["lessen"] })]]);
    expect(backfillRelations(stored, source).filled).toBe(0);
  });
});

describe("needsRelations", () => {
  it("is true when any word lacks synonyms", () => {
    expect(
      needsRelations(month([[word("gre-a", { synonyms: ["x"] }), word("gre-b")]])),
    ).toBe(true);
  });

  it("is false when every word has them", () => {
    expect(needsRelations(month([[word("gre-a", { synonyms: ["x"] })]]))).toBe(
      false,
    );
  });
});

describe("retitleIfDated", () => {
  const dated = { ...month([[word("gre-a")]]), title: "April 2026" };

  it.each(["April 2026", "2026-04", "december 2027"])(
    "treats %o as a date",
    (t) => expect(isDateTitle(t)).toBe(true),
  );

  it.each(["An alphabet of essentials", "Criticism and praise", "May Day"])(
    "treats %o as a name",
    (t) => expect(isDateTitle(t)).toBe(false),
  );

  it("takes the corpus name over a date", () => {
    expect(retitleIfDated(dated, { title: "An alphabet of essentials" }).title).toBe(
      "An alphabet of essentials",
    );
  });

  it("leaves a title the user chose alone", () => {
    // Only a date is assumed to be legacy; anything else is theirs.
    const named = { ...dated, title: "My own name" };
    expect(retitleIfDated(named, { title: "Corpus name" })).toBe(named);
  });

  it("does not swap one date for another", () => {
    expect(retitleIfDated(dated, { title: "2026-04" })).toBe(dated);
  });

  it("does nothing when the corpus offers no title", () => {
    expect(retitleIfDated(dated, {})).toBe(dated);
  });
});

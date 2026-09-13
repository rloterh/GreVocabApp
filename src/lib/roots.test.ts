import { describe, expect, it } from "vitest";
import { ROOT_FAMILIES, familiesOf, relativesOf } from "./roots";
import type { VocabWord } from "@/types";

/**
 * Cognates whose surface form no longer shows the root.
 *
 * These are checked individually and listed here so that the structural test
 * below can still catch a typo. Anything *not* on this list must literally
 * contain one of its root's spellings, which is what stops `spec` quietly
 * gaining a `speculate` or `dict` a `dictionary-shaped` guess.
 *
 * Three entries were removed rather than added here, because they were simply
 * wrong: `subjugate` is *jugum*, a yoke, not *jacere*; `incentive` is
 * *incinere*, to set the tune, not *incendere*; and `turmoil` has no agreed
 * origin at all, so claiming *turbare* was a guess dressed as a fact.
 */
const CHECKED_COGNATES = new Set([
  "predicate", "creed", "miscreant", "fantasy", "complement", "pristine",
  "nouveau", "viable", "moribund", "pertinacious", "susceptible", "constrain",
  "renaissance", "naive", "expire", "concur", "incur", "occur", "gracious",
  "admonish", "remonstrate", "monument", "voluble", "vain", "foundry",
  "consecrate", "acumen", "acute", "torment", "requiem", "vanquish",
]);

function word(w: string): VocabWord {
  return {
    id: `gre-${w}`,
    word: w,
    partOfSpeech: "adjective",
    definition: "A definition.",
    example: "An example.",
    mnemonic: "A mnemonic.",
  };
}

describe("the root table", () => {
  it("has no duplicate members inside a family", () => {
    for (const family of ROOT_FAMILIES) {
      const seen = new Set(family.members.map((m) => m.toLowerCase()));
      expect(seen.size, `${family.root} repeats a member`).toBe(family.members.length);
    }
  });

  it("gives every family a meaning and at least two members", () => {
    // A family of one is not a family; it is a word with a footnote.
    for (const family of ROOT_FAMILIES) {
      expect(family.meaning.trim().length, family.root).toBeGreaterThan(2);
      expect(family.members.length, family.root).toBeGreaterThan(1);
    }
  });

  it("writes every member in lowercase", () => {
    for (const family of ROOT_FAMILIES) {
      for (const member of family.members) {
        expect(member, family.root).toBe(member.toLowerCase());
      }
    }
  });

  it("keeps every member recognisably in its own root", () => {
    // Structural, not etymological: it catches a member filed under the wrong
    // family by a slip of the hand. Whether the etymology is *true* is on
    // whoever added the entry — no test can check that.
    const strays: string[] = [];
    for (const family of ROOT_FAMILIES) {
      const stems = family.root
        .split("/")
        .map((s) => s.trim().toLowerCase().replace(/[^a-z]/g, ""))
        .filter(Boolean);
      for (const member of family.members) {
        const plain = member.toLowerCase().replace(/[^a-z]/g, "");
        if (CHECKED_COGNATES.has(member.toLowerCase())) continue;
        if (!stems.some((stem) => plain.includes(stem))) {
          strays.push(`${family.root} :: ${member}`);
        }
      }
    }
    expect(strays).toEqual([]);
  });

  it("does not put the same word in two families that contradict each other", () => {
    // A word in several families is the interesting case, not an error —
    // `magnanimous` is magn and anim. What must not happen is one word being
    // claimed by two roots that mean the same thing, which would mean one of
    // them is a mistake.
    const byWord = new Map<string, string[]>();
    for (const family of ROOT_FAMILIES) {
      for (const member of family.members) {
        const key = member.toLowerCase();
        byWord.set(key, [...(byWord.get(key) ?? []), family.meaning]);
      }
    }
    const contradictions = [...byWord.entries()].filter(
      ([, meanings]) => new Set(meanings).size !== meanings.length,
    );
    expect(contradictions).toEqual([]);
  });
});

describe("familiesOf", () => {
  it("finds a word's family", () => {
    expect(familiesOf("loquacious").map((f) => f.root)).toEqual(["loqu / locut"]);
  });

  it("is case-insensitive, because cards are title-cased", () => {
    expect(familiesOf("Loquacious")).toHaveLength(1);
  });

  it("returns every family a word belongs to", () => {
    const roots = familiesOf("magnanimous").map((f) => f.root);
    expect(roots).toContain("magn");
    expect(roots).toContain("anim");
  });

  it("is empty for a word with no listed root", () => {
    expect(familiesOf("aardvark")).toEqual([]);
  });

  it("keeps the look-alike traps apart", () => {
    // The whole reason this table is curated rather than inferred.
    expect(familiesOf("pedant").map((f) => f.root)).toEqual(["paed / ped"]);
    expect(familiesOf("impede").map((f) => f.root)).toEqual(["ped"]);
    expect(familiesOf("preclude").map((f) => f.root)).toEqual(["clud / clus"]);
    expect(familiesOf("prelude").map((f) => f.root)).toEqual(["lud / lus"]);
    expect(familiesOf("obsequious").map((f) => f.root)).toEqual(["sequ / secut"]);
  });
});

describe("relativesOf", () => {
  const loaded = ["loquacious", "eloquent", "obloquy", "aardvark"].map(word);

  it("returns only relatives the user actually has", () => {
    const [family] = relativesOf("loquacious", loaded);
    expect(family.words.map((w) => w.word).sort()).toEqual(["eloquent", "obloquy"]);
  });

  it("carries an id, so the UI can link to the word", () => {
    const [family] = relativesOf("loquacious", loaded);
    expect(family.words.every((w) => w.id)).toBe(true);
  });

  it("leaves the word itself out of its own family", () => {
    const [family] = relativesOf("loquacious", loaded);
    expect(family.words.map((w) => w.word)).not.toContain("loquacious");
  });

  it("drops a family with nothing loaded in it", () => {
    // Showing `obloquy` to somebody who has never been given it is a
    // vocabulary lesson they did not ask for, in the middle of one they did.
    expect(relativesOf("loquacious", [word("loquacious")])).toEqual([]);
  });

  it("is empty for a word with no root", () => {
    expect(relativesOf("aardvark", loaded)).toEqual([]);
  });
});

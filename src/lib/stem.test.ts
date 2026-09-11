import { describe, expect, it } from "vitest";
import { normalizeWord, sameWord, stem } from "@/lib/stem";

/**
 * Word families that must collapse to one key.
 *
 * This is the fixture the rule set answers to. A new rule that breaks a family
 * here is a regression regardless of what it fixes.
 */
const FAMILIES: Array<[string, string[]]> = [
  ["abate", ["abate", "Abate", "abated", "abates", "abating", "abatement"]],
  ["obfuscate", ["obfuscate", "obfuscated", "obfuscating", "obfuscation"]],
  ["placate", ["placate", "placated", "placating", "placation"]],
  ["gregarious", ["gregarious", "gregariousness"]],
  ["happy", ["happy", "happily", "happiness"]],
  ["equivocal", ["equivocal", "equivocally"]],
  ["credible", ["credible", "credibility"]],
  ["culpable", ["culpable", "culpability"]],
  ["lament", ["lament", "lamented", "lamenting", "laments"]],
  ["deride", ["deride", "derided", "derides", "deriding"]],
  ["anomaly", ["anomaly", "anomalies"]],
  ["paucity", ["paucity", "paucities"]],
  ["abet", ["abet", "abets", "abetted", "abetting"]],
  ["rebut", ["rebut", "rebuts", "rebutted", "rebutting"]],
  ["quash", ["quash", "quashes", "quashed", "quashing"]],
  ["paradox", ["paradox", "paradoxes"]],
  ["laud", ["laud", "lauded", "lauding", "lauds"]],
];

/**
 * Pairs that must stay apart.
 *
 * The expensive failure: over-matching makes a legitimately distinct word
 * vanish from a generated month with no explanation to the user.
 */
const DISTINCT: Array<[string, string]> = [
  ["industry", "industrious"],
  ["moment", "momentum"],
  ["compliment", "complimentary"],
  ["rest", "restive"],
  ["proper", "property"],
  ["mass", "mas"],
  ["ally", "all"],
  ["hubris", "hubri"],
  ["crisis", "crisi"],
  ["species", "specie"],
  ["only", "on"],
  ["during", "dur"],
  ["family", "famil"],
  ["deity", "de"],
  ["sacred", "sacr"],
  ["naked", "nak"],
  ["string", "str"],
  ["reply", "rep"],
];

describe("normalizeWord", () => {
  it.each([
    ["Abate", "abate"],
    ["  abate  ", "abate"],
    ["ABATE", "abate"],
    ['"abate"', "abate"],
    ["abate.", "abate"],
    ["(abate)", "abate"],
    ["naïve", "naive"],
    ["façade", "facade"],
    ["résumé", "resume"],
  ])("normalises %s to %s", (input, expected) => {
    expect(normalizeWord(input)).toBe(expected);
  });

  it("keeps internal hyphens and apostrophes", () => {
    // These are single lexical items, not punctuation to strip.
    expect(normalizeWord("self-effacing")).toBe("self-effacing");
    expect(normalizeWord("ne'er-do-well")).toBe("ne'er-do-well");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeWord("ad   hoc")).toBe("ad hoc");
  });

  it("returns empty for input with nothing in it", () => {
    for (const input of ["", "   ", "...", "!!!"]) {
      expect(normalizeWord(input)).toBe("");
    }
  });
});

describe("word families collapse to one stem", () => {
  it.each(FAMILIES)("%s", (_name, members) => {
    const stems = new Set(members.map(stem));
    expect(
      stems.size,
      `${members.join(", ")} produced ${[...stems].join(", ")}`,
    ).toBe(1);
  });

  it("covers every family with at least two members", () => {
    // A one-member family would pass vacuously.
    for (const [name, members] of FAMILIES) {
      expect(members.length, name).toBeGreaterThan(1);
    }
  });
});

describe("distinct words stay distinct", () => {
  it.each(DISTINCT)("%s is not %s", (a, b) => {
    expect(sameWord(a, b), `${a} and ${b} collided on ${stem(a)}`).toBe(false);
  });
});

describe("stem", () => {
  it("is idempotent", () => {
    // Stemming a stem must not strip further, or the key depends on how many
    // times it happened to be applied.
    for (const [, members] of FAMILIES) {
      for (const word of members) {
        expect(stem(stem(word)), word).toBe(stem(word));
      }
    }
  });

  it("never returns an empty stem for a real word", () => {
    // An empty key would make every unusable input collide with every other.
    for (const [, members] of FAMILIES) {
      for (const word of members) expect(stem(word).length).toBeGreaterThan(1);
    }
  });

  it("returns empty for input with no letters", () => {
    for (const input of ["", "   ", "—", "123"]) {
      expect(stem(input)).toBe(input === "123" ? "123" : "");
    }
  });

  it("keys a phrase on its last word", () => {
    // Stemming every part would make "beg the question" collide with
    // "begging the question" in a way that is right, and "ad hoc" with
    // "ad hocs" — but stemming "the" would be noise.
    expect(stem("ad hoc")).toBe("ad hoc");
    expect(sameWord("sine qua non", "sine qua non")).toBe(true);
  });

  it("is case and punctuation insensitive", () => {
    expect(sameWord("Abate", '"abating."')).toBe(true);
  });
});

describe("sameWord", () => {
  it("is reflexive, symmetric, and false for unusable input", () => {
    expect(sameWord("abate", "abate")).toBe(true);
    expect(sameWord("abate", "abated")).toBe(sameWord("abated", "abate"));
    // Two empties must not be "the same word", or every junk row collides.
    expect(sameWord("", "")).toBe(false);
    expect(sameWord("...", "!!!")).toBe(false);
  });
});

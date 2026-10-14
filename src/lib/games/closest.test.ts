/**
 * Closest Meaning, over the corpus that actually ships.
 *
 * Property tests rather than examples: the guard's failures are in the data,
 * not the code, so the only honest test runs the builder over real cards. A
 * stride through each tier keeps it to a few seconds; scripts/audit-games.ts
 * runs every word.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Track, VocabWord } from "@/types";
import { allWordsInMonth, parseVocabMonth } from "@/lib/vocabulary";
import { seededRandom } from "@/lib/order";
import { stem } from "@/lib/stem";
import { keyOf } from "@/lib/track";
import { buildClosest } from "./builders/closest";
import { tierOrdinals } from "./pool";
import {
  buildRelationIndex,
  definitionStems,
  isEligibleTerm,
  isSafeSynonymSource,
  meaningNeighbourhood,
  rankedSynonyms,
  REVIEWED_EXCLUSIONS,
  type RelationIndex,
} from "./relations";
import { parseRelationsFile } from "./relations-file";
import { buildRound, ROUND_LENGTH } from "./round";
import type { Tier } from "./types";

const ROOT = join(process.cwd(), "public", "vocab");
const STRIDE = 7;

function load(track: Track) {
  return readdirSync(join(ROOT, track))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) =>
      parseVocabMonth(JSON.parse(readFileSync(join(ROOT, track, f), "utf-8")), { track }),
    );
}

const index: RelationIndex = buildRelationIndex(
  parseRelationsFile(JSON.parse(readFileSync(join(ROOT, "relations.json"), "utf-8"))),
);

function tierWords(track: Track, tier: Exclude<Tier, "mine">) {
  const months = load(track);
  const wanted = new Set(tierOrdinals(months.map((m) => m.ordinal), tier));
  const chosen = months.filter((m) => wanted.has(m.ordinal));
  const monthOf: Record<string, string> = {};
  for (const m of chosen) for (const w of allWordsInMonth(m)) monthOf[w.id] = keyOf(m);
  return { words: chosen.flatMap(allWordsInMonth), monthOf };
}

describe.each([
  ["gre", "warmup"],
  ["gre", "fiendish"],
  ["sat", "standard"],
  ["sat", "hard"],
] as Array<[Track, Exclude<Tier, "mine">]>)("Closest Meaning on %s/%s", (track, tier) => {
  const { words, monthOf } = tierWords(track, tier);
  const random = seededRandom(42);
  const built = words
    .filter((_, i) => i % STRIDE === 0)
    .map((word) => ({
      word,
      question: buildClosest(word, { pool: words, index, monthOf, tier, random }),
    }));

  it("builds a question for nearly every eligible word", () => {
    const made = built.filter((b) => b.question).length;
    // Built from `buildClosest` directly, so ineligible words count as misses.
    expect(made / built.length).toBeGreaterThan(0.95);
  });

  it("offers four options, distinct by stem, none a form of the word", () => {
    for (const { word, question } of built) {
      if (!question) continue;
      expect(question.options).toHaveLength(4);
      const stems = question.options.map((o) => stem(o));
      expect(new Set(stems).size).toBe(4);
      expect(stems).not.toContain(stem(word.word));
    }
  });

  it("keys the answer to the card's first usable synonym", () => {
    for (const { word, question } of built) {
      if (!question) continue;
      const key = question.options[question.answer]!;
      expect(key).toBe(rankedSynonyms(index, word)[0]);
    }
  });

  it("never offers a wrong answer from the word's meaning neighbourhood", () => {
    for (const { word, question } of built) {
      if (!question) continue;
      const hood = meaningNeighbourhood(index, word);
      question.options.forEach((option, i) => {
        if (i !== question.answer) expect(hood.has(stem(option)), `${word.word}: ${option}`).toBe(false);
      });
    }
  });
});

describe("guard regressions found by the audit", () => {
  const word = (w: Partial<VocabWord> & { word: string }): VocabWord => ({
    id: `gre-${w.word}`,
    partOfSpeech: "adjective",
    definition: "",
    example: "",
    mnemonic: "",
    ...w,
  });

  it("treats a word from the definition as a right answer (jaunty → cheerful)", () => {
    const jaunty = word({
      word: "jaunty",
      definition: "Having a lively, cheerful, and confident manner.",
      synonyms: ["chipper"],
    });
    expect(meaningNeighbourhood(buildRelationIndex([jaunty]), jaunty).has(stem("cheerful"))).toBe(true);
  });

  it("treats words with a shared opposite as near-synonyms (illegitimate → illegal)", () => {
    const illegitimate = word({ word: "illegitimate", synonyms: ["invalid"], antonyms: ["legal"] });
    const illicit = word({ word: "illicit", synonyms: ["illegal"], antonyms: ["legal"] });
    const hood = meaningNeighbourhood(buildRelationIndex([illegitimate, illicit]), illegitimate);
    expect(hood.has(stem("illicit"))).toBe(true);
    expect(hood.has(stem("illegal"))).toBe(true);
  });

  it("treats one shared content word in two definitions as too close (demented → frenzied)", () => {
    const demented = word({ word: "demented", definition: "Behaving in a mad, irrational, or wildly foolish manner." });
    const frantic = word({ word: "frantic", definition: "Wildly anxious and out of control.", synonyms: ["frenzied"] });
    const index = buildRelationIndex([demented, frantic]);
    const hood = meaningNeighbourhood(index, demented);
    expect(isSafeSynonymSource(index, hood, frantic, definitionStems(demented.definition))).toBe(false);
  });

  it("does not count definition scaffolding as shared meaning", () => {
    expect(definitionStems("Showing a quality of great feeling")).toEqual(new Set());
  });

  it("never offers a clipped form of the word (expatriate → expat)", () => {
    expect(isEligibleTerm("expat", "expatriate")).toBe(false);
    expect(isEligibleTerm("exile", "expatriate")).toBe(true);
  });

  it("honours the reviewed exclusions the data cannot see (unravel → uncover)", () => {
    const unravel = word({ word: "unravel", partOfSpeech: "verb", definition: "To solve something complicated.", synonyms: ["solve"] });
    const hood = meaningNeighbourhood(buildRelationIndex([unravel]), unravel);
    for (const term of REVIEWED_EXCLUSIONS.unravel!) expect(hood.has(stem(term))).toBe(true);
  });

  it("follows a link on a card in another month (eulogize → extol via laud)", () => {
    const eulogize = word({ word: "eulogize", partOfSpeech: "verb", synonyms: ["laud", "honor"] });
    const laud = word({ word: "laud", partOfSpeech: "verb", synonyms: ["extol", "praise"] });
    const hood = meaningNeighbourhood(buildRelationIndex([eulogize, laud]), eulogize);
    expect(hood.has(stem("extol"))).toBe(true);
  });
});

describe("buildRound", () => {
  const { words, monthOf } = tierWords("gre", "standard");

  it("builds ten distinct words, reproducibly from a seed", () => {
    const a = buildRound({ game: "closest", track: "gre", tier: "standard", prompts: words, pool: words, monthOf, seed: 9, index });
    const b = buildRound({ game: "closest", track: "gre", tier: "standard", prompts: words, pool: words, monthOf, seed: 9, index });
    expect(a.questions).toHaveLength(ROUND_LENGTH);
    expect(a.shortfall).toBe(0);
    expect(new Set(a.questions.map((q) => q.wordId)).size).toBe(ROUND_LENGTH);
    expect(b.questions).toEqual(a.questions);
  });

  it("gives a different round for a different seed", () => {
    const a = buildRound({ game: "closest", track: "gre", tier: "standard", prompts: words, pool: words, monthOf, seed: 1, index });
    const b = buildRound({ game: "closest", track: "gre", tier: "standard", prompts: words, pool: words, monthOf, seed: 2, index });
    expect(b.questions.map((q) => q.wordId)).not.toEqual(a.questions.map((q) => q.wordId));
  });

  it("reports a shortfall rather than padding a small pool", () => {
    const few = words.slice(0, 4);
    const round = buildRound({ game: "closest", track: "gre", tier: "mine", prompts: few, pool: words, monthOf, seed: 3, index });
    expect(round.questions.length).toBeLessThanOrEqual(4);
    expect(round.shortfall).toBe(ROUND_LENGTH - round.questions.length);
  });

  it("builds a round fast enough to start without a spinner", () => {
    const started = performance.now();
    buildRound({ game: "closest", track: "gre", tier: "fiendish", prompts: words, pool: words, monthOf, seed: 5, index });
    // A smoke alarm, not a budget: ~35ms alone, and the suite runs dozens of
    // workers in parallel. See the distractor timing note in CONTINUING.md.
    expect(performance.now() - started).toBeLessThan(1500);
  });
});

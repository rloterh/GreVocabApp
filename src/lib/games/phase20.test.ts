/**
 * Fact or Fiction, Opposites and Fill the Gap, over the corpus that ships.
 *
 * Property tests, for the reason closest.test.ts gives: the failures that
 * matter are in the data. Each rule asserted here was found by a blind read of
 * a real sample (docs/GAMES.md §6.2), and the test is what keeps it found.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Track } from "@/types";
import { allWordsInMonth, parseVocabMonth } from "@/lib/vocabulary";
import { seededRandom } from "@/lib/order";
import { normalizeWord, stem } from "@/lib/stem";
import { buildFact } from "./builders/fact";
import { buildGap } from "./builders/gap";
import { buildOpposites } from "./builders/opposites";
import { tierOrdinals } from "./pool";
import {
  buildRelationIndex,
  isConfirmed,
  meaningNeighbourhood,
  oppositeNeighbourhood,
  rankedAntonyms,
  rankedSynonyms,
} from "./relations";
import { parseRelationsFile } from "./relations-file";
import { balancedTruths } from "./round";
import type { Tier } from "./types";

const ROOT = join(process.cwd(), "public", "vocab");
const STRIDE = 9;

const index = buildRelationIndex(
  parseRelationsFile(JSON.parse(readFileSync(join(ROOT, "relations.json"), "utf-8"))),
);

function tierWords(track: Track, tier: Exclude<Tier, "mine">) {
  const months = readdirSync(join(ROOT, track))
    .filter((f) => f.endsWith(".json"))
    .map((f) => parseVocabMonth(JSON.parse(readFileSync(join(ROOT, track, f), "utf-8")), { track }));
  const wanted = new Set(tierOrdinals(months.map((m) => m.ordinal), tier));
  return months.filter((m) => wanted.has(m.ordinal)).flatMap(allWordsInMonth);
}

const CASES: Array<[Track, Exclude<Tier, "mine">]> = [
  ["gre", "warmup"],
  ["gre", "fiendish"],
  ["sat", "standard"],
];

describe.each(CASES)("Opposites on %s/%s", (track, tier) => {
  const words = tierWords(track, tier);
  const random = seededRandom(5);
  const built = words
    .filter((_, i) => i % STRIDE === 0)
    .map((word) => ({ word, q: buildOpposites(word, { pool: words, index, monthOf: {}, tier, random }) }))
    .filter((b) => b.q !== null);

  it("builds enough to fill rounds", () => {
    expect(built.length).toBeGreaterThan(20);
  });

  it("keys the card's first usable antonym, never one its own lists call a synonym", () => {
    for (const { word, q } of built) {
      const key = q!.options[q!.answer]!;
      expect(key).toBe(rankedAntonyms(index, word)[0]);
      expect(meaningNeighbourhood(index, word).has(stem(key))).toBe(false);
    }
  });

  it("asks a noun or verb only when its antonym's card confirms the pair", () => {
    for (const { word, q } of built) {
      if (!/^(noun|verb)\b/i.test(word.partOfSpeech)) continue;
      expect(isConfirmed(index, word, q!.options[q!.answer]!, "antonym"), word.word).toBe(true);
    }
  });

  it("plants a synonym trap from Standard up, and nothing else that is an opposite", () => {
    for (const { word, q } of built) {
      if (tier === "warmup") expect(q!.trap).toBeUndefined();
      else if (q!.trap !== undefined) expect(rankedSynonyms(index, word)).toContain(q!.options[q!.trap]);
      const opposites = oppositeNeighbourhood(index, word);
      q!.options.forEach((o, i) => {
        if (i !== q!.answer) expect(opposites.has(stem(o)), `${word.word}: ${o}`).toBe(false);
      });
    }
  });
});

describe.each(CASES)("Fill the Gap on %s/%s", (track, tier) => {
  const words = tierWords(track, tier);
  const random = seededRandom(5);
  const built = words
    .filter((_, i) => i % STRIDE === 0)
    .map((word) => ({ word, q: buildGap(word, { pool: words, index, monthOf: {}, tier, random }) }))
    .filter((b) => b.q !== null);

  it("blanks exactly one place, and the answer is nowhere else in the sentence", () => {
    expect(built.length).toBeGreaterThan(20);
    for (const { word, q } of built) {
      const sentence = q!.sentence!;
      expect(sentence.split("____").length - 1, sentence).toBe(1);
      const leftovers = sentence
        .split(/[^A-Za-z'-]+/)
        .filter((t) => t && normalizeWord(t).startsWith(normalizeWord(word.word)));
      expect(leftovers, sentence).toEqual([]);
    }
  });

  it("offers four distinct words, none in the answer's meaning neighbourhood", () => {
    for (const { word, q } of built) {
      expect(new Set(q!.options.map((o) => stem(o))).size).toBe(4);
      const hood = meaningNeighbourhood(index, word);
      q!.options.forEach((o, i) => {
        if (i !== q!.answer) expect(hood.has(stem(o)), `${word.word}: ${o}`).toBe(false);
      });
    }
  });
});

describe.each(CASES)("Fact or Fiction on %s/%s", (track, tier) => {
  const words = tierWords(track, tier);
  const random = seededRandom(5);
  const built = words
    .filter((_, i) => i % STRIDE === 0)
    .flatMap((word) =>
      [true, false].map((truth) => ({
        word,
        truth,
        q: buildFact(word, { pool: words, index, monthOf: {}, tier, random, truth }),
      })),
    )
    .filter((b) => b.q !== null);

  it("honours the truth the round asked for", () => {
    expect(built.length).toBeGreaterThan(40);
    for (const { truth, q } of built) {
      expect(q!.options).toEqual(["Fact", "Fiction"]);
      expect(q!.answer).toBe(truth ? 0 : 1);
    }
  });

  it("states a synonym or opposite only when both cards confirm the pair", () => {
    for (const { word, truth, q } of built) {
      const same = q!.statement.match(/and “(.+)” mean nearly the same thing\.$/);
      const opposite = q!.statement.match(/is the opposite of “(.+)”\.$/);
      if (same) {
        expect(isConfirmed(index, word, same[1]!, truth ? "synonym" : "antonym"), q!.statement).toBe(true);
      }
      if (opposite) {
        expect(isConfirmed(index, word, opposite[1]!, truth ? "antonym" : "synonym"), q!.statement).toBe(true);
      }
    }
  });

  it("explains every fiction", () => {
    for (const { truth, q } of built) {
      if (!truth) expect(q!.explain.note, q!.statement).toBeTruthy();
    }
  });

  it("writes a definition mid-sentence in lower case", () => {
    for (const { q } of built) {
      expect(q!.statement).not.toMatch(/ means [A-Z][a-z]/);
    }
  });
});

describe("balancedTruths", () => {
  it("is half true and never runs four the same, for any seed", () => {
    for (let seed = 0; seed < 300; seed++) {
      const t = balancedTruths(10, seed);
      expect(t.filter(Boolean)).toHaveLength(5);
      const run = t.reduce(
        (acc, v, i) => {
          const cur = i > 0 && v === t[i - 1] ? acc.cur + 1 : 1;
          return { cur, max: Math.max(acc.max, cur) };
        },
        { cur: 0, max: 0 },
      ).max;
      expect(run).toBeLessThan(4);
    }
  });
});

describe("the one door into the scheduler", () => {
  // ADR 0016: a game never writes SM-2 state on its own. The only call is the
  // results screen's explicit "Review these in Flashcards".
  const files = [
    ...readdirSync(join(process.cwd(), "src", "lib", "games"), { recursive: true })
      .map(String)
      .filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"))
      .map((f) => join("src", "lib", "games", f)),
    ...readdirSync(join(process.cwd(), "src", "components", "games")).map((f) =>
      join("src", "components", "games", f),
    ),
    join("src", "pages", "Games.tsx"),
    join("src", "hooks", "useGameCorpus.ts"),
  ];

  it("is opened in exactly one place, and quiz tallies are never written", () => {
    const calls: string[] = [];
    for (const file of files) {
      const text = readFileSync(join(process.cwd(), file), "utf-8");
      expect(text, file).not.toMatch(/recordQuizAnswer/);
      for (const line of text.split("\n")) {
        if (/applyStudyRating\(/.test(line)) calls.push(`${file}: ${line.trim()}`);
      }
    }
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/Games\.tsx: applyStudyRating\(id, .*"again"\)/);
  });
});

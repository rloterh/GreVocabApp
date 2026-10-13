/**
 * Odd One Out, Match Up and Spell It: the session events they added, the
 * spelling checker, and each builder over the corpus that ships.
 *
 * Every rule asserted here was found by a blind read of a real sample —
 * docs/GAMES.md §6.2 — and the test is what keeps it found.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Track } from "@/types";
import { allWordsInMonth, parseVocabMonth } from "@/lib/vocabulary";
import { seededRandom } from "@/lib/order";
import { stem } from "@/lib/stem";
import { buildMatch, PAIRS_PER_BOARD } from "./builders/match";
import { buildOdd } from "./builders/odd";
import { acceptedSpellings, buildSpell, canBuildSpell, spelledRight } from "./builders/spell";
import { tierOrdinals } from "./pool";
import { buildRelationIndex, definitionStems, isConfirmed, meaningNeighbourhood } from "./relations";
import { parseRelationsFile } from "./relations-file";
import { createSession, missedWordIds, reduce, tally, type SessionEvent } from "./session";
import { BASE_POINTS, matchPoints, PAIR_SHARE } from "./scoring";
import type { GameQuestion, MatchQuestion, SpellQuestion, Tier } from "./types";

const ROOT = join(process.cwd(), "public", "vocab");
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

// ── Session ────────────────────────────────────────────────────────────────

const board: MatchQuestion = {
  kind: "match",
  wordId: "w1",
  word: "one",
  partOfSpeech: "noun",
  matchKind: "definition",
  pairs: ["w1", "w2", "w3", "w4", "w5"].map((id) => ({ wordId: id, word: id, match: `def ${id}` })),
  options: [],
  answer: -1,
  explain: { definition: "", example: "" },
};
const spell: SpellQuestion = {
  kind: "spell",
  wordId: "s1",
  word: "abate",
  partOfSpeech: "verb",
  definition: "to lessen",
  options: ["abate"],
  answer: 0,
  explain: { definition: "", example: "" },
};
const LIMIT = 60_000;

function play(questions: GameQuestion[], events: SessionEvent[], tier: Tier = "standard") {
  return events.reduce((s, e) => reduce(s, e, questions), createSession(questions, tier, LIMIT));
}

describe("Match Up in the session", () => {
  const start: SessionEvent[] = [{ type: "START", now: 0 }, { type: "ARM", now: 0 }];

  it("resolves the board only when every pair is made, with the time bonus", () => {
    const events: SessionEvent[] = [...start];
    ["w1", "w2", "w3", "w4"].forEach((id, i) => events.push({ type: "MATCH", wordId: id, now: (i + 1) * 1000 }));
    const partway = play([board], events);
    expect(partway.phase).toBe("asking");
    expect(partway.matchedIds).toHaveLength(4);
    const done = reduce(partway, { type: "MATCH", wordId: "w5", now: 10_000 }, [board]);
    expect(done.phase).toBe("feedback");
    expect(done.answers[0]).toMatchObject({ correct: true, matched: 5, missedIds: [] });
    expect(done.score).toBe(matchPoints("standard", 5, 10_000, LIMIT, true));
  });

  it("charges a wrong pairing in time, never in points", () => {
    const s = play([board], [...start, { type: "PENALTY", ms: 2000 }, { type: "PENALTY", ms: 2000 }]);
    expect(s.score).toBe(0);
    expect(s.spentMs).toBe(4000);
  });

  it("ignores a penalty while paused or after the board resolves", () => {
    const paused = play([board], [...start, { type: "PAUSE", now: 100 }, { type: "PENALTY", ms: 2000 }]);
    expect(paused.spentMs).toBe(100);
  });

  it("scores the pairs made before a time-out, and reports the rest as missed", () => {
    const s = play([board], [
      ...start,
      { type: "MATCH", wordId: "w2", now: 1000 },
      { type: "MATCH", wordId: "w4", now: 2000 },
      { type: "TICK", now: LIMIT },
    ]);
    expect(s.answers[0]).toMatchObject({ correct: false, timedOut: true, matched: 2 });
    expect(s.answers[0]!.missedIds).toEqual(["w1", "w3", "w5"]);
    expect(s.score).toBe(2 * Math.round((BASE_POINTS.standard * PAIR_SHARE) / 10) * 10);
  });

  it("ignores a repeated or unknown match", () => {
    const s = play([board], [
      ...start,
      { type: "MATCH", wordId: "w1", now: 1 },
      { type: "MATCH", wordId: "w1", now: 2 },
      { type: "MATCH", wordId: "nope", now: 3 },
    ]);
    expect(s.matchedIds).toEqual(["w1"]);
  });

  it("counts pairs, not boards, when a round is tallied", () => {
    const s = play([board], [...start, { type: "MATCH", wordId: "w1", now: 1 }, { type: "TICK", now: LIMIT }]);
    expect(tally([board], s.answers)).toEqual({ right: 1, total: 5 });
    expect(missedWordIds([board], s.answers)).toEqual(["w2", "w3", "w4", "w5"]);
  });
});

describe("Spell It in the session", () => {
  it("keeps what was typed, and a hint halves the points", () => {
    const plain = play([spell], [
      { type: "START", now: 0 },
      { type: "ARM", now: 0 },
      { type: "ANSWER", choice: 0, now: 0, typed: "abate" },
    ]);
    const hinted = play([spell], [
      { type: "START", now: 0 },
      { type: "ARM", now: 0 },
      { type: "ANSWER", choice: 0, now: 0, typed: "abate", hinted: true },
    ]);
    expect(plain.answers[0]).toMatchObject({ correct: true, typed: "abate" });
    expect(hinted.answers[0]).toMatchObject({ correct: true, hinted: true });
    expect(hinted.score).toBe(Math.round(plain.score / 20) * 10);
  });

  it("records a misspelling as wrong, with the attempt", () => {
    const s = play([spell], [
      { type: "START", now: 0 },
      { type: "ARM", now: 0 },
      { type: "ANSWER", choice: -1, now: 500, typed: "abait" },
    ]);
    expect(s.answers[0]).toMatchObject({ correct: false, typed: "abait", points: 0 });
  });
});

// ── Spelling ───────────────────────────────────────────────────────────────

describe("spelledRight", () => {
  it.each([
    ["generalise", "generalize"],
    ["analyse", "analyze"],
    ["arbour", "arbor"],
    ["centre", "center"],
    ["travelled", "traveled"],
    ["defence", "defense"],
    ["catalogue", "catalog"],
    ["pre-eminent", "preeminent"],
    ["rarified", "rarefied"],
    ["sceptic", "skeptic"],
    ["naïve", "naive"],
    ["  ABATE ", "abate"],
  ])("accepts %s for %s", (typed, answer) => {
    expect(spelledRight(typed, answer)).toBe(true);
  });

  it.each([
    ["acetic", "ascetic"],
    ["recieve", "receive"],
    ["abat", "abate"],
    ["", "abate"],
  ])("refuses %s for %s", (typed, answer) => {
    expect(spelledRight(typed, answer)).toBe(false);
  });

  it("always accepts the answer itself", () => {
    expect(acceptedSpellings("Ascetic").has("ascetic")).toBe(true);
  });
});

// ── Builders over the corpus ───────────────────────────────────────────────

describe.each([
  ["gre", "warmup"],
  ["sat", "hard"],
] as Array<[Track, Exclude<Tier, "mine">]>)("on %s/%s", (track, tier) => {
  const words = tierWords(track, tier);
  const random = seededRandom(21);

  it("Odd One Out: three linked words with a confirmed synonym, and an outsider apart from all three", () => {
    let built = 0;
    for (const word of words.filter((_, i) => i % 5 === 0)) {
      const q = buildOdd(word, { pool: words, index, monthOf: {}, tier, random });
      if (!q) continue;
      built++;
      const group = q.options.filter((_, i) => i !== q.answer);
      expect(group.map((o) => o.toLowerCase())).toContain(q.word.toLowerCase());
      const synonyms = group.filter((o) => o.toLowerCase() !== q.word.toLowerCase());
      expect(synonyms.some((s) => isConfirmed(index, word, s, "synonym"))).toBe(true);
      const hood = meaningNeighbourhood(index, word);
      expect(hood.has(stem(q.options[q.answer]!)), `${word.word}: ${q.options[q.answer]}`).toBe(false);
      expect(q.explain.note).toMatch(/are close in meaning/);
    }
    expect(built).toBeGreaterThan(10);
  });

  it("Match Up: five unrelated words, five distinct matches", () => {
    let built = 0;
    for (const word of words.filter((_, i) => i % 11 === 0)) {
      const q = buildMatch(word, { pool: words, index, monthOf: {}, tier, random });
      if (!q) continue;
      built++;
      expect(q.pairs).toHaveLength(PAIRS_PER_BOARD);
      expect(new Set(q.pairs.map((p) => stem(p.word))).size).toBe(PAIRS_PER_BOARD);
      expect(new Set(q.pairs.map((p) => p.match.toLowerCase())).size).toBe(PAIRS_PER_BOARD);
      expect(q.matchKind).toBe(tier === "warmup" ? "synonym" : "definition");
      const byWord = new Map(words.map((w) => [w.id, w]));
      for (const a of q.pairs) {
        const hood = meaningNeighbourhood(index, byWord.get(a.wordId)!);
        for (const b of q.pairs) if (a !== b) expect(hood.has(stem(b.word)), `${a.word}/${b.word}`).toBe(false);
      }
    }
    expect(built).toBeGreaterThan(10);
  });

  it("Spell It: the definition never contains the word", () => {
    for (const word of words.filter(canBuildSpell)) {
      const q = buildSpell(word, { pool: words, index, monthOf: {}, tier, random })!;
      const head = stem(q.word);
      expect([...definitionStems(q.definition)].some((s) => s === head), q.word).toBe(false);
    }
  });
});

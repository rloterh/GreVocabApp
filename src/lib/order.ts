/**
 * How a month's words are ordered where nothing else has already decided.
 *
 * The substance of this module is not the sorting — it is the boundary. An
 * ordering preference that silently overrode the scheduler would quietly break
 * the thing the app is for, so the rule is:
 *
 * > **Ordering is a presentation preference, and presentation never overrides
 * > scheduling or fairness.**
 *
 * Anywhere something is already ordered for a reason — the due deck, quiz
 * question order, search relevance — that reason wins and this module is not
 * called. See the table in docs/WORD-ORDER.md.
 *
 * Pure: the seed is passed in rather than read from a clock, the same shape as
 * `schedule(..., now)` in sm2.ts.
 */

import type { VocabWord } from "@/types";
import { normalizeWord } from "@/lib/stem";

export type WordOrder = "authored" | "alphabetical" | "random";

/**
 * The default, and deliberately not arbitrary.
 *
 * A generated month builds difficulty across its horizon and a hand-authored
 * one groups related words on the same day. Alphabetising that discards a
 * teaching decision; shuffling discards it plus any sense of progress. Most
 * users should never change this.
 */
export const DEFAULT_WORD_ORDER: WordOrder = "authored";

export const WORD_ORDERS: Array<{
  value: WordOrder;
  label: string;
  hint: string;
}> = [
  { value: "authored", label: "As written", hint: "The order they were taught in" },
  { value: "alphabetical", label: "A to Z", hint: "Easiest for looking things up" },
  { value: "random", label: "Shuffled", hint: "Stable for the day, different tomorrow" },
];

/**
 * Order words for presentation.
 *
 * Never mutates its input — a store holding the authored order must keep it,
 * because "authored" has to remain recoverable after any other choice.
 */
export function orderWords(
  words: readonly VocabWord[],
  order: WordOrder,
  seed = 0,
): VocabWord[] {
  switch (order) {
    case "alphabetical":
      return [...words].sort((a, b) =>
        normalizeWord(a.word).localeCompare(normalizeWord(b.word)),
      );
    case "random":
      return shuffle(words, seed);
    case "authored":
    default:
      return [...words];
  }
}

/**
 * A seed that is stable exactly as long as it should be.
 *
 * Stable **within a day and a deck**, so the same month opens in the same order
 * all day and position becomes a usable memory aid. Different **tomorrow**,
 * because the point of shuffling is to break the ordering effect — remembering
 * a word by its neighbours rather than by its meaning.
 *
 * A shuffle that changed on every render would move the card being read.
 */
export function seedFor(parts: readonly string[]): number {
  return hash(parts.join("|"));
}

/** Today, as a key a seed can be built from. */
export function dayKey(now: Date): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * FNV-1a. Small, dependency-free, and good enough to spread seeds — this is
 * choosing a permutation, not protecting anything.
 */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    // The FNV prime, via shifts so this stays in 32-bit integer arithmetic.
    value +=
      (value << 1) + (value << 4) + (value << 7) + (value << 8) + (value << 24);
  }
  return value >>> 0;
}

/** mulberry32: a small deterministic PRNG. Same seed, same sequence. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded Fisher–Yates. */
function shuffle<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  const random = prng(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

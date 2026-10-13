/**
 * Ten questions from a pool.
 *
 * Words are drawn in a seeded order and offered to the game's builder until
 * the round is full. A word the builder cannot make a good question from is
 * skipped; a pool that cannot fill a round reports the shortfall instead of
 * padding it, so the hub can say why rather than start a short round silently.
 *
 * See docs/GAMES.md §6.1.
 */

import type { Track, VocabWord } from "@/types";
import { seededRandom, seededShuffle } from "@/lib/order";
import { stem } from "@/lib/stem";
import { GAMES } from "./catalogue";
import { buildRelationIndex, type RelationIndex } from "./relations";
import type { GameId, GameQuestion, GameRound, Tier } from "./types";

export const ROUND_LENGTH = 10;

export interface RoundInput {
  game: GameId;
  track: Track;
  tier: Tier;
  /** Words that may be asked about. */
  prompts: readonly VocabWord[];
  /** Words that may supply wrong answers. Usually a superset of `prompts`. */
  pool: readonly VocabWord[];
  monthOf: Record<string, string>;
  seed: number;
  length?: number;
  /** Pass one in when building many rounds over the same pool. */
  index?: RelationIndex;
}

export function buildRound(input: RoundInput): GameRound {
  const definition = GAMES[input.game];
  const length = input.length ?? definition.length ?? ROUND_LENGTH;
  const random = seededRandom(input.seed);
  const index = input.index ?? buildRelationIndex(input.pool);

  const order = seededShuffle(
    input.prompts.filter((w) => definition.eligible(w)),
    input.seed,
  );

  const truths = definition.balanced ? balancedTruths(length, input.seed) : null;
  const questions: GameQuestion[] = [];
  const asked = new Set<string>();
  for (const word of order) {
    if (questions.length === length) break;
    const key = stem(word.word);
    // The same word under two ids, or two forms of one word, is one question.
    if (asked.has(key)) continue;
    const question = definition.build(word, {
      pool: input.pool,
      index,
      monthOf: input.monthOf,
      tier: input.tier,
      random,
      truth: truths?.[questions.length],
      exclude: asked,
    });
    if (!question) continue;
    // Every word a question shows is spent for the round, not only its
    // headword: a Match Up board uses five, an Odd One Out shows four.
    for (const w of wordsShown(question)) asked.add(stem(w));
    asked.add(key);
    questions.push(question);
  }

  return {
    game: input.game,
    track: input.track,
    tier: input.tier,
    seed: input.seed,
    questions,
    shortfall: length - questions.length,
  };
}

function wordsShown(q: GameQuestion): string[] {
  if (q.kind === "match") return q.pairs.map((p) => p.word);
  if (q.kind === "choice" && q.ask) return q.options;
  return [q.word];
}

/**
 * Half true, half false, never four the same in a row, in a seeded order.
 *
 * A run of four is where a player starts guessing the pattern instead of
 * reading the statement. Re-shuffled until it has none; with ten slots that
 * takes a handful of tries.
 */
export function balancedTruths(length: number, seed: number): boolean[] {
  const base = Array.from({ length }, (_, i) => i < Math.ceil(length / 2));
  for (let attempt = 0; attempt < 200; attempt++) {
    const order = seededShuffle(base, seed + attempt * 7919);
    if (longestRun(order) < 4) return order;
  }
  return base.map((_, i) => i % 2 === 0);
}

function longestRun(values: readonly boolean[]): number {
  let best = 0;
  let run = 0;
  for (let i = 0; i < values.length; i++) {
    run = i > 0 && values[i] === values[i - 1] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/** How many words in `prompts` this game could ask about. For the hub and the audit. */
export function eligibleCount(game: GameId, prompts: readonly VocabWord[]): number {
  return prompts.filter((w) => GAMES[game].eligible(w)).length;
}

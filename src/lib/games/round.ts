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
  const length = input.length ?? ROUND_LENGTH;
  const definition = GAMES[input.game];
  const random = seededRandom(input.seed);
  const index = input.index ?? buildRelationIndex(input.pool);

  const order = seededShuffle(
    input.prompts.filter((w) => definition.eligible(w)),
    input.seed,
  );

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
    });
    if (!question) continue;
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

/** How many words in `prompts` this game could ask about. For the hub and the audit. */
export function eligibleCount(game: GameId, prompts: readonly VocabWord[]): number {
  return prompts.filter((w) => GAMES[game].eligible(w)).length;
}

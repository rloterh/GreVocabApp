/**
 * Match Up: a board of five words and what they mean, paired by the player.
 *
 * Warm-up pairs words with their best synonym, which is short enough for a
 * phone; every other tier pairs them with their full definition, never
 * truncated — a truncated definition is a different definition.
 *
 * The danger on a board is two right-hand items that could each pair with the
 * same word. So the five are chosen to be **mutually unrelated**: no word in
 * another's meaning neighbourhood, and no two definitions sharing a content
 * word. A board the pool cannot supply that way is not built.
 *
 * See docs/GAMES.md §4.6.
 */

import type { VocabWord } from "@/types";
import { stem } from "@/lib/stem";
import type { BuildContext } from "../context";
import {
  definitionStems,
  isConfirmed,
  meaningNeighbourhood,
  rankedSynonyms,
} from "../relations";
import { displayWord, isOneWord } from "../text";
import type { MatchQuestion } from "../types";

export const PAIRS_PER_BOARD = 5;
/** How many candidates to try for the other four words. */
const SCAN = 120;

export function canBuildMatch(word: VocabWord): boolean {
  return isOneWord(word.word) && Boolean(word.definition.trim());
}

export function buildMatch(word: VocabWord, ctx: BuildContext): MatchQuestion | null {
  const bySynonym = ctx.tier === "warmup";
  // On a synonym board, a pair both cards confirm where there is one: one
  // card's list put "frosted" beside *translucent* (blind read, seed 7).
  const right = (w: VocabWord) => {
    if (!bySynonym) return w.definition.trim();
    const ranked = rankedSynonyms(ctx.index, w);
    return ranked.find((s) => isConfirmed(ctx.index, w, s, "synonym")) ?? ranked[0];
  };
  if (!canBuildMatch(word) || !right(word)) return null;

  const chosen: VocabWord[] = [word];
  const hoods = [meaningNeighbourhood(ctx.index, word)];
  const defs = [definitionStems(word.definition)];
  const stems = new Set([stem(word.word)]);
  const rights = new Set([stem(right(word)!)]);

  // A seeded walk through the pool from a random start.
  const pool = ctx.pool;
  const start = Math.floor(ctx.random() * Math.max(1, pool.length));
  for (let k = 0; k < Math.min(SCAN, pool.length) && chosen.length < PAIRS_PER_BOARD; k++) {
    const c = pool[(start + k * 7) % pool.length]!;
    const s = stem(c.word);
    if (stems.has(s) || ctx.exclude?.has(s) || !canBuildMatch(c)) continue;
    const r = right(c);
    if (!r || rights.has(stem(r))) continue;
    const hood = meaningNeighbourhood(ctx.index, c);
    const def = definitionStems(c.definition);
    // Unrelated to every word already on the board, in both directions.
    const related = chosen.some(
      (_, i) =>
        hoods[i]!.has(s) ||
        hood.has(stem(chosen[i]!.word)) ||
        [...def].some((d) => defs[i]!.has(d)) ||
        (bySynonym && (hoods[i]!.has(stem(r)) || hood.has(stem(right(chosen[i]!)!)))),
    );
    if (related) continue;
    chosen.push(c);
    hoods.push(hood);
    defs.push(def);
    stems.add(s);
    rights.add(stem(r));
  }
  if (chosen.length < PAIRS_PER_BOARD) return null;

  return {
    kind: "match",
    wordId: word.id,
    word: displayWord(word.word),
    partOfSpeech: word.partOfSpeech,
    matchKind: bySynonym ? "synonym" : "definition",
    pairs: chosen.map((w) => ({ wordId: w.id, word: displayWord(w.word), match: right(w)! })),
    options: [],
    answer: -1,
    explain: { definition: word.definition, example: word.example },
  };
}

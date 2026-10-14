/**
 * Unscramble: a definition, and the word's letters as shuffled tiles.
 *
 * The defensibility problem here is not a near-synonym but an **anagram**: if
 * the tiles also spell another word, a player who finds that one has been
 * right and would be marked wrong. So a word is never asked when any other
 * word in the corpus — either track, via the relations graph — is made of the
 * same letters. Words outside the corpus cannot be checked that way; the
 * blind read of the sample is what checks those.
 *
 * Wrong arrangements cost time, not points: the board stays open until the
 * word is found or the clock runs out. A hint places the first letter and
 * halves the points, as in Spell It.
 *
 * See docs/GAMES.md §4.8.
 */

import type { VocabWord } from "@/types";
import { stem } from "@/lib/stem";
import type { BuildContext } from "../context";
import { definitionStems } from "../relations";
import { displayWord } from "../text";
import type { TilesQuestion } from "../types";

const MIN_LETTERS = 5;
const MAX_LETTERS = 10;

/** The letters of a word, sorted: two words are anagrams when these match. */
export function letterKey(word: string): string {
  return [...word.trim().toLowerCase()].sort().join("");
}

/**
 * Letter keys shared by more than one word in `words`. A word whose key is
 * in here has an anagram in the corpus and cannot be asked.
 */
export function ambiguousKeys(words: Iterable<string>): Set<string> {
  const seen = new Map<string, string>();
  const out = new Set<string>();
  for (const w of words) {
    const word = w.trim().toLowerCase();
    if (!/^[a-z]+$/.test(word)) continue;
    const key = letterKey(word);
    const prior = seen.get(key);
    if (prior !== undefined && prior !== word) out.add(key);
    else seen.set(key, word);
  }
  return out;
}

export function canBuildUnscramble(word: VocabWord): boolean {
  const w = word.word.trim();
  if (w.length < MIN_LETTERS || w.length > MAX_LETTERS) return false;
  if (!/^[A-Za-z]+$/.test(w) || !word.definition.trim()) return false;
  // Nothing to unscramble if the definition already says it.
  const head = stem(w);
  for (const s of definitionStems(word.definition)) {
    if (s === head || s.startsWith(head) || (head.startsWith(s) && s.length >= 4)) return false;
  }
  // A word with a repeated run of one letter ("aaaa") shuffles to itself.
  return new Set(w.toLowerCase()).size >= 3;
}

export function buildUnscramble(word: VocabWord, ctx: BuildContext): TilesQuestion | null {
  if (!canBuildUnscramble(word)) return null;
  if (ctx.ambiguous?.has(letterKey(word.word))) return null;

  const answer = displayWord(word.word).toLowerCase();
  // Shuffle until the tiles do not already spell the word, and do not start
  // with its first two letters — a scramble that reads as the word is none.
  let tiles = [...answer];
  for (let attempt = 0; attempt < 20; attempt++) {
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(ctx.random() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j]!, tiles[i]!];
    }
    if (tiles.join("") !== answer && tiles.slice(0, 2).join("") !== answer.slice(0, 2)) break;
  }
  if (tiles.join("") === answer) tiles = [...tiles.slice(1), tiles[0]!];

  return {
    kind: "tiles",
    wordId: word.id,
    word: answer,
    partOfSpeech: word.partOfSpeech,
    definition: word.definition,
    tiles,
    options: [answer],
    answer: 0,
    explain: { definition: word.definition, example: word.example },
  };
}

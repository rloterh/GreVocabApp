/**
 * Spell It: hear the word, read its definition, type it.
 *
 * The definition must not give the word away — a card that defines *abate*
 * with "abatement" leaves nothing to spell — and the word must be one a
 * person could type: letters only, one word, four to fourteen of them.
 *
 * Matching is exact after trimming and lower-casing. Nothing fuzzier: this
 * game *is* the spelling. See docs/GAMES.md §4.7.
 */

import type { VocabWord } from "@/types";
import { stem } from "@/lib/stem";
import type { BuildContext } from "../context";
import { definitionStems } from "../relations";
import { displayWord } from "../text";
import type { SpellQuestion } from "../types";

const MIN_LETTERS = 4;
const MAX_LETTERS = 14;

export function canBuildSpell(word: VocabWord): boolean {
  const w = word.word.trim();
  if (w.length < MIN_LETTERS || w.length > MAX_LETTERS) return false;
  if (!/^[A-Za-z]+$/.test(w)) return false;
  if (!word.definition.trim()) return false;
  // The definition must not contain the word, or any form of it.
  const head = stem(w);
  for (const s of definitionStems(word.definition)) {
    if (s === head || s.startsWith(head) || (head.startsWith(s) && s.length >= 4)) return false;
  }
  return true;
}

export function buildSpell(word: VocabWord, _ctx: BuildContext): SpellQuestion | null {
  if (!canBuildSpell(word)) return null;
  const answer = displayWord(word.word);
  return {
    kind: "spell",
    wordId: word.id,
    word: answer,
    partOfSpeech: word.partOfSpeech,
    definition: word.definition,
    options: [answer],
    answer: 0,
    explain: { definition: word.definition, example: word.example },
  };
}

/**
 * One-off variants that no spelling rule produces. Each found by a read of
 * the audit sample; add to it the same way.
 */
export const REVIEWED_VARIANTS: Readonly<Record<string, readonly string[]>> = {
  rarefied: ["rarified"],
  foregather: ["forgather"],
  apothegm: ["apophthegm"],
  chimera: ["chimaera"],
  whimsy: ["whimsey"],
  apprise: ["apprize"],
  biased: ["biassed"],
  unbiased: ["unbiassed"],
  skeptic: ["sceptic"],
  skeptical: ["sceptical"],
  skepticism: ["scepticism"],
  judgment: ["judgement"],
  acknowledgment: ["acknowledgement"],
};

/**
 * Every spelling that should count as right for `answer`.
 *
 * A blind read of the sample marked 3% of Spell It wrong, and every one was a
 * legitimate variant: *generalise* for *generalize*, *rarified* for
 * *rarefied*, *pre-eminent* for *preeminent*. Marking a correct spelling wrong
 * is the one thing a spelling game cannot do, so the checker is deliberately
 * generous with the regular British/American patterns. The price is that a
 * rare misspelling which happens to look like a variant ("actour") also
 * passes, and that is the right way round.
 */
export function acceptedSpellings(answer: string): Set<string> {
  const base = compact(answer);
  const out = new Set<string>([base]);
  for (const v of REVIEWED_VARIANTS[base] ?? []) out.add(compact(v));
  const rules: Array<[RegExp, string]> = [
    // -ize / -ise and their forms; -yze / -yse.
    [/iz(e|ed|es|ing|ation|ations|er|ers)$/, "is$1"],
    [/yz(e|ed|es|ing|er|ers)$/, "ys$1"],
    // -or / -our (arbor, honor, behavior).
    [/or(s|ed|ing|able|ful)?$/, "our$1"],
    // -er / -re at the end (center, meager, somber).
    [/([^aeiou])er$/, "$1re"],
    // A final l doubled before a suffix (traveled, marvelous).
    [/([aeiou])l(ed|ing|er|ers|ous)$/, "$1ll$2"],
    // -ense / -ence (defense, offense).
    [/ense$/, "ence"],
    // -og / -ogue (catalog, analog).
    [/og$/, "ogue"],
  ];
  for (const form of [...out]) {
    for (const [pattern, replacement] of rules) {
      if (pattern.test(form)) out.add(form.replace(pattern, replacement));
    }
  }
  return out;
}

/**
 * Lower case, no spaces or hyphens, straight apostrophes, and no accents —
 * "naïve" and "mélange" are the same word as their plain spellings, and a
 * phone keyboard offers both.
 */
function compact(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[\s-]+/g, "");
}

/**
 * Is this what the player meant to type? Case, spaces, hyphens and the curly
 * apostrophe a phone keyboard substitutes are forgiven, and so is any
 * spelling in {@link acceptedSpellings}. Letters otherwise are not.
 */
export function spelledRight(typed: string, answer: string): boolean {
  const t = compact(typed);
  return t !== "" && acceptedSpellings(answer).has(t);
}

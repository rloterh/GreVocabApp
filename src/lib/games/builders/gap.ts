/**
 * Fill the Gap: the word's own example sentence with the word blanked out,
 * and four headwords to choose from.
 *
 * The defensibility risk here is different from a synonym game: a wrong
 * option is defensible if it *fits the sentence*. A near-synonym fits almost
 * any sentence its partner does, so the same meaning guard as Closest Meaning
 * runs on every option — and the options are the same part of speech, so
 * grammar never gives the answer away.
 *
 * Blanking reuses `blankOut` from the confusables drill, which already handles
 * inflections (*belied* for *belie*). A word whose example cannot be blanked
 * is skipped, never shown half-blanked.
 *
 * See docs/GAMES.md §4.4.
 */

import type { VocabWord } from "@/types";
import { blankOut } from "@/lib/confusables";
import { pickDistractors } from "@/lib/distractors";
import { normalizeWord, stem } from "@/lib/stem";
import type { BuildContext } from "../context";
import {
  definitionStems,
  isSafeSynonymSource,
  meaningNeighbourhood,
  MAX_TERM_LENGTH,
} from "../relations";
import { displayWord } from "../text";
import type { ChoiceQuestion } from "../types";

const CANDIDATES = 40;
const WRONG = 3;

export function canBuildGap(word: VocabWord): boolean {
  return Boolean(word.example) && blankOut(word.example, word.word) !== null && isOneWord(word.word);
}

function isOneWord(word: string): boolean {
  const w = word.trim();
  return w.length <= MAX_TERM_LENGTH && /^[A-Za-z][A-Za-z'-]*[A-Za-z]$/.test(w);
}

export function buildGap(word: VocabWord, ctx: BuildContext): ChoiceQuestion | null {
  if (!isOneWord(word.word)) return null;
  const sentence = blankOut(word.example, word.word);
  if (!sentence) return null;
  // A sentence that uses the word twice still shows it after the first is
  // blanked: "For ____ of a nail … for want of a shoe". Skip it.
  const head = normalizeWord(word.word);
  if (sentence.split(/[^A-Za-z'-]+/).some((t) => t && normalizeWord(t).startsWith(head))) return null;

  const neighbourhood = meaningNeighbourhood(ctx.index, word);
  const ownDefinition = definitionStems(word.definition);
  // Words already in the sentence would read oddly as options, and one of
  // them could be the sentence's own subject.
  const inSentence = new Set(
    sentence.split(/[^A-Za-z'-]+/).filter(Boolean).map((t) => stem(t)),
  );
  const used = new Set<string>([stem(word.word)]);
  const wrong: string[] = [];

  const candidates = pickDistractors(word, { pool: ctx.pool, random: ctx.random }, CANDIDATES);
  for (const candidate of candidates) {
    if (wrong.length === WRONG) break;
    if (!isOneWord(candidate.word)) continue;
    // Same part of speech, strictly: the gap's grammar must not give it away.
    if (normalizeWord(candidate.partOfSpeech) !== normalizeWord(word.partOfSpeech)) continue;
    const s = stem(candidate.word);
    if (used.has(s) || inSentence.has(s)) continue;
    if (!isSafeSynonymSource(ctx.index, neighbourhood, candidate, ownDefinition)) continue;
    used.add(s);
    wrong.push(displayWord(candidate.word));
  }
  if (wrong.length < WRONG) return null;

  const key = displayWord(word.word);
  const options = [key, ...wrong];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.random() * (i + 1));
    [options[i], options[j]] = [options[j]!, options[i]!];
  }

  return {
    kind: "choice",
    wordId: word.id,
    word: key,
    partOfSpeech: word.partOfSpeech,
    options,
    answer: options.indexOf(key),
    sentence,
    explain: { definition: word.definition, example: word.example },
  };
}

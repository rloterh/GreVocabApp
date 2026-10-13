/**
 * Opposites: a word, and four single-word options, one its antonym.
 *
 * From Standard upwards one wrong option is a **synonym** of the word — the
 * classic trap in antonym questions, and learning to spot it is worth more
 * than the antonym itself. Review names it.
 *
 * Every other wrong option passes the opposite-side guard in relations.ts,
 * which also refuses a word that is the opposite of anything meaning what the
 * target means. Returns null rather than a weak question.
 *
 * See docs/GAMES.md §4.3.
 */

import type { VocabWord } from "@/types";
import { pickDistractors } from "@/lib/distractors";
import { stem } from "@/lib/stem";
import type { BuildContext } from "../context";
import {
  isConfirmed,
  isEligibleTerm,
  isSafeOppositeSource,
  meaningNeighbourhood,
  oppositeNeighbourhood,
  rankedAntonyms,
  rankedSynonyms,
} from "../relations";
import { displayWord } from "../text";
import type { ChoiceQuestion } from "../types";

/** Same bar as Closest Meaning, for the same reason: one is usually a guess. */
export const MIN_ANTONYMS = 2;
const CANDIDATES = 40;
const WRONG = 3;

/**
 * Does this word's antonym need its partner's card to confirm it?
 *
 * Nouns and verbs, yes. Blind reads found their unconfirmed antonym lists
 * forced again and again — *silt* → "gravel", *supplant* → "retain",
 * *befall* → "avoid", *dread* (verb) → "eagerness" (a noun). Adjectives keep
 * the looser rule: opposition is natural to them, and their lists held up.
 */
function needsConfirmation(word: VocabWord): boolean {
  return /^(noun|verb)\b/i.test(word.partOfSpeech.trim());
}

export function canBuildOpposites(word: VocabWord): boolean {
  return (word.antonyms ?? []).filter((a) => isEligibleTerm(a, word.word)).length >= MIN_ANTONYMS;
}

export function buildOpposites(word: VocabWord, ctx: BuildContext): ChoiceQuestion | null {
  const ranked = rankedAntonyms(ctx.index, word);
  if (ranked.length < MIN_ANTONYMS) return null;
  const key = ranked[0]!;

  const opposites = oppositeNeighbourhood(ctx.index, word);
  const meaning = meaningNeighbourhood(ctx.index, word);
  // Lists that contradict themselves are not evidence: *estimate*'s antonym
  // "calculate" sits in its own meaning neighbourhood. Skip the word.
  if (meaning.has(stem(key))) return null;
  if (needsConfirmation(word) && !isConfirmed(ctx.index, word, key, "antonym")) return null;
  const used = new Set<string>([stem(key)]);
  const wrong: string[] = [];

  // The trap: the word's own best synonym. Warm-up goes without, so a first
  // round teaches the format before it tests the reflex.
  let trapTerm: string | null = null;
  if (ctx.tier !== "warmup") {
    const synonym = rankedSynonyms(ctx.index, word).find(
      (s) => !opposites.has(stem(s)) && !used.has(stem(s)),
    );
    if (synonym) {
      trapTerm = synonym;
      used.add(stem(synonym));
      wrong.push(synonym);
    }
  }

  const candidates = pickDistractors(word, { pool: ctx.pool, random: ctx.random }, CANDIDATES);
  for (const candidate of candidates) {
    if (wrong.length === WRONG) break;
    if (!isSafeOppositeSource(ctx.index, opposites, meaning, candidate)) continue;
    const terms = (candidate.synonyms ?? [])
      .map((t) => t.trim())
      .filter(
        (t) =>
          isEligibleTerm(t, candidate.word) &&
          isEligibleTerm(t, word.word) &&
          !opposites.has(stem(t)) &&
          !used.has(stem(t)),
      );
    if (terms.length === 0) continue;
    const term = terms[Math.floor(ctx.random() * terms.length)]!;
    used.add(stem(term));
    wrong.push(term);
  }
  if (wrong.length < WRONG) return null;

  const options = [key, ...wrong];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.random() * (i + 1));
    [options[i], options[j]] = [options[j]!, options[i]!];
  }

  return {
    kind: "choice",
    wordId: word.id,
    word: displayWord(word.word),
    partOfSpeech: word.partOfSpeech,
    options,
    answer: options.indexOf(key),
    trap: trapTerm ? options.indexOf(trapTerm) : undefined,
    explain: {
      definition: word.definition,
      example: word.example,
      note: trapTerm
        ? `“${trapTerm}” was the trap: it means the same as ${displayWord(word.word)}, not the opposite.`
        : undefined,
    },
  };
}

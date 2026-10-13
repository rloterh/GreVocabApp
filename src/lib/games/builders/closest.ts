/**
 * Closest Meaning: a word, and four single-word options, one its synonym.
 *
 * Every option is a synonym of *some* word, so all four sit at the same
 * register — a headword among three plain synonyms would stand out. The wrong
 * ones come from words the existing distractor scorer ranks as confusable
 * (same part of speech first), then each passes the guard in relations.ts.
 *
 * Returns null rather than a weak question. See docs/GAMES.md §4.1.
 */

import type { VocabWord } from "@/types";
import { pickDistractors } from "@/lib/distractors";
import { stem } from "@/lib/stem";
import type { BuildContext } from "../context";
import {
  definitionStems,
  isEligibleTerm,
  isSafeSynonymSource,
  isSafeWrongSynonym,
  meaningNeighbourhood,
  rankedSynonyms,
} from "../relations";
import { displayWord } from "../text";
import type { ChoiceQuestion } from "../types";

/**
 * Usable synonyms a word needs before it is asked about.
 *
 * Two, because a card with only one is usually a word with no real synonym
 * that the generator was made to give one anyway: *deciduous* → "broadleaf",
 * *bracken* → "fern", *plutocracy* → "oligarchy". It costs 68 of 5,421 words.
 */
export const MIN_SYNONYMS = 2;

/** Candidates the scorer is asked for; most are rejected by the guard. */
const CANDIDATES = 40;
const WRONG = 3;

export function canBuildClosest(word: VocabWord): boolean {
  return (word.synonyms ?? []).filter((s) => isEligibleTerm(s, word.word)).length >= MIN_SYNONYMS;
}

export function buildClosest(word: VocabWord, ctx: BuildContext): ChoiceQuestion | null {
  const ranked = rankedSynonyms(ctx.index, word);
  if (ranked.length < MIN_SYNONYMS) return null;

  // Always the card's best synonym, on every tier. Fiendish is harder through
  // closer wrong answers and less time — never through a weaker right one.
  const key = ranked[0]!;

  const neighbourhood = meaningNeighbourhood(ctx.index, word);
  const ownDefinition = definitionStems(word.definition);
  const used = new Set<string>([stem(key)]);
  const wrong: string[] = [];
  const preferSimilarLength = ctx.tier === "hard" || ctx.tier === "fiendish";

  // No `monthOf`, deliberately. The scorer's same-month bonus is right for a
  // definition quiz and wrong here: months are themed ("Criticism and
  // praise"), so a word from the same month is the likeliest near-synonym in
  // the corpus. An independent read of the audit sample traced most of its
  // defensible options to exactly that (*unravel* → "uncover").
  const candidates = pickDistractors(
    word,
    { pool: ctx.pool, random: ctx.random },
    CANDIDATES,
  );

  for (const candidate of candidates) {
    if (wrong.length === WRONG) break;
    if (!isSafeSynonymSource(ctx.index, neighbourhood, candidate, ownDefinition)) continue;

    const terms = (candidate.synonyms ?? [])
      .map((t) => t.trim())
      .filter(
        (t) =>
          isEligibleTerm(t, candidate.word) &&
          isEligibleTerm(t, word.word) &&
          isSafeWrongSynonym(neighbourhood, t) &&
          !used.has(stem(t)),
      );
    if (terms.length === 0) continue;

    const term =
      ctx.tier === "fiendish"
        ? confusableWith(terms, key)
        : preferSimilarLength
          ? closestInLength(terms, key.length)
          : terms[Math.floor(ctx.random() * terms.length)]!;
    used.add(stem(term));
    wrong.push(term);
  }

  if (wrong.length < WRONG) return null;

  const options = [key, ...wrong];
  // Seeded Fisher–Yates through the injected generator.
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
    explain: { definition: word.definition, example: word.example },
  };
}

/**
 * Fiendish: the term that looks most like the key — same first letter first,
 * then nearest in length. Also keeps Fiendish from repeating Hard, which
 * draws on the same words and would otherwise pick the same options.
 */
function confusableWith(terms: readonly string[], key: string): string {
  const initial = key.charAt(0).toLowerCase();
  const same = terms.filter((t) => t.charAt(0).toLowerCase() === initial);
  return closestInLength(same.length > 0 ? same : terms, key.length);
}

function closestInLength(terms: readonly string[], length: number): string {
  let best = terms[0]!;
  for (const t of terms) {
    if (Math.abs(t.length - length) < Math.abs(best.length - length)) best = t;
  }
  return best;
}

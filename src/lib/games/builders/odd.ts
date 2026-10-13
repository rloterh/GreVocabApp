/**
 * Odd One Out: four words, three sharing a meaning — pick the outsider.
 *
 * The three are a word and two of its synonyms, and they have to genuinely
 * share a meaning — with each other, not only with the word. A blind read
 * found the failure that rule prevents: *sobriety* is "not drunk, or
 * serious", and its synonyms "abstinence" and "seriousness" each took one
 * sense and shared nothing. So the two must be **linked to each other** —
 * one listing the other, or both listed together by another card — and at
 * least one must be **confirmed**, its own card listing the word back.
 *
 * The outsider is a headword of the same part of speech that passes the
 * meaning guard against all three, so no reader can argue it belongs. Shown
 * as itself, not as a synonym, so it sits at the same register as the word.
 *
 * See docs/GAMES.md §4.5.
 */

import type { VocabWord } from "@/types";
import { pickDistractors } from "@/lib/distractors";
import { normalizeWord, stem } from "@/lib/stem";
import type { BuildContext } from "../context";
import {
  antonymsOf,
  definitionStems,
  isConfirmed,
  isEligibleTerm,
  isSafeSynonymSource,
  meaningNeighbourhood,
  rankedSynonyms,
  synonymsOf,
} from "../relations";
import { asClause, displayWord, isOneWord } from "../text";
import type { ChoiceQuestion } from "../types";

const CANDIDATES = 40;

export function canBuildOdd(word: VocabWord): boolean {
  return (
    isOneWord(word.word) &&
    (word.synonyms ?? []).filter((s) => isEligibleTerm(s, word.word)).length >= 2
  );
}

export function buildOdd(word: VocabWord, ctx: BuildContext): ChoiceQuestion | null {
  if (!isOneWord(word.word)) return null;
  const ranked = rankedSynonyms(ctx.index, word);
  if (ranked.length < 2) return null;
  // The first two synonyms that are linked to each other, at least one of
  // them confirmed. Requiring both confirmed as well left too few words to
  // fill a round on most tiers; the link is what fixes split senses, and one
  // confirmation screens out a list's weakest entries.
  const isOk = (s: string) => isConfirmed(ctx.index, word, s, "synonym");
  let pair: [string, string] | null = null;
  for (let i = 0; i < ranked.length && !pair; i++) {
    for (let j = i + 1; j < ranked.length && !pair; j++) {
      const x = ranked[i]!;
      const y = ranked[j]!;
      if ((isOk(x) || isOk(y)) && linked(ctx, stem(word.word), x, y)) pair = [x, y];
    }
  }
  if (!pair) return null;
  const [a, b] = pair;

  // Everything that means what the three mean.
  const neighbourhood = meaningNeighbourhood(ctx.index, word);
  for (const s of [a, b]) {
    neighbourhood.add(stem(s));
    for (const t of synonymsOf(ctx.index, stem(s))) neighbourhood.add(t);
    for (const h of ctx.index.listedBy.get(stem(s)) ?? []) neighbourhood.add(h);
  }
  const ownDefinition = definitionStems(word.definition);
  const used = new Set([stem(word.word), stem(a), stem(b)]);

  const candidates = pickDistractors(word, { pool: ctx.pool, random: ctx.random }, CANDIDATES);
  // Fiendish takes the most confusable outsider the scorer offers; the other
  // tiers take any of the first few, so a word met twice varies.
  const safe = candidates.filter(
    (c) =>
      isOneWord(c.word) &&
      normalizeWord(c.partOfSpeech) === normalizeWord(word.partOfSpeech) &&
      !used.has(stem(c.word)) &&
      !ctx.exclude?.has(stem(c.word)) &&
      isSafeSynonymSource(ctx.index, neighbourhood, c, ownDefinition),
  );
  if (safe.length === 0) return null;
  const outsider =
    ctx.tier === "fiendish" ? safe[0]! : safe[Math.floor(ctx.random() * Math.min(4, safe.length))]!;

  const w = displayWord(word.word);
  const odd = displayWord(outsider.word);
  const options = [w, a, b, odd];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.random() * (i + 1));
    [options[i], options[j]] = [options[j]!, options[i]!];
  }

  return {
    kind: "choice",
    wordId: word.id,
    word: w,
    partOfSpeech: word.partOfSpeech,
    options,
    answer: options.indexOf(odd),
    ask: "Which one doesn’t belong?",
    explain: {
      definition: word.definition,
      example: word.example,
      // "Close in meaning", not "all mean <the word's definition>": a
      // synonym is rarely an exact fit for a narrow definition, and saying it
      // is taught the reader something false (*gentry*, "aristocracy").
      note: `“${w}”, “${a}” and “${b}” are close in meaning. “${odd}” means ${asClause(outsider.definition)}.`,
    },
  };
}

/**
 * Do two synonyms of the same word share a meaning with each other? One lists
 * the other, or both list a common third word — and neither is the other's
 * listed opposite.
 */
function linked(ctx: BuildContext, head: string, a: string, b: string): boolean {
  const sa = stem(a);
  const sb = stem(b);
  if (antonymsOf(ctx.index, sa).has(sb) || antonymsOf(ctx.index, sb).has(sa)) return false;
  const ofA = synonymsOf(ctx.index, sa);
  const ofB = synonymsOf(ctx.index, sb);
  if (ofA.has(sb) || ofB.has(sa)) return true;
  for (const x of ofA) if (x !== head && ofB.has(x)) return true;
  // Both listed together by some card other than the word's own.
  for (const h of ctx.index.listedBy.get(sa) ?? []) {
    if (h !== head && ctx.index.listedBy.get(sb)?.has(h)) return true;
  }
  return false;
}

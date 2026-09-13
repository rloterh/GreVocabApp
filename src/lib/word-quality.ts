/**
 * Checking generated cards before they become the user's data.
 *
 * Generated content is the app's product. A model asked for ninety words will
 * produce a handful of cards that are technically well-formed and useless: a
 * definition that uses the word it defines, an example that restates the
 * definition instead of showing the word in use, a "mnemonic" that is the
 * definition again in different words.
 *
 * All three are cheap to detect locally and expensive to notice as a user,
 * three weeks in, one card at a time. Each failure costs one targeted
 * regeneration rather than a whole batch.
 *
 * Every message here is written to be fed back to a model as an instruction,
 * not only shown in a log — so they say what to do, not just what is wrong.
 *
 * See docs/VOCAB-GENERATION.md.
 */

import type { VocabWord } from "@/types";
import { stem } from "@/lib/stem";
import { normalizeText, overlapRatio } from "@/lib/text-overlap";

/** Which part of the card is at fault. */
export type QualityField = "definition" | "example" | "mnemonic";

export interface QualityIssue {
  field: QualityField;
  /** Fit to send back to a model as a correction. */
  message: string;
}

/**
 * How much of a card may be recycled from the definition before it stops
 * teaching anything.
 *
 * Not 1.0: a good example legitimately shares some words with a definition, and
 * an example for "laconic" may well contain "few words". This is tuned to catch
 * wholesale restatement, which is what models actually do.
 */
export const RESTATEMENT_THRESHOLD = 0.7;

/** Longest a definition should be. One sentence, plainly put. */
const MAX_DEFINITION_WORDS = 30;

/**
 * Everything wrong with one card.
 *
 * Empty array means it passed. Fields that are blank are not reported here —
 * `validateWords` in `generate.ts` rejects those before this runs, and
 * repeating the check would produce two different messages for one problem.
 */
export function checkWord(word: VocabWord): QualityIssue[] {
  const issues: QualityIssue[] = [];

  if (isCircular(word.definition, word.word)) {
    issues.push({
      field: "definition",
      message: `The definition of "${word.word}" uses the word itself. Define it without using "${word.word}" or any form of it.`,
    });
  }

  if (countWords(word.definition) > MAX_DEFINITION_WORDS) {
    issues.push({
      field: "definition",
      message: `The definition of "${word.word}" is too long. Give one clear sentence of at most ${MAX_DEFINITION_WORDS} words.`,
    });
  }

  if (!containsWord(word.example, word.word)) {
    issues.push({
      field: "example",
      message: `The example for "${word.word}" does not use the word. Write a sentence that actually contains "${word.word}".`,
    });
  } else if (restates(word.example, word.definition)) {
    // Only worth saying when the word is present: "does not use the word" is
    // the more useful of the two complaints, and one instruction at a time
    // gets followed more reliably than two.
    issues.push({
      field: "example",
      message: `The example for "${word.word}" restates the definition. Write a sentence where the meaning is inferable from the situation, without defining the word.`,
    });
  }

  if (restates(word.mnemonic, word.definition)) {
    issues.push({
      field: "mnemonic",
      message: `The mnemonic for "${word.word}" is just the definition again. Give a real memory hook: a sound-alike, a root breakdown, or a vivid image.`,
    });
  }

  return issues;
}

/** Split a batch into the cards that passed and those that did not. */
export function partitionByQuality(words: readonly VocabWord[]): {
  good: VocabWord[];
  bad: Array<{ word: VocabWord; issues: QualityIssue[] }>;
} {
  const good: VocabWord[] = [];
  const bad: Array<{ word: VocabWord; issues: QualityIssue[] }> = [];
  for (const word of words) {
    const issues = checkWord(word);
    if (issues.length === 0) good.push(word);
    else bad.push({ word, issues });
  }
  return { good, bad };
}

/**
 * Does the definition use the word it is defining?
 *
 * Stem-based, so "abatement" in the definition of "abate" counts — which is
 * the form a model actually reaches for when it is being circular.
 */
function isCircular(definition: string, word: string): boolean {
  const target = stem(word);
  if (!target) return false;
  return normalizeText(definition)
    .split(" ")
    .some((token) => stem(token) === target);
}

/**
 * Does the sentence contain the word, in any inflection?
 *
 * Matched by shared prefix rather than by stem equality, because the stemmer
 * is deliberately conservative and does not always reduce a word and its
 * inflection to the same key: `rebuff` stems to `rebuff` but `rebuffed` to
 * `rebuf`, and `compel` to `compel` but `compelled` to `compell`. Demanding
 * equality reported four perfectly good cards as missing their own word.
 *
 * Leniency is the right direction here. This check exists to catch an example
 * that omits the word *entirely*; a rare false match costs nothing, while a
 * false alarm sends a good card back for regeneration.
 */
function containsWord(sentence: string, word: string): boolean {
  const target = endKey(stem(word));
  if (target.length < 3) return false;

  return normalizeText(sentence)
    .split(" ")
    .some((token) => {
      const candidate = endKey(stem(token));
      if (candidate.length < 3) return false;
      const [shorter, longer] =
        candidate.length <= target.length
          ? [candidate, target]
          : [target, candidate];
      return longer.startsWith(shorter);
    });
}

/**
 * Settle a trailing `y` and `i`, which the stemmer treats as different.
 *
 * `belie` stems to `beli` and `belied` to `bely`: the `-ied → y` rule and the
 * silent-`e` rule pull the same word two ways, and because they differ in the
 * *last* character a shared-prefix test cannot bridge them. That reported a
 * perfectly good card — "Her calm voice belied the panic" — as not containing
 * its own word, and it would do the same for every verb in the `-ie/-ied`
 * family: tie, vie, die, hie.
 *
 * Narrow on purpose. It merges exactly one ending, rather than loosening the
 * prefix rule for everything.
 */
function endKey(stemmed: string): string {
  return stemmed.endsWith("y") ? `${stemmed.slice(0, -1)}i` : stemmed;
}

/**
 * Is this text mostly the definition again?
 *
 * Measured as the share of the *definition* that reappears, not the share of
 * the text that is recycled. The two differ exactly where it matters:
 * "Laconic means using very few words" reproduces the whole definition, but
 * padding it with three extra words drops the other measure below any sensible
 * threshold. Restatement is about what was copied, not how much was added.
 */
function restates(text: string, definition: string): boolean {
  return overlapRatio(definition, text) > RESTATEMENT_THRESHOLD;
}

function countWords(text: string): number {
  const normalized = normalizeText(text);
  return normalized ? normalized.split(" ").length : 0;
}

/**
 * Choosing wrong answers that are worth getting wrong.
 *
 * Random distractors make a quiz trivially passable: if the answer is "to
 * lessen in intensity" and the alternatives are about rivers, birds and
 * furniture, the question tests nothing but reading. Good distractors are
 * **plausible but definitively wrong**.
 *
 * Without embeddings, a scoring heuristic gets most of the way there. The
 * weights below are the design's, and the one that is not negotiable is the
 * synonym penalty: a distractor that is arguably correct makes the quiz feel
 * broken, and that is the fastest way to lose a user's trust in it. Every other
 * weight is a preference; that one is correctness.
 *
 * Pure, and the tie-break randomness is injected, so a test can pin it.
 *
 * See docs/QUIZ-AND-EXAMS.md.
 */

import type { VocabWord, WordProgress } from "@/types";
import { normalizeWord, stem } from "@/lib/stem";

/** How many wrong answers a question needs. */
export const DISTRACTOR_COUNT = 3;

/**
 * The weights, named so a change is a decision rather than a tweak.
 *
 * Positive weights make a candidate more confusable with the answer, which is
 * what makes a question worth asking. Negative ones make it a bad question.
 */
export const WEIGHTS = {
  /** Same part of speech: the single strongest plausibility signal. */
  samePartOfSpeech: 3,
  /** Similar definition length — a conspicuously short option gives itself away. */
  similarLength: 2,
  /** Same month, so the same register and difficulty band. */
  sameMonth: 2,
  /** Shares a first letter: surface confusability. */
  sharesFirstLetter: 1,
  /** Listed as a synonym of the answer. It would be defensible, so never ask. */
  synonym: -5,
  /** The user has never seen it: tests recall of nothing. */
  unseen: -3,
} as const;

/** Definition lengths within this fraction of each other count as similar. */
const LENGTH_TOLERANCE = 0.4;

export interface DistractorContext {
  /** Everything that could serve as a wrong answer. */
  pool: readonly VocabWord[];
  /** What the user has actually studied, for the unseen penalty. */
  progress?: Record<string, WordProgress>;
  /** wordId → month key, for the same-register bonus. */
  monthOf?: Record<string, string>;
  /** Injected so a test can pin the tie-break. */
  random?: () => number;
}

/**
 * Score one candidate as a distractor for `answer`.
 *
 * Exported because the score is the interesting part: a change here should be
 * visible in a test, not buried in a sort.
 */
export function scoreDistractor(
  candidate: VocabWord,
  answer: VocabWord,
  context: Pick<DistractorContext, "progress" | "monthOf"> = {},
): number {
  let score = 0;

  if (samePartOfSpeech(candidate, answer)) score += WEIGHTS.samePartOfSpeech;
  if (similarLength(candidate.definition, answer.definition)) {
    score += WEIGHTS.similarLength;
  }

  const monthOf = context.monthOf ?? {};
  if (monthOf[candidate.id] && monthOf[candidate.id] === monthOf[answer.id]) {
    score += WEIGHTS.sameMonth;
  }

  if (firstLetter(candidate.word) === firstLetter(answer.word)) {
    score += WEIGHTS.sharesFirstLetter;
  }

  if (isSynonym(candidate, answer)) score += WEIGHTS.synonym;

  const seen = context.progress?.[candidate.id];
  if (!seen || seen.timesReviewed === 0) score += WEIGHTS.unseen;

  return score;
}

/**
 * The best wrong answers for a word.
 *
 * Returns fewer than {@link DISTRACTOR_COUNT} only when the pool genuinely
 * cannot supply more — the caller decides whether that is a question worth
 * asking, because silently padding with the answer repeated would be worse.
 */
export function pickDistractors(
  answer: VocabWord,
  context: DistractorContext,
  count = DISTRACTOR_COUNT,
): VocabWord[] {
  const random = context.random ?? Math.random;

  const scored = context.pool
    .filter((candidate) => isUsable(candidate, answer))
    .map((candidate) => ({
      candidate,
      score: scoreDistractor(candidate, answer, context),
      // A random tie-break, so the same word does not produce the same three
      // options every single time it is asked.
      jitter: random(),
    }));

  scored.sort((a, b) => b.score - a.score || a.jitter - b.jitter);
  return scored.slice(0, count).map((entry) => entry.candidate);
}

/**
 * Is this candidate eligible at all?
 *
 * Separate from scoring because these are disqualifications, not preferences:
 * no score should ever rescue them.
 */
function isUsable(candidate: VocabWord, answer: VocabWord): boolean {
  if (candidate.id === answer.id) return false;
  // The same word under two ids — a re-import, or the same word in two months.
  if (stem(candidate.word) === stem(answer.word)) return false;
  // Two words with the same definition make an unanswerable question.
  if (normalizeWord(candidate.definition) === normalizeWord(answer.definition)) {
    return false;
  }
  return Boolean(candidate.word.trim() && candidate.definition.trim());
}

function samePartOfSpeech(a: VocabWord, b: VocabWord): boolean {
  const norm = (part: string) => part.trim().toLowerCase().replace(/\.$/, "");
  return Boolean(norm(a.partOfSpeech)) && norm(a.partOfSpeech) === norm(b.partOfSpeech);
}

function similarLength(a: string, b: string): boolean {
  const longer = Math.max(a.length, b.length);
  if (longer === 0) return true;
  return Math.abs(a.length - b.length) / longer <= LENGTH_TOLERANCE;
}

function firstLetter(word: string): string {
  return normalizeWord(word).charAt(0);
}

/**
 * Is the candidate a synonym of the answer, in either direction?
 *
 * Checked by stem and in both directions, because a list is only as good as
 * whichever card happened to be written more carefully.
 */
function isSynonym(candidate: VocabWord, answer: VocabWord): boolean {
  const candidateStem = stem(candidate.word);
  const answerStem = stem(answer.word);

  const listed = (word: VocabWord) =>
    (word.synonyms ?? []).map((synonym) => stem(synonym));

  return (
    listed(answer).includes(candidateStem) ||
    listed(candidate).includes(answerStem)
  );
}

/**
 * Turning words into questions, and choosing which words to ask about.
 *
 * Two jobs that belong together because they share the same failure: a quiz
 * that samples uniformly will mostly ask about words the user already knows,
 * and a question with careless wrong answers tests reading rather than
 * vocabulary. Both make a test that feels like a formality.
 *
 * Pure, with randomness injected, so the weighting can be asserted rather than
 * hoped for.
 *
 * See docs/QUIZ-AND-EXAMS.md.
 */

import type { QuizQuestion, VocabWord, WordProgress } from "@/types";
import { pickDistractors, type DistractorContext } from "@/lib/distractors";
import { isDue } from "@/lib/sm2";

/** How many questions each periodic test asks. */
export const PERIOD_LENGTH = { daily: 10, weekly: 25, monthly: 50 } as const;

export type TestPeriod = keyof typeof PERIOD_LENGTH;

/** A question needs at least this many options to be worth asking. */
const MIN_OPTIONS = 3;

/**
 * The ease factor a word is treated as having when it has never been rated.
 *
 * SM-2's default is 2.5. Unseen words should be asked about, so they sit at the
 * "needs work" end rather than being treated as mastered.
 */
const DEFAULT_EASE = 2.5;

export interface BuildOptions extends DistractorContext {
  mode: "word-to-def" | "def-to-word" | "mixed";
  random?: () => number;
}

/**
 * One question for one word, or null if the pool cannot support it.
 *
 * Null rather than a question with two options: a question the user can guess
 * by elimination is worse than one question fewer.
 */
export function buildQuestion(
  word: VocabWord,
  options: BuildOptions,
): QuizQuestion | null {
  const random = options.random ?? Math.random;
  const distractors = pickDistractors(word, { ...options, random });
  if (distractors.length < MIN_OPTIONS) return null;

  const mode =
    options.mode === "mixed"
      ? random() < 0.5
        ? "word-to-def"
        : "def-to-word"
      : options.mode;

  const correct = mode === "word-to-def" ? word.definition : word.word;
  const wrong = distractors.map((d) =>
    mode === "word-to-def" ? d.definition : d.word,
  );

  return {
    wordId: word.id,
    mode,
    prompt: mode === "word-to-def" ? word.word : word.definition,
    correct,
    options: shuffle([correct, ...wrong], random),
  };
}

/** Questions for as many of `words` as the pool supports, in order. */
export function buildQuestions(
  words: readonly VocabWord[],
  options: BuildOptions,
): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  for (const word of words) {
    const question = buildQuestion(word, options);
    if (question) questions.push(question);
  }
  return questions;
}

export interface PoolContext {
  /** Everything loaded. */
  all: readonly VocabWord[];
  progress: Record<string, WordProgress>;
  /** Words introduced in the current day, for the daily test. */
  todaysWords?: readonly VocabWord[];
  /** Words introduced in the last seven days, for the weekly test. */
  recentWords?: readonly VocabWord[];
  /** The active month's words, for the monthly test. */
  monthWords?: readonly VocabWord[];
  now?: Date;
  random?: () => number;
}

/**
 * Which words a periodic test should ask about.
 *
 * Due words first — they are what the scheduler says are at risk — then the
 * period's own material, then a sample of everything else **weighted toward low
 * ease factors**. That weighting is the whole point: a uniform sample of a
 * thousand-word corpus mostly asks about words the user knows cold, and a
 * 25-question test that does that is worth less than a 10-question one that
 * does not.
 */
export function poolForPeriod(
  period: TestPeriod,
  context: PoolContext,
): VocabWord[] {
  const now = context.now ?? new Date();
  const random = context.random ?? Math.random;
  const wanted = PERIOD_LENGTH[period];

  const chosen: VocabWord[] = [];
  const taken = new Set<string>();
  const take = (words: readonly VocabWord[]) => {
    for (const word of words) {
      if (chosen.length >= wanted) return;
      if (taken.has(word.id)) continue;
      taken.add(word.id);
      chosen.push(word);
    }
  };

  // 1. Everything the scheduler says is due.
  take(context.all.filter((w) => isDue(context.progress[w.id], now)));

  // 2. The period's own material.
  take(
    period === "daily"
      ? (context.todaysWords ?? [])
      : period === "weekly"
        ? (context.recentWords ?? [])
        : (context.monthWords ?? []),
  );

  // 3. Top up from everything else, hardest first.
  take(byNeed(context.all, context.progress, random));

  return chosen;
}

/**
 * Everything else, ordered by how much work it needs.
 *
 * Low ease factor first, with a jitter so two runs of the same test are not
 * identical. `reps` is folded in as the lapse signal: SM-2 resets it to zero on
 * an "again", so a word with a respectable ease but no consecutive successes
 * behind it is one that keeps slipping.
 */
export function byNeed(
  words: readonly VocabWord[],
  progress: Record<string, WordProgress>,
  random: () => number = Math.random,
): VocabWord[] {
  return [...words]
    .map((word) => {
      const record = progress[word.id];
      const ease = record?.easeFactor ?? DEFAULT_EASE;
      const reps = record?.reps ?? 0;
      // Lower is more in need. Each consecutive success buys a little slack.
      return { word, need: ease + reps * 0.05, jitter: random() };
    })
    .sort((a, b) => a.need - b.need || a.jitter - b.jitter)
    .map((entry) => entry.word);
}

/** Fisher–Yates with an injected source, so options can be pinned in a test. */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

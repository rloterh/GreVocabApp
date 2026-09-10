/**
 * SM-2 spaced-repetition scheduler.
 *
 * A direct implementation of the SuperMemo 2 algorithm (Woźniak, 1990),
 * mapped onto the four Anki-style ratings the flashcard UI already collects.
 *
 * This module is deliberately pure: no store imports, no React, no ambient
 * clock. `schedule()` takes everything it needs and returns everything it
 * changed, so it can be reasoned about — and tested — in isolation.
 *
 * See ROADMAP.md, Phase 2.
 */

import { addDays, toDateKey } from "@/lib/date-utils";
import type { StudyRating, WordProgress } from "@/types";

/** Floor on the ease factor, per the original algorithm. */
export const MIN_EASE_FACTOR = 1.3;

/** Ease factor a word starts at before it has ever been rated. */
export const DEFAULT_EASE_FACTOR = 2.5;

/**
 * SM-2 quality scores (0..5) for each rating.
 *
 * The algorithm treats q < 3 as a failed recall. "again" is the only failure;
 * "hard" is the weakest pass, which is why it still advances the interval
 * (slowly) rather than resetting it.
 */
const QUALITY: Record<StudyRating, number> = {
  again: 0,
  hard: 3,
  good: 4,
  easy: 5,
};

export interface Schedule {
  /** Updated ease factor, never below MIN_EASE_FACTOR. */
  easeFactor: number;
  /** Days until the next review. */
  intervalDays: number;
  /** Consecutive successful repetitions. Resets to 0 on a failed recall. */
  reps: number;
  /** ISO timestamp of the next review, `intervalDays` after `now`. */
  dueAt: string;
}

/**
 * Compute the next review for a card.
 *
 * @param rating       what the user pressed
 * @param priorEF      previous ease factor (DEFAULT_EASE_FACTOR for a new card)
 * @param priorInterval previous interval in days (0 for a new card)
 * @param priorReps    previous successful repetition count (0 for a new card)
 * @param now          injected clock, so callers can schedule deterministically
 */
export function schedule(
  rating: StudyRating,
  priorEF: number = DEFAULT_EASE_FACTOR,
  priorInterval: number = 0,
  priorReps: number = 0,
  now: Date = new Date(),
): Schedule {
  const q = QUALITY[rating];

  // SM-2 adjusts the ease factor on every review, pass or fail.
  const nextEF = Math.max(
    MIN_EASE_FACTOR,
    priorEF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)),
  );

  let reps: number;
  let intervalDays: number;

  if (q < 3) {
    // Failed recall: the card re-enters the learning queue tomorrow, but the
    // ease penalty above persists, so it will climb more slowly next time.
    reps = 0;
    intervalDays = 1;
  } else {
    reps = priorReps + 1;
    if (reps === 1) intervalDays = 1;
    else if (reps === 2) intervalDays = 6;
    else intervalDays = Math.round(priorInterval * nextEF);
    // A rounded interval can stall at its previous value when the ease factor
    // sits near 1.0; never schedule a repeat review for the same day.
    intervalDays = Math.max(1, intervalDays);
  }

  return {
    easeFactor: nextEF,
    intervalDays,
    reps,
    dueAt: addDays(now, intervalDays).toISOString(),
  };
}

/**
 * Read a word's scheduling state, filling in defaults for progress records
 * written before SM-2 existed (or for words never rated on a flashcard).
 */
export function schedulingStateOf(progress: WordProgress | undefined): {
  easeFactor: number;
  intervalDays: number;
  reps: number;
} {
  return {
    easeFactor: progress?.easeFactor ?? DEFAULT_EASE_FACTOR,
    intervalDays: progress?.intervalDays ?? 0,
    reps: progress?.reps ?? 0,
  };
}

/**
 * Is this word due for review?
 *
 * A word with no `dueAt` has never been rated on a flashcard, so it has never
 * been scheduled and is not "due" — it is simply new. Surfacing every unrated
 * word as due would make the due deck a duplicate of "Still learning".
 *
 * Comparison is by calendar day, not by instant: a card scheduled for today at
 * 09:00 is due all day, not only after 09:00.
 */
export function isDue(
  progress: WordProgress | undefined,
  now: Date = new Date(),
): boolean {
  if (!progress?.dueAt) return false;
  return toDateKey(new Date(progress.dueAt)) <= toDateKey(now);
}

/** Count how many of `wordIds` are currently due. */
export function countDue(
  wordIds: string[],
  words: Record<string, WordProgress>,
  now: Date = new Date(),
): number {
  return wordIds.reduce((n, id) => n + (isDue(words[id], now) ? 1 : 0), 0);
}

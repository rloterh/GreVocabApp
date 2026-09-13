import type { VocabWord, WordProgress } from "@/types";
import { dayKey, seedFor } from "@/lib/order";
import { isDue } from "@/lib/sm2";

/**
 * One word to put in front of someone before they have decided to study.
 *
 * Two properties do all the work:
 *
 * **It is stable for the day.** A word that changed on every render, or every
 * navigation back to the dashboard, would be decoration rather than a prompt —
 * there would be nothing to come back to and nothing to remember having seen.
 * The seed is the date, so it holds until midnight and then moves on.
 *
 * **It prefers what is already slipping.** Drawn first from what the scheduler
 * says is due, because the most useful word to be reminded of is the one about
 * to be forgotten. Only when nothing is due does it reach for something
 * unmastered, and only when everything is mastered does it reach for anything
 * at all — at which point it is a pleasant souvenir rather than a study aid,
 * and the caller is told which of those it got.
 *
 * Pure: the date is passed in, never read from a clock here.
 */

export type WordOfTheDayReason = "due" | "unmastered" | "review";

export interface WordOfTheDay {
  word: VocabWord;
  /** Why this word, so the UI can say something true about it. */
  reason: WordOfTheDayReason;
}

export function wordOfTheDay(
  words: readonly VocabWord[],
  progress: Readonly<Record<string, WordProgress>>,
  now: Date,
  /** Salt, so two tracks do not surface the same position on the same day. */
  salt = "",
): WordOfTheDay | null {
  if (words.length === 0) return null;

  const due = words.filter((w) => {
    const record = progress[w.id];
    return record ? isDue(record, now) : false;
  });
  const unmastered = words.filter((w) => !progress[w.id]?.mastered);

  const [pool, reason]: [readonly VocabWord[], WordOfTheDayReason] =
    due.length > 0
      ? [due, "due"]
      : unmastered.length > 0
        ? [unmastered, "unmastered"]
        : [words, "review"];

  // Indexed by a seeded hash rather than shuffled: picking one of n does not
  // need a permutation of n, and this runs on every dashboard render.
  const index = seedFor([dayKey(now), salt, reason]) % pool.length;
  return { word: pool[index], reason };
}

/** One line saying why this word, in the second person. */
export function wordOfTheDayNote(reason: WordOfTheDayReason): string {
  switch (reason) {
    case "due":
      return "Due for review — the scheduler says this one is starting to fade.";
    case "unmastered":
      return "Not mastered yet. Nothing is due, so here is one still open.";
    case "review":
      return "You have mastered everything loaded. Here is one worth keeping.";
  }
}

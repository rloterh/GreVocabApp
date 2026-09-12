import type { DayActivity } from "@/types";
import { addDays, differenceInDays, parseISO, toDateKey } from "./date-utils";

/** Calculate current & longest streak from activity records */
export function calculateStreaks(activities: Record<string, DayActivity>): {
  current: number;
  longest: number;
} {
  const activeDates = Object.values(activities)
    .filter((a) => a.wordsReviewed > 0 || a.wordsMastered > 0)
    .map((a) => parseISO(a.date))
    .sort((a, b) => a.getTime() - b.getTime());

  if (activeDates.length === 0) return { current: 0, longest: 0 };

  // Longest streak: walk through and count consecutive runs
  let longest = 1;
  let run = 1;
  for (let i = 1; i < activeDates.length; i++) {
    const diff = differenceInDays(activeDates[i]!, activeDates[i - 1]!);
    if (diff === 1) {
      run++;
      longest = Math.max(longest, run);
    } else if (diff > 1) {
      run = 1;
    }
    // diff === 0 shouldn't happen with keyed activity but handle safely
  }

  // Current streak: from today (or most recent day), walk back
  const today = new Date();
  const todayKey = toDateKey(today);
  const yesterdayKey = toDateKey(addDays(today, -1));

  // The current streak counts only if the last activity is today or yesterday
  const lastActive = activeDates[activeDates.length - 1]!;
  const lastKey = toDateKey(lastActive);

  if (lastKey !== todayKey && lastKey !== yesterdayKey) {
    return { current: 0, longest };
  }

  let current = 1;
  for (let i = activeDates.length - 2; i >= 0; i--) {
    const diff = differenceInDays(activeDates[i + 1]!, activeDates[i]!);
    if (diff === 1) current++;
    else break;
  }

  return { current, longest };
}

/** Build heatmap data for a year: date -> intensity 0..4 */
export function buildHeatmap(
  activities: Record<string, DayActivity>,
  year: number,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const a of Object.values(activities)) {
    if (!a.date.startsWith(String(year))) continue;
    const activity = a.wordsMastered * 2 + a.quizzesTaken + a.sentencesWritten;
    // Intensity 0..4
    const intensity =
      activity === 0
        ? 0
        : activity <= 2
          ? 1
          : activity <= 4
            ? 2
            : activity <= 7
              ? 3
              : 4;
    map.set(a.date, intensity);
  }
  return map;
}

/**
 * One missed day a week does not end a streak.
 *
 * Streaks motivate right up until one breaks, at which point they become a
 * reason to stop: the number that was pulling you back is suddenly zero, and
 * the day you missed is the day you quit. That failure mode is well documented
 * and it is the opposite of what a study app wants.
 *
 * A freeze removes the cliff without adding anything to chase. It is not a
 * reward, it cannot be earned or spent faster by studying more, and it is not
 * displayed as a score. Per ADR 0006 this is the single gamification exception,
 * allowed because it *corrects an existing mechanic* rather than adding a new
 * one — there is no XP here, and there will not be.
 *
 * One per seven days of the streak being counted, spent automatically on the
 * gap that would otherwise have ended it.
 */
export const FREEZE_EVERY_DAYS = 7;

export interface StreakWithFreezes {
  current: number;
  longest: number;
  /** Missed days the streak survived. Shown as reassurance, never as a score. */
  frozen: number;
  /** Freezes still available at the current length. */
  freezesLeft: number;
}

/**
 * Streaks, allowing one missed day per week of the run.
 *
 * The budget is earned by the length of the run being counted, so a long
 * streak is more forgiving than a new one — which matches how it feels to
 * break one.
 */
export function calculateStreaksWithFreezes(
  activities: Record<string, DayActivity>,
  now: Date = new Date(),
): StreakWithFreezes {
  const base = calculateStreaks(activities);

  const activeDates = Object.values(activities)
    .filter((a) => a.wordsReviewed > 0 || a.wordsMastered > 0)
    .map((a) => parseISO(a.date))
    .sort((a, b) => a.getTime() - b.getTime());

  if (activeDates.length === 0) {
    return { ...base, frozen: 0, freezesLeft: 0 };
  }

  const last = activeDates[activeDates.length - 1]!;
  const sinceLast = differenceInDays(now, last);

  // More than one missed day at the end is a break, not a gap: a freeze covers
  // a day you missed, not a week you were away.
  if (sinceLast > 2) return { ...base, frozen: 0, freezesLeft: 0 };

  // An unstudied day today is not yet a missed day; the user still has time.
  const pending = sinceLast === 2 ? 1 : 0;

  /**
   * The budget has to come from the whole run, not from the part after the
   * gap.
   *
   * Walking backwards, the span is only known *after* deciding whether to
   * spend — so a first pass that judged each gap against the span so far could
   * never cover an early gap in a long streak, which is exactly the case a
   * freeze is for. Instead: walk optimistically, see how long the run turns
   * out to be, and re-walk if that span did not earn the freezes spent.
   * Each pass can only shorten the span, so this settles.
   */
  let allowance = activeDates.length; // optimistic first pass
  let span = 1;
  let frozen = 0;
  for (let pass = 0; pass < 8; pass++) {
    ({ span, frozen } = walkBack(activeDates, allowance, pending));
    const earned = budgetFor(span);
    if (frozen <= earned) break;
    allowance = earned;
  }

  const current = span;
  return {
    current,
    longest: Math.max(base.longest, current),
    frozen,
    freezesLeft: Math.max(0, budgetFor(span) - frozen),
  };
}

/** One backwards walk, spending at most `allowance` freezes. */
function walkBack(
  activeDates: Date[],
  allowance: number,
  pending: number,
): { span: number; frozen: number } {
  let span = 1 + pending;
  let frozen = pending > 0 && allowance > 0 ? 1 : 0;

  for (let i = activeDates.length - 2; i >= 0; i--) {
    const gap = differenceInDays(activeDates[i + 1]!, activeDates[i]!);
    if (gap === 1) {
      span++;
      continue;
    }
    if (gap === 2 && frozen < allowance) {
      // One missed day, covered.
      frozen++;
      span += 2;
      continue;
    }
    break;
  }
  return { span, frozen };
}

/** One freeze per week of the run counted so far. */
function budgetFor(spanDays: number): number {
  return Math.floor(spanDays / FREEZE_EVERY_DAYS);
}

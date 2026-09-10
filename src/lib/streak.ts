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

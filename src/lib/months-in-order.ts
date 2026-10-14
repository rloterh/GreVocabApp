import type { Schedule, Track, VocabMonth } from "@/types";
import { positionOf } from "@/lib/schedule";

/**
 * A track's months, in the order the app means by "in order".
 *
 * Pure, and exported, because the answer depends on three pieces of state —
 * the months, the active track and that track's schedule — and every consumer
 * that forgets one of them goes stale without saying so. `useVocabStore`'s
 * `getMonthsForTrack` is a thin wrapper over this, and `useAllMonths` is the
 * React-side wrapper; both exist so no component has to remember the list.
 *
 * That is not hypothetical. Eight memos used to call the store getter and list
 * only `months` as a dependency. `setActiveTrack` does not touch `months`, so
 * switching from GRE to SAT left Search, Progress, Exam and the rest reading
 * the notebook the user had just closed — a SAT word was "not found" while SAT
 * was open. Taking state as arguments makes the dependency impossible to
 * forget, and visible to the exhaustive-deps lint.
 */
export function monthsInTeachingOrder(
  months: Record<string, VocabMonth>,
  schedules: Partial<Record<Track, Schedule>>,
  track: Track,
): VocabMonth[] {
  const inTrack = Object.values(months)
    .filter((m) => m.track === track)
    .sort((a, b) => a.ordinal - b.ordinal);

  const schedule = schedules[track];
  if (!schedule) return inTrack;

  // Teaching order. Ordinal order and teaching order are the same thing until
  // the user reorders, and then they are not.
  return [...inTrack].sort(
    (a, b) => positionOf(schedule, a.ordinal) - positionOf(schedule, b.ordinal),
  );
}

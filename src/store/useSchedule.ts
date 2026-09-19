import { useMemo } from "react";
import type { Schedule, Track } from "@/types";
import { calendarMonthOfDate, scheduleOrDefault } from "@/lib/schedule";
import { useVocabStore } from "@/store/useVocabStore";

/**
 * A track's schedule, as a reactive value that is safe in a component.
 *
 * Use this instead of `useVocabStore((s) => s.getSchedule())`. That reads
 * correctly but cannot be a selector: a track with no stored schedule gets one
 * synthesised on the spot, so the getter returns a *new object every call*.
 * Zustand compares snapshots by identity, sees a change on every render, and
 * re-renders forever — React stops it with "Maximum update depth exceeded",
 * and with no error boundary that blanked the whole window.
 *
 * It only struck users whose tracks had no stored schedule, which is anyone
 * carrying state from before schedules existed, and it took Settings and
 * Archive down with it. Both now use this.
 *
 * The same shape as `useAllMonths`: subscribe to the pieces of state the
 * answer depends on, hand them to a pure function, and memoise the result so
 * the reference is stable between renders.
 */
export function useSchedule(track?: Track): Schedule {
  const months = useVocabStore((s) => s.months);
  const schedules = useVocabStore((s) => s.schedules);
  const activeTrack = useVocabStore((s) => s.activeTrack);
  const which = track ?? activeTrack;

  return useMemo(
    // The start month only matters for a track that has never been scheduled,
    // and holding it steady for the life of the memo is the point: recomputing
    // it per render is what made the object unstable in the first place.
    () => scheduleOrDefault(months, schedules, which, calendarMonthOfDate(new Date())),
    [months, schedules, which],
  );
}

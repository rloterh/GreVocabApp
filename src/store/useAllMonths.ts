import { useMemo } from "react";
import type { VocabMonth } from "@/types";
import { monthsInTeachingOrder } from "@/lib/months-in-order";
import { useVocabStore } from "@/store/useVocabStore";

/**
 * The active track's months, in teaching order, as a reactive value.
 *
 * Use this instead of calling `getAllMonths()` inside a `useMemo`. The store
 * getter reads `months`, `activeTrack` and `schedules` through `get()`, so a
 * memo that calls it has three dependencies and no way for React — or the
 * exhaustive-deps lint — to know it. Every call site listed `months` alone,
 * which is the one of the three that a track switch does *not* change, so
 * switching track left eight screens showing the previous notebook.
 *
 * Subscribing to the three pieces here and passing them to a pure function
 * makes the dependency array honest: callers depend on the returned array,
 * which is a dependency the lint can see and check.
 *
 * The result is memoised, so it is a stable reference between renders and safe
 * to put in a dependency array.
 */
export function useAllMonths(): VocabMonth[] {
  const months = useVocabStore((s) => s.months);
  const schedules = useVocabStore((s) => s.schedules);
  const activeTrack = useVocabStore((s) => s.activeTrack);

  return useMemo(
    () => monthsInTeachingOrder(months, schedules, activeTrack),
    [months, schedules, activeTrack],
  );
}

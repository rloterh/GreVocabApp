import { useMemo } from "react";
import type { Track } from "@/types";
import { dayKey } from "@/lib/order";
import { dailyResults, recentDates } from "@/lib/games/daily-record";
import type { GameRoundSummary } from "@/lib/games/types";
import { useProgressStore } from "@/store/useProgressStore";

/**
 * The last fourteen days of Daily Rounds on a track, oldest first, and today's.
 *
 * A pure function plus a memoised hook, never a store getter in a selector:
 * this builds an object, and a selector that returns a new object every
 * render is the blank-window bug CONTINUING.md principle 6 describes.
 */
export function useDailyResults(track: Track): {
  today: string;
  dates: string[];
  results: Record<string, GameRoundSummary | undefined>;
} {
  const rounds = useProgressStore((s) => s.gameRounds);
  const today = dayKey(new Date());
  return useMemo(() => {
    const dates = recentDates(new Date(`${today}T12:00:00`), 14);
    return { today, dates, results: dailyResults(rounds, track, dates) };
  }, [rounds, track, today]);
}

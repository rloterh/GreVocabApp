/**
 * The record of Daily Rounds played: which days, and each day's result.
 *
 * Separate from daily.ts on purpose. The Dashboard shows today's result, and
 * daily.ts imports the catalogue and every builder with it; this imports
 * nothing but types.
 */

import type { Track } from "@/types";
import type { GameRoundSummary } from "./types";

/** The `n` calendar days ending today, oldest first, as "YYYY-MM-DD". */
export function recentDates(today: Date, n = 14): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
  }
  return out;
}

/**
 * Each date's result on a track: its first completed, non-practice round.
 * History is newest first, so the first attempt of a day is the last match.
 */
export function dailyResults(
  rounds: readonly GameRoundSummary[],
  track: Track,
  dates: readonly string[],
): Record<string, GameRoundSummary | undefined> {
  const wanted = new Set(dates);
  const out: Record<string, GameRoundSummary | undefined> = {};
  for (const r of rounds) {
    if (r.game !== "daily" || r.track !== track || !r.daily || r.practice) continue;
    if (wanted.has(r.daily)) out[r.daily] = r;
  }
  return out;
}

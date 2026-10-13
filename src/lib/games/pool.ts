/**
 * Which words a tier draws from.
 *
 * The four difficulty tiers are thirds of a track's months, in teaching order,
 * because the corpus was generated on a difficulty curve across them. The
 * boundaries are computed from whatever the library index lists, never
 * hard-coded: the tracks have different lengths, and a regeneration moves
 * them.
 *
 * See docs/GAMES.md §5.
 */

import type { VocabWord, WordProgress } from "@/types";
import type { Tier } from "./types";

/** How many studied words "My words" needs before it is worth a round. */
export const MINE_MINIMUM = 40;

/** The months a difficulty tier covers, as corpus ordinals. */
export function tierOrdinals(
  ordinals: readonly number[],
  tier: Exclude<Tier, "mine">,
): number[] {
  const sorted = [...new Set(ordinals)].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return [];
  const first = Math.ceil(n / 3);
  const second = Math.ceil((2 * n) / 3);
  switch (tier) {
    case "warmup":
      return sorted.slice(0, first);
    case "standard":
      return sorted.slice(first, Math.max(first + 1, second));
    case "hard":
    case "fiendish":
      return sorted.slice(Math.min(second, n - 1));
  }
}

/** Words the user has actually reviewed at least once. */
export function studiedWords(
  words: readonly VocabWord[],
  progress: Record<string, WordProgress>,
): VocabWord[] {
  return words.filter((w) => (progress[w.id]?.timesReviewed ?? 0) > 0);
}

/**
 * The Daily Round: ten mixed questions, the same for everyone on a given day
 * and track, so a result means something when it is shared.
 *
 * Seeded by the local date and the track, like the word of the day
 * (src/lib/word-of-the-day.ts): it holds until local midnight, then changes.
 * Built from the Standard tier, from four games whose questions take about
 * the same time to read — Match Up and Spell It play differently enough that
 * mixing them in would make the round two games at once.
 *
 * The first completed attempt of the day is the result; replays are recorded
 * as practice. That is the whole mechanic. It is a record of days played, not
 * a second streak, and missing a day shows nothing red
 * (docs/adr/0016-games-are-rounds-not-progression.md).
 *
 * See docs/GAMES.md §4.9.
 */

import type { Track, VocabWord } from "@/types";
import { seedFor, seededRandom, seededShuffle } from "@/lib/order";
import { stem } from "@/lib/stem";
import { GAMES } from "./catalogue";
import type { RelationIndex } from "./relations";
import { balancedTruths } from "./round";
import type { GameId, GameQuestion, GameRound } from "./types";

// The record of days played lives in its own module, so the Dashboard can
// show it without pulling every question builder into its bundle.
export { dailyResults, recentDates } from "./daily-record";

export const DAILY_TIER = "standard" as const;
/** One limit for the whole round: long enough to read a statement or a sentence. */
export const DAILY_SECONDS = 15;
export const DAILY_LENGTH = 10;

/** Which game each slot of a round comes from, before shuffling. */
const MIX: readonly GameId[] = [
  "closest", "closest", "closest",
  "fact", "fact", "fact",
  "opposites", "opposites",
  "gap", "gap",
];

/** "2026-10-14" + "gre" → the seed every player of that track shares today. */
export function dailySeed(date: string, track: Track): number {
  return seedFor(["daily", date, track]);
}

export interface DailyInput {
  date: string;
  track: Track;
  prompts: readonly VocabWord[];
  pool: readonly VocabWord[];
  monthOf: Record<string, string>;
  index: RelationIndex;
}

/**
 * Today's round. Deterministic for a date, a track and a corpus: two players
 * on the same version get the same ten questions in the same order.
 */
export function buildDailyRound(input: DailyInput): GameRound {
  const seed = dailySeed(input.date, input.track);
  const random = seededRandom(seed);
  const slots = seededShuffle(MIX, seed);
  const truths = balancedTruths(slots.filter((g) => g === "fact").length, seed);
  let factSlot = 0;

  const order = seededShuffle(input.prompts, seed + 1);
  const asked = new Set<string>();
  const questions: GameQuestion[] = [];

  for (const game of slots) {
    const definition = GAMES[game];
    const truth = game === "fact" ? truths[factSlot++] : undefined;
    for (const word of order) {
      const key = stem(word.word);
      if (asked.has(key) || !definition.eligible(word)) continue;
      const q = definition.build(word, {
        pool: input.pool,
        index: input.index,
        monthOf: input.monthOf,
        tier: DAILY_TIER,
        random,
        truth,
        exclude: asked,
      });
      if (!q) continue;
      asked.add(key);
      // Each question carries its own game's instruction, since the round's
      // name says nothing about what to do with this one.
      if (q.kind === "choice" || q.kind === "verdict") q.instruction = definition.instruction;
      questions.push(q);
      break;
    }
  }

  return {
    game: "daily",
    track: input.track,
    tier: DAILY_TIER,
    seed,
    questions,
    shortfall: DAILY_LENGTH - questions.length,
  };
}

/**
 * The text a player can paste anywhere: no link, no score to beat, nothing
 * that needs a server — one line, and a row of squares for right and wrong.
 */
export function dailyShareText(
  date: string,
  trackLabel: string,
  results: readonly boolean[],
): string {
  const d = new Date(`${date}T12:00:00`);
  const when = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const right = results.filter(Boolean).length;
  return `Lexicon Daily · ${when} · ${trackLabel}\n${right}/${results.length} ${results
    .map((r) => (r ? "🟩" : "⬜"))
    .join("")}`;
}

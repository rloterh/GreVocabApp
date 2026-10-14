/**
 * Points, and what counts as a new best.
 *
 * The formula is stated in words on every rules card, so it has to stay
 * simple enough to state: up to the tier's base per question, and the faster
 * you answer the more of it you keep. No negative marking — it teaches
 * hesitation, not vocabulary (docs/QUIZ-AND-EXAMS.md).
 *
 * See docs/GAMES.md §6.4–6.5.
 */

import type { Track } from "@/types";
import type { GameBest, GameId, GameTimer, RoundTiming, Tier } from "./types";

/** Most a question can be worth on each tier. */
export const BASE_POINTS: Record<Tier, number> = {
  warmup: 100,
  standard: 150,
  hard: 200,
  fiendish: 300,
  mine: 150,
};

/** An instant answer keeps all of it; one in the last instant keeps this much. */
export const FLOOR = 0.4;

/** Untimed play keeps this share of the base for every right answer. */
export const UNTIMED_SHARE = 0.6;

/** Fiendish questions get this much less time. */
export const FIENDISH_TIME = 0.7;

function roundTo10(value: number): number {
  return Math.round(value / 10) * 10;
}

/**
 * The time limit for one question, or null when untimed.
 *
 * Relaxed doubles it rather than adding a fixed amount, so a long statement
 * and a single word both get proportionally more.
 */
export function questionLimitMs(
  baseSeconds: number,
  tier: Tier,
  timer: GameTimer,
): number | null {
  if (timer === "off") return null;
  const tierScale = tier === "fiendish" ? FIENDISH_TIME : 1;
  const timerScale = timer === "relaxed" ? 2 : 1;
  return Math.round(baseSeconds * 1000 * tierScale * timerScale);
}

/** Points for one answer. */
export function pointsFor(
  correct: boolean,
  tier: Tier,
  msUsed: number,
  limitMs: number | null,
): number {
  if (!correct) return 0;
  const base = BASE_POINTS[tier];
  if (limitMs === null) return roundTo10(base * UNTIMED_SHARE);
  const remaining = Math.max(0, limitMs - msUsed) / limitMs;
  return roundTo10(base * (FLOOR + (1 - FLOOR) * remaining));
}

/**
 * Match Up: a share of the base per pair made, and — only for a finished
 * board — a time bonus of up to one base. A wrong pairing costs time (the
 * session's PENALTY), never points.
 */
export const PAIR_SHARE = 0.4;

export function matchPoints(
  tier: Tier,
  matched: number,
  msUsed: number,
  limitMs: number | null,
  complete: boolean,
): number {
  const base = BASE_POINTS[tier];
  const pairs = matched * roundTo10(base * PAIR_SHARE);
  if (!complete || limitMs === null) return pairs;
  const remaining = Math.max(0, limitMs - msUsed) / limitMs;
  return pairs + roundTo10(base * remaining);
}

/** The most a round of `questions` could score — for copy, not for display. */
export function maxPointsPerQuestion(tier: Tier, timer: GameTimer): number {
  return timer === "off"
    ? roundTo10(BASE_POINTS[tier] * UNTIMED_SHARE)
    : BASE_POINTS[tier];
}

/** The key a best is stored under: `closest:gre:standard:timed`. */
export function bestKey(
  game: GameId,
  track: Track,
  tier: Tier,
  timing: RoundTiming,
): string {
  return `${game}:${track}:${tier}:${timing}`;
}

export type BestOutcome =
  /** No earlier round on this key: nothing has been beaten yet. */
  | { kind: "first" }
  | { kind: "new-best"; previous: number }
  | { kind: "not-best"; best: number };

/**
 * How a finished round compares with the best before it.
 *
 * A first round is not a "new best". Praising 2 of 10 because nothing came
 * before it teaches the user to ignore the message.
 */
export function compareWithBest(
  previous: GameBest | undefined,
  score: number,
): BestOutcome {
  if (!previous) return { kind: "first" };
  if (score > previous.score) return { kind: "new-best", previous: previous.score };
  return { kind: "not-best", best: previous.score };
}

/** Should this round replace the stored best? Ties keep the older one. */
export function beatsBest(previous: GameBest | undefined, score: number): boolean {
  return !previous || score > previous.score;
}

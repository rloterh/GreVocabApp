/**
 * The games' domain types.
 *
 * Games are rounds, not a progression system — see
 * docs/adr/0016-games-are-rounds-not-progression.md. Nothing in here
 * accumulates across rounds except a best per game, and nothing here is a
 * `WordProgress`: a game never writes the scheduler on its own.
 *
 * Design: docs/GAMES.md.
 */

import type { Track } from "@/types";

/** Every game the catalogue can build. Grows one id per shipped game. */
export type GameId = "closest";

/**
 * Where a round's words come from.
 *
 * The first four are thirds of the active track's corpus, read without being
 * loaded; `mine` is what the user has actually studied.
 */
export type Tier = "warmup" | "standard" | "hard" | "fiendish" | "mine";

export const TIERS: readonly Tier[] = ["warmup", "standard", "hard", "fiendish", "mine"];

/** The preference: how much time a question gets. */
export type GameTimer = "standard" | "relaxed" | "off";

/** What a finished round was played under — a best is kept per value. */
export type RoundTiming = "timed" | "relaxed" | "untimed";

export function timingOf(timer: GameTimer): RoundTiming {
  return timer === "standard" ? "timed" : timer === "relaxed" ? "relaxed" : "untimed";
}

/** Shown after an answer and in the review list. */
export interface Explanation {
  definition: string;
  example: string;
}

/** A word and four options, one of them right. */
export interface ChoiceQuestion {
  kind: "choice";
  wordId: string;
  /** The headword being asked about, shown as the prompt. */
  word: string;
  partOfSpeech: string;
  options: string[];
  /** Index into `options`. */
  answer: number;
  explain: Explanation;
}

/** A union so later games add a member rather than widening this one. */
export type GameQuestion = ChoiceQuestion;

export interface GameRound {
  game: GameId;
  track: Track;
  tier: Tier;
  seed: number;
  questions: GameQuestion[];
  /** How many questions the pool could not supply. 0 for a full round. */
  shortfall: number;
}

/** One answer as the session recorded it. */
export interface AnswerRecord {
  /** Index chosen, or null when time ran out. */
  chosen: number | null;
  correct: boolean;
  timedOut: boolean;
  /** Time spent on the question, paused time excluded. */
  ms: number;
  points: number;
}

/**
 * A finished round, as history keeps it.
 *
 * Word ids, never text: the history shares a localStorage budget with the
 * user's whole notebook.
 */
export interface GameRoundSummary {
  id: string;
  game: GameId;
  track: Track;
  tier: Tier;
  timing: RoundTiming;
  /** "2026-10-13" for a Daily Round, null otherwise. */
  daily: string | null;
  finishedAt: string;
  score: number;
  right: number;
  total: number;
  ms: number;
  missed: string[];
}

/** The best round on one game · track · tier · timing. */
export interface GameBest {
  score: number;
  right: number;
  total: number;
  at: string;
  roundId: string;
}

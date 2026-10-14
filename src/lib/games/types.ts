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
export type GameId =
  | "closest"
  | "fact"
  | "opposites"
  | "gap"
  | "odd"
  | "match"
  | "spell"
  | "unscramble"
  | "picture"
  | "daily";

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
  /**
   * Why, in one sentence, when the answer needs more than the definition:
   * the word a false statement borrowed from, or the root two words share.
   */
  note?: string;
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
  /**
   * Fill the Gap: the word's example with the word blanked out. Shown in
   * place of the headword, which would give the answer away.
   */
  sentence?: string;
  /**
   * Opposites: the option planted as a trap — a synonym of the word, the
   * classic mistake in an antonym question — so review can name it.
   */
  trap?: number;
  /**
   * Odd One Out: the headword is one of the options, so the stage shows this
   * question instead of the word.
   */
  ask?: string;
  /** Set when the round mixes games (the Daily Round): this question's own instruction. */
  instruction?: string;
}

/**
 * Match Up: one board of words and what they mean, paired by the player.
 *
 * A board is one question to the session. Its pairs are resolved one at a
 * time (`MATCH` events); the board resolves when all are paired or the time
 * runs out, and pairs made before a time-out still score. `options` and
 * `answer` are unused — present only so code that handles every question the
 * same way need not special-case this one.
 */
export interface MatchQuestion {
  kind: "match";
  /** The first pair's word, for anything that wants one id per question. */
  wordId: string;
  word: string;
  partOfSpeech: string;
  pairs: Array<{ wordId: string; word: string; match: string }>;
  /** What the right-hand column holds: synonyms on Warm-up, definitions otherwise. */
  matchKind: "synonym" | "definition";
  options: string[];
  answer: number;
  explain: Explanation;
}

/**
 * Spell It: hear the word, read its definition, type it.
 *
 * `options` is the answer alone and `answer` is 0: the stage dispatches 0
 * for a correct spelling and -1 for anything else, so the session scores it
 * like any other question.
 */
export interface SpellQuestion {
  kind: "spell";
  wordId: string;
  /** The answer, as it must be typed (lower case unless the word is a name). */
  word: string;
  partOfSpeech: string;
  definition: string;
  options: string[];
  answer: number;
  explain: Explanation;
}

/**
 * Fact or Fiction: a statement about a word, judged true or false.
 *
 * Shaped like a choice — `options` is always ["Fact", "Fiction"] and
 * `answer` is 0 for a true statement — so the session, scoring and review
 * treat every game the same way.
 */
export interface VerdictQuestion {
  kind: "verdict";
  wordId: string;
  word: string;
  partOfSpeech: string;
  statement: string;
  options: string[];
  answer: number;
  explain: Explanation;
  /** Set when the round mixes games (the Daily Round). */
  instruction?: string;
}

/** A union so a new game adds a member rather than widening one. */
/**
 * Unscramble: a definition and the word's letters, shuffled. `options` is the
 * answer alone and `answer` is 0, as in Spell It: the stage dispatches 0 when
 * the tiles spell the word, and lets the clock run out otherwise.
 */
export interface TilesQuestion {
  kind: "tiles";
  wordId: string;
  word: string;
  partOfSpeech: string;
  definition: string;
  tiles: string[];
  options: string[];
  answer: number;
  explain: Explanation;
}

/**
 * Picture It: a diagram with one part highlighted, and four names for it —
 * the answer and three other parts of the same object.
 */
export interface PictureQuestion {
  kind: "picture";
  /** "pic-house-lintel": never a notebook word, so never a progress record. */
  wordId: string;
  word: string;
  partOfSpeech: string;
  diagram: string;
  part: string;
  options: string[];
  answer: number;
  explain: Explanation;
}

export type GameQuestion =
  | ChoiceQuestion
  | VerdictQuestion
  | MatchQuestion
  | SpellQuestion
  | TilesQuestion
  | PictureQuestion;

export const VERDICT_OPTIONS = ["Fact", "Fiction"] as const;

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
  /** Spell It: what was typed, so review can show where it went wrong. */
  typed?: string;
  /** Spell It: a hint was used, which halves the points. */
  hinted?: boolean;
  /** Match Up: how many pairs were made, of `pairs.length`. */
  matched?: number;
  /** Match Up: the words left unpaired, for review and history. */
  missedIds?: string[];
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
  /**
   * A Daily Round replayed after the day's result was set. Kept in history,
   * never counted as the day's result.
   */
  practice?: boolean;
  /**
   * A Daily Round's right and wrong, in the order played: "1101111011". Kept
   * so a result shared later shows the real pattern, not a reconstruction.
   */
  pattern?: string;
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

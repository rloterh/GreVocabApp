/**
 * The play state machine for one round.
 *
 * A reducer with the clock passed in, for two reasons.
 *
 * **Time is measured, never counted.** A backgrounded tab throttles timers to
 * about once a minute; a clock that counted ticks would then give a user nine
 * minutes for a ten-second question. Every duration here is a difference of
 * timestamps.
 *
 * **Tests drive it without fake timers.** `user-event` hangs under
 * `vi.useFakeTimers()` (CONTINUING.md), so the component tests inject `now`
 * instead.
 *
 * ```
 *  ready ─START─▶ entering ─ARM─▶ asking ─ANSWER/TICK past limit─▶ feedback ─NEXT─▶ entering … finished
 *                     └──────────────┴──────── PAUSE ⇄ RESUME ──────────┘
 * ```
 *
 * The clock starts on ARM — when the question has finished entering — not on
 * NEXT, so full motion and reduced motion get the same time to answer.
 *
 * Match Up resolves a board pair by pair: each MATCH records one, a wrong
 * pairing is a PENALTY of time, and the board resolves when every pair is
 * made — or on a time-out, when the pairs already made still score.
 *
 * See docs/GAMES.md §6.3.
 */

import { matchPoints, pointsFor } from "./scoring";
import type { AnswerRecord, GameQuestion, MatchQuestion, Tier } from "./types";

export type Phase = "ready" | "entering" | "asking" | "feedback" | "paused" | "finished";

export interface SessionState {
  phase: Phase;
  /** The phase a pause interrupted, so resume returns to it. */
  resumeTo: Exclude<Phase, "paused" | "ready" | "finished"> | null;
  index: number;
  total: number;
  tier: Tier;
  /** Per-question limit, or null when untimed. */
  limitMs: number | null;
  /** When the current stretch of asking began; null when the clock is stopped. */
  runningSince: number | null;
  /** Time already spent on this question before the current stretch. */
  spentMs: number;
  answers: AnswerRecord[];
  score: number;
  /** Wall-clock start and end of the round, for history. */
  startedAt: number | null;
  finishedAt: number | null;
  /** Time spent paused, so the round's duration excludes it. */
  pausedMs: number;
  pausedAt: number | null;
  /** Match Up: word ids paired so far on the current board. */
  matchedIds: string[];
}

export type SessionEvent =
  | { type: "START"; now: number }
  | { type: "ARM"; now: number }
  | { type: "ANSWER"; choice: number; now: number; typed?: string; hinted?: boolean }
  | { type: "MATCH"; wordId: string; now: number }
  | { type: "PENALTY"; ms: number }
  | { type: "TICK"; now: number }
  | { type: "PAUSE"; now: number }
  | { type: "RESUME"; now: number }
  | { type: "NEXT"; now: number };

export function createSession(
  questions: readonly GameQuestion[],
  tier: Tier,
  limitMs: number | null,
): SessionState {
  return {
    phase: "ready",
    resumeTo: null,
    index: 0,
    total: questions.length,
    tier,
    limitMs,
    runningSince: null,
    spentMs: 0,
    answers: [],
    score: 0,
    startedAt: null,
    finishedAt: null,
    pausedMs: 0,
    pausedAt: null,
    matchedIds: [],
  };
}

/** Time spent on the current question so far. */
export function elapsedMs(state: SessionState, now: number): number {
  const running = state.runningSince === null ? 0 : Math.max(0, now - state.runningSince);
  return state.spentMs + running;
}

/** Time left on the current question, or null when untimed. */
export function remainingMs(state: SessionState, now: number): number | null {
  if (state.limitMs === null) return null;
  if (state.phase === "entering") return state.limitMs;
  return Math.max(0, state.limitMs - elapsedMs(state, now));
}

/**
 * The reducer.
 *
 * `questions` is passed rather than stored because it never changes during a
 * round, and keeping it out of the state keeps every transition cheap to copy.
 */
export function reduce(
  state: SessionState,
  event: SessionEvent,
  questions: readonly GameQuestion[],
): SessionState {
  switch (event.type) {
    case "START":
      if (state.phase !== "ready") return state;
      if (state.total === 0) return { ...state, phase: "finished", finishedAt: event.now };
      return { ...state, phase: "entering", startedAt: event.now };

    case "ARM":
      if (state.phase !== "entering") return state;
      return { ...state, phase: "asking", runningSince: event.now, spentMs: 0 };

    case "ANSWER": {
      if (state.phase !== "asking") return state;
      const question = questions[state.index];
      if (!question) return state;
      const ms = elapsedMs(state, event.now);
      // An answer that lands after the limit is a time-out, however the event
      // was delayed in reaching us.
      if (state.limitMs !== null && ms >= state.limitMs) {
        return record(state, null, false, true, state.limitMs, { typed: event.typed });
      }
      const correct = event.choice === question.answer;
      return record(state, event.choice, correct, false, ms, {
        typed: event.typed,
        hinted: event.hinted,
      });
    }

    case "MATCH": {
      if (state.phase !== "asking") return state;
      const question = questions[state.index];
      if (!question || question.kind !== "match") return state;
      if (state.matchedIds.includes(event.wordId)) return state;
      if (!question.pairs.some((p) => p.wordId === event.wordId)) return state;
      const ms = elapsedMs(state, event.now);
      if (state.limitMs !== null && ms >= state.limitMs) return timeOut(state, question);
      const matchedIds = [...state.matchedIds, event.wordId];
      if (matchedIds.length < question.pairs.length) return { ...state, matchedIds };
      return recordBoard({ ...state, matchedIds }, question, ms, false);
    }

    case "PENALTY": {
      // A wrong pairing costs time, not points: the clock is the only thing
      // Match Up takes away. Only while asking — a penalty cannot land on a
      // board that has already resolved, or while paused.
      if (state.phase !== "asking" || event.ms <= 0) return state;
      return { ...state, spentMs: state.spentMs + event.ms };
    }

    case "TICK": {
      if (state.phase !== "asking" || state.limitMs === null) return state;
      if (elapsedMs(state, event.now) < state.limitMs) return state;
      const question = questions[state.index];
      if (question?.kind === "match") return timeOut(state, question);
      return record(state, null, false, true, state.limitMs);
    }

    case "PAUSE": {
      if (state.phase !== "entering" && state.phase !== "asking" && state.phase !== "feedback") {
        return state;
      }
      return {
        ...state,
        resumeTo: state.phase,
        phase: "paused",
        spentMs: elapsedMs(state, event.now),
        runningSince: null,
        pausedAt: event.now,
      };
    }

    case "RESUME": {
      if (state.phase !== "paused" || !state.resumeTo) return state;
      const pausedFor = state.pausedAt === null ? 0 : Math.max(0, event.now - state.pausedAt);
      return {
        ...state,
        phase: state.resumeTo,
        resumeTo: null,
        runningSince: state.resumeTo === "asking" ? event.now : null,
        pausedMs: state.pausedMs + pausedFor,
        pausedAt: null,
      };
    }

    case "NEXT": {
      if (state.phase !== "feedback") return state;
      const index = state.index + 1;
      if (index >= state.total) {
        return { ...state, phase: "finished", finishedAt: event.now };
      }
      return { ...state, phase: "entering", index, spentMs: 0, runningSince: null, matchedIds: [] };
    }
  }
}

function record(
  state: SessionState,
  chosen: number | null,
  correct: boolean,
  timedOut: boolean,
  ms: number,
  extra: { typed?: string; hinted?: boolean } = {},
): SessionState {
  const full = pointsFor(correct, state.tier, ms, state.limitMs);
  // A hint halves the question, rounded to the same tens as everything else.
  const points = extra.hinted ? Math.round(full / 20) * 10 : full;
  const answer: AnswerRecord = { chosen, correct, timedOut, ms, points };
  if (extra.typed !== undefined) answer.typed = extra.typed;
  if (extra.hinted) answer.hinted = true;
  return {
    ...state,
    phase: "feedback",
    runningSince: null,
    spentMs: ms,
    answers: [...state.answers, answer],
    score: state.score + points,
  };
}

/** A Match Up board is over: every pair made, or the time ran out. */
function recordBoard(
  state: SessionState,
  question: MatchQuestion,
  ms: number,
  timedOut: boolean,
): SessionState {
  const matched = state.matchedIds.length;
  const correct = matched === question.pairs.length;
  const points = matchPoints(state.tier, matched, ms, state.limitMs, correct);
  const missedIds = question.pairs.map((p) => p.wordId).filter((id) => !state.matchedIds.includes(id));
  return {
    ...state,
    phase: "feedback",
    runningSince: null,
    spentMs: ms,
    answers: [...state.answers, { chosen: null, correct, timedOut, ms, points, matched, missedIds }],
    score: state.score + points,
  };
}

function timeOut(state: SessionState, question: MatchQuestion): SessionState {
  return recordBoard(state, question, state.limitMs ?? 0, true);
}

/**
 * How a round went, counted the way the player reads it: pairs for a Match Up
 * board, one per question everywhere else.
 */
export function tally(
  questions: readonly GameQuestion[],
  answers: readonly AnswerRecord[],
): { right: number; total: number } {
  let right = 0;
  let total = 0;
  questions.forEach((q, i) => {
    const a = answers[i];
    if (q.kind === "match") {
      total += q.pairs.length;
      right += a?.matched ?? 0;
    } else {
      total += 1;
      right += a?.correct ? 1 : 0;
    }
  });
  return { right, total };
}

/** Every word the round missed — each unpaired word of a board counts. */
export function missedWordIds(
  questions: readonly GameQuestion[],
  answers: readonly AnswerRecord[],
): string[] {
  return questions.flatMap((q, i) => {
    const a = answers[i];
    if (q.kind === "match") return a?.missedIds ?? q.pairs.map((p) => p.wordId);
    return a?.correct ? [] : [q.wordId];
  });
}

/** How long the round took, paused time excluded. */
export function roundDurationMs(state: SessionState): number {
  if (state.startedAt === null || state.finishedAt === null) return 0;
  return Math.max(0, state.finishedAt - state.startedAt - state.pausedMs);
}

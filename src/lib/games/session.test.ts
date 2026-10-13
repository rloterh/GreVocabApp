import { describe, expect, it } from "vitest";
import { createSession, elapsedMs, reduce, remainingMs, roundDurationMs, type SessionEvent, type SessionState } from "./session";
import { BASE_POINTS, bestKey, beatsBest, compareWithBest, pointsFor, questionLimitMs } from "./scoring";
import { tierOrdinals } from "./pool";
import type { ChoiceQuestion } from "./types";

const q = (answer: number): ChoiceQuestion => ({
  kind: "choice",
  wordId: `gre-w${answer}`,
  word: "w",
  partOfSpeech: "noun",
  options: ["a", "b", "c", "d"],
  answer,
  explain: { definition: "", example: "" },
});

const QUESTIONS = [q(0), q(1), q(2)];
const LIMIT = 10_000;

function run(events: SessionEvent[], start: SessionState = createSession(QUESTIONS, "standard", LIMIT)) {
  return events.reduce((s, e) => reduce(s, e, QUESTIONS), start);
}

describe("session", () => {
  it("does not start the clock until the question has entered", () => {
    const s = run([{ type: "START", now: 0 }]);
    expect(s.phase).toBe("entering");
    expect(remainingMs(s, 5_000)).toBe(LIMIT);
  });

  it("scores a right answer by time used", () => {
    const s = run([
      { type: "START", now: 0 },
      { type: "ARM", now: 300 },
      { type: "ANSWER", choice: 0, now: 300 + 2_500 },
    ]);
    expect(s.phase).toBe("feedback");
    expect(s.answers[0]).toMatchObject({ correct: true, timedOut: false, ms: 2_500 });
    expect(s.score).toBe(pointsFor(true, "standard", 2_500, LIMIT));
  });

  it("times out on a tick past the limit, and ignores a late answer", () => {
    const s = run([
      { type: "START", now: 0 },
      { type: "ARM", now: 0 },
      { type: "TICK", now: LIMIT },
      { type: "ANSWER", choice: 0, now: LIMIT + 10 },
    ]);
    expect(s.answers).toHaveLength(1);
    expect(s.answers[0]).toMatchObject({ chosen: null, timedOut: true, points: 0 });
  });

  it("treats an answer that arrives after the limit as a time-out", () => {
    // A throttled background tab can deliver the click before any tick.
    const s = run([
      { type: "START", now: 0 },
      { type: "ARM", now: 0 },
      { type: "ANSWER", choice: 0, now: LIMIT + 60_000 },
    ]);
    expect(s.answers[0]).toMatchObject({ timedOut: true, correct: false });
  });

  it("stops the clock while paused, however long the pause", () => {
    const s = run([
      { type: "START", now: 0 },
      { type: "ARM", now: 0 },
      { type: "PAUSE", now: 4_000 },
      { type: "TICK", now: 600_000 },
      { type: "RESUME", now: 600_000 },
    ]);
    expect(s.phase).toBe("asking");
    expect(elapsedMs(s, 600_000)).toBe(4_000);
    expect(remainingMs(s, 601_000)).toBe(LIMIT - 5_000);
  });

  it("ignores a second answer to the same question", () => {
    const s = run([
      { type: "START", now: 0 },
      { type: "ARM", now: 0 },
      { type: "ANSWER", choice: 0, now: 1_000 },
      { type: "ANSWER", choice: 1, now: 1_100 },
    ]);
    expect(s.answers).toHaveLength(1);
  });

  it("resumes into the phase it paused from", () => {
    const fromFeedback = run([
      { type: "START", now: 0 },
      { type: "ARM", now: 0 },
      { type: "ANSWER", choice: 3, now: 1_000 },
      { type: "PAUSE", now: 2_000 },
      { type: "RESUME", now: 9_000 },
    ]);
    expect(fromFeedback.phase).toBe("feedback");
    const fromEntering = run([{ type: "START", now: 0 }, { type: "PAUSE", now: 10 }, { type: "RESUME", now: 20 }]);
    expect(fromEntering.phase).toBe("entering");
  });

  it("finishes after the last question and excludes paused time from the duration", () => {
    const events: SessionEvent[] = [{ type: "START", now: 0 }];
    let t = 0;
    for (let i = 0; i < QUESTIONS.length; i++) {
      events.push({ type: "ARM", now: (t += 100) }, { type: "ANSWER", choice: i, now: (t += 1_000) });
      if (i === 0) events.push({ type: "PAUSE", now: (t += 10) }, { type: "RESUME", now: (t += 50_000) });
      events.push({ type: "NEXT", now: (t += 100) });
    }
    const s = run(events);
    expect(s.phase).toBe("finished");
    expect(s.answers.every((a) => a.correct)).toBe(true);
    expect(roundDurationMs(s)).toBe(t - 50_000);
  });

  it("never times out an untimed round", () => {
    const untimed = createSession(QUESTIONS, "standard", null);
    const s = run([{ type: "START", now: 0 }, { type: "ARM", now: 0 }, { type: "TICK", now: 10 ** 9 }], untimed);
    expect(s.phase).toBe("asking");
    expect(remainingMs(s, 10 ** 9)).toBeNull();
  });

  it("finishes at once when there are no questions", () => {
    const empty = createSession([], "standard", LIMIT);
    expect(reduce(empty, { type: "START", now: 0 }, []).phase).toBe("finished");
  });
});

describe("scoring", () => {
  it.each([
    [0, 150],
    [5_000, 110],
    [10_000, 60],
  ])("a right answer after %ims on Standard is worth %i", (ms, points) => {
    expect(pointsFor(true, "standard", ms, 10_000)).toBe(points);
  });

  it("gives nothing for a wrong answer — and never less than nothing", () => {
    expect(pointsFor(false, "fiendish", 0, 7_000)).toBe(0);
  });

  it("scores untimed play at a flat share of the base", () => {
    expect(pointsFor(true, "hard", 99_999, null)).toBe(120);
  });

  it("is worth more on harder tiers", () => {
    expect(BASE_POINTS.fiendish).toBeGreaterThan(BASE_POINTS.hard);
    expect(BASE_POINTS.hard).toBeGreaterThan(BASE_POINTS.standard);
    expect(BASE_POINTS.standard).toBeGreaterThan(BASE_POINTS.warmup);
  });

  it("gives Fiendish less time and Relaxed double", () => {
    expect(questionLimitMs(10, "standard", "standard")).toBe(10_000);
    expect(questionLimitMs(10, "fiendish", "standard")).toBe(7_000);
    expect(questionLimitMs(10, "standard", "relaxed")).toBe(20_000);
    expect(questionLimitMs(10, "standard", "off")).toBeNull();
  });

  it("does not call a first round a new best", () => {
    expect(compareWithBest(undefined, 620)).toEqual({ kind: "first" });
    const prev = { score: 1_000, right: 6, total: 10, at: "", roundId: "r" };
    expect(compareWithBest(prev, 1_200)).toEqual({ kind: "new-best", previous: 1_000 });
    expect(compareWithBest(prev, 1_000)).toEqual({ kind: "not-best", best: 1_000 });
    expect(beatsBest(prev, 1_000)).toBe(false);
    expect(beatsBest(undefined, 0)).toBe(true);
  });

  it("keys bests by game, track, tier and timing", () => {
    expect(bestKey("closest", "gre", "standard", "timed")).toBe("closest:gre:standard:timed");
  });
});

describe("tierOrdinals", () => {
  const thirtyEight = Array.from({ length: 38 }, (_, i) => i + 1);

  it("splits a track into thirds in teaching order, covering every month once", () => {
    const warm = tierOrdinals(thirtyEight, "warmup");
    const standard = tierOrdinals(thirtyEight, "standard");
    const hard = tierOrdinals(thirtyEight, "hard");
    expect(warm[0]).toBe(1);
    expect(hard.at(-1)).toBe(38);
    expect([...warm, ...standard, ...hard]).toEqual(thirtyEight);
    expect(tierOrdinals(thirtyEight, "fiendish")).toEqual(hard);
  });

  it("copes with unsorted, duplicated and tiny inputs", () => {
    expect(tierOrdinals([3, 1, 2, 2], "warmup")).toEqual([1]);
    expect(tierOrdinals([1], "hard")).toEqual([1]);
    expect(tierOrdinals([], "standard")).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  countDue,
  DEFAULT_EASE_FACTOR,
  isDue,
  MIN_EASE_FACTOR,
  schedule,
} from "@/lib/sm2";
import type { WordProgress } from "@/types";

/** A fixed clock, so every scheduling assertion is deterministic. */
const T0 = new Date("2026-09-10T09:00:00.000Z");

/** Minimal progress record; tests override only what they care about. */
function progress(over: Partial<WordProgress> = {}): WordProgress {
  return {
    wordId: "w",
    monthKey: "2026-09",
    mastered: false,
    timesReviewed: 0,
    quizAttempts: 0,
    quizCorrect: 0,
    lastReviewed: null,
    masteredAt: null,
    ...over,
  };
}

describe("schedule — interval progression", () => {
  it("sends a first successful review out one day", () => {
    const r = schedule("good", DEFAULT_EASE_FACTOR, 0, 0, T0);
    expect(r.intervalDays).toBe(1);
    expect(r.reps).toBe(1);
  });

  it("sends a second successful review out six days", () => {
    const r = schedule("good", DEFAULT_EASE_FACTOR, 1, 1, T0);
    expect(r.intervalDays).toBe(6);
    expect(r.reps).toBe(2);
  });

  it("multiplies by the ease factor from the third review on", () => {
    // round(6 * 2.5) = 15
    expect(schedule("good", 2.5, 6, 2, T0).intervalDays).toBe(15);
  });

  it("never schedules a repeat review for the same day", () => {
    // A low ease factor and a one-day interval would otherwise round to 1 or 0.
    expect(
      schedule("hard", MIN_EASE_FACTOR, 1, 5, T0).intervalDays,
    ).toBeGreaterThanOrEqual(1);
  });
});

describe("schedule — ease factor", () => {
  it("leaves ease unchanged for a plain Good (q=4 is EF-neutral)", () => {
    expect(schedule("good", 2.5, 0, 0, T0).easeFactor).toBeCloseTo(2.5, 5);
  });

  it("raises ease for Easy and lowers it for Hard", () => {
    expect(schedule("easy", 2.5, 6, 2, T0).easeFactor).toBeGreaterThan(2.5);
    expect(schedule("hard", 2.5, 6, 2, T0).easeFactor).toBeLessThan(2.5);
  });

  it("floors ease at 1.3 no matter how often the word is failed", () => {
    let ef = DEFAULT_EASE_FACTOR;
    for (let i = 0; i < 20; i++) ef = schedule("again", ef, 10, 5, T0).easeFactor;
    expect(ef).toBe(MIN_EASE_FACTOR);
  });
});

describe("schedule — ratings", () => {
  it("treats Hard as a pass that still advances", () => {
    const r = schedule("hard", 2.5, 6, 2, T0);
    expect(r.reps).toBe(3);
    expect(r.intervalDays).toBeGreaterThan(1);
  });

  it("resets reps and interval on Again, but keeps the ease penalty", () => {
    const r = schedule("again", 2.5, 30, 6, T0);
    expect(r.reps).toBe(0);
    expect(r.intervalDays).toBe(1);
    expect(r.easeFactor).toBeLessThan(2.5);
  });
});

describe("schedule — due date", () => {
  it("puts dueAt intervalDays after now", () => {
    const r = schedule("good", 2.5, 6, 2, T0);
    const days = Math.round((Date.parse(r.dueAt) - T0.getTime()) / 86_400_000);
    expect(days).toBe(r.intervalDays);
  });
});

describe("isDue", () => {
  const dueAt = schedule("good", 2.5, 6, 2, T0).dueAt;
  const due = new Date(dueAt);
  const atLocal = (d: Date, h: number, m: number) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);

  it("is not due before its date", () => {
    expect(isDue(progress({ dueAt }), T0)).toBe(false);
    expect(isDue(progress({ dueAt }), new Date(due.getTime() - 86_400_000))).toBe(
      false,
    );
  });

  it("is due all of the day it falls on, not only after the hour", () => {
    expect(isDue(progress({ dueAt }), atLocal(due, 0, 1))).toBe(true);
    expect(isDue(progress({ dueAt }), atLocal(due, 23, 59))).toBe(true);
  });

  it("stays due once overdue", () => {
    expect(
      isDue(progress({ dueAt }), new Date(due.getTime() + 5 * 86_400_000)),
    ).toBe(true);
  });

  it("treats a never-scheduled word as not due, so the due deck is not a copy of Still learning", () => {
    expect(isDue(undefined, T0)).toBe(false);
    expect(isDue(progress(), T0)).toBe(false);
  });
});

describe("countDue", () => {
  it("counts overdue and today, and ignores future, unscheduled and missing words", () => {
    const words: Record<string, WordProgress> = {
      overdue: progress({ dueAt: "2026-09-09T00:00:00.000Z" }),
      today: progress({ dueAt: "2026-09-10T23:00:00.000Z" }),
      future: progress({ dueAt: "2026-09-30T00:00:00.000Z" }),
      unscheduled: progress(),
    };
    expect(
      countDue(["overdue", "today", "future", "unscheduled", "absent"], words, T0),
    ).toBe(2);
  });
});

describe("definition of done — five days of study", () => {
  it("spaces consecutive Good reviews exponentially", () => {
    let st = { ef: DEFAULT_EASE_FACTOR, iv: 0, reps: 0 };
    const intervals: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = schedule("good", st.ef, st.iv, st.reps, T0);
      st = { ef: r.easeFactor, iv: r.intervalDays, reps: r.reps };
      intervals.push(r.intervalDays);
    }
    expect(intervals).toEqual([1, 6, 15, 38, 95, 238]);
  });

  it("spaces Easy faster than Good", () => {
    const run = (rating: "good" | "easy") => {
      let st = { ef: DEFAULT_EASE_FACTOR, iv: 0, reps: 0 };
      let last = 0;
      for (let i = 0; i < 6; i++) {
        const r = schedule(rating, st.ef, st.iv, st.reps, T0);
        st = { ef: r.easeFactor, iv: r.intervalDays, reps: r.reps };
        last = r.intervalDays;
      }
      return last;
    };
    expect(run("easy")).toBeGreaterThan(run("good"));
  });
});

/**
 * Streaks, and the one thing that stops a broken one from ending the habit.
 *
 * See docs/adr/0006-fun-vs-no-gamification.md: the freeze is the single
 * sanctioned exception to the no-gamification rule, because it corrects an
 * existing mechanic rather than adding a new one.
 */

import { describe, expect, it } from "vitest";
import {
  calculateStreaks,
  calculateStreaksWithFreezes,
  FREEZE_EVERY_DAYS,
} from "@/lib/streak";
import type { DayActivity } from "@/types";

describe("streak freezes", () => {
  /** Activity on the given ISO dates, and nothing else. */
  function on(dates: string[]): Record<string, DayActivity> {
    return Object.fromEntries(
      dates.map((date) => [
        date,
        { date, wordsReviewed: 3, wordsMastered: 0, quizzesTaken: 0, sentencesWritten: 0 },
      ]),
    );
  }

  /** `days` consecutive dates ending on the day before `endExclusive`. */
  function run(endExclusive: string, days: number): string[] {
    const end = new Date(endExclusive + "T00:00:00");
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(end);
      d.setDate(d.getDate() - (days - i));
      return d.toISOString().slice(0, 10);
    });
  }

  const NOW = new Date("2026-09-20T12:00:00");

  it("matches the plain streak when nothing was missed", () => {
    const dates = run("2026-09-21", 10);
    const result = calculateStreaksWithFreezes(on(dates), NOW);
    expect(result.current).toBe(10);
    expect(result.frozen).toBe(0);
  });

  it("survives one missed day once the run has earned a freeze", () => {
    // Ten days, with one gap in the middle. Without a freeze the streak would
    // be whatever is left after the break — the cliff this removes.
    const dates = run("2026-09-21", 12).filter((d) => d !== "2026-09-14");
    const result = calculateStreaksWithFreezes(on(dates), NOW);
    expect(result.frozen).toBe(1);
    expect(result.current).toBeGreaterThan(
      calculateStreaks(on(dates)).current,
    );
  });

  it("does not cover a gap the run has not earned", () => {
    // Three days then a gap: too short to have banked a freeze.
    const dates = ["2026-09-16", "2026-09-17", "2026-09-19", "2026-09-20"];
    const result = calculateStreaksWithFreezes(on(dates), NOW);
    expect(result.frozen).toBe(0);
  });

  it("will not cover a week away", () => {
    // A freeze covers a day you missed, not a holiday. Otherwise the streak
    // stops meaning anything.
    const dates = run("2026-09-05", 30);
    const result = calculateStreaksWithFreezes(on(dates), NOW);
    expect(result.current).toBe(0);
    expect(result.frozen).toBe(0);
  });

  it("earns one freeze per week of the run", () => {
    expect(FREEZE_EVERY_DAYS).toBe(7);
    const dates = run("2026-09-21", 21);
    const result = calculateStreaksWithFreezes(on(dates), NOW);
    // 21 days banked, none spent.
    expect(result.freezesLeft).toBe(3);
  });

  it("spends from the budget rather than freezing indefinitely", () => {
    // Two gaps in a fortnight: the second must not be free.
    const dates = run("2026-09-21", 14).filter(
      (d) => d !== "2026-09-16" && d !== "2026-09-12",
    );
    const result = calculateStreaksWithFreezes(on(dates), NOW);
    expect(result.frozen).toBeLessThanOrEqual(2);
  });

  it("is empty for no activity at all", () => {
    expect(calculateStreaksWithFreezes({}, NOW)).toEqual({
      current: 0,
      longest: 0,
      frozen: 0,
      freezesLeft: 0,
    });
  });

  it("never reports a longest shorter than the plain calculation", () => {
    const dates = run("2026-09-21", 9);
    const plain = calculateStreaks(on(dates));
    const withFreezes = calculateStreaksWithFreezes(on(dates), NOW);
    expect(withFreezes.longest).toBeGreaterThanOrEqual(plain.longest);
  });

  it("treats today as still open rather than already missed", () => {
    // Studied yesterday, not yet today: the streak stands. Telling someone
    // their streak broke at 09:00 because they have not studied yet would be
    // the most discouraging possible reading of the data.
    const dates = run("2026-09-20", 10);
    const result = calculateStreaksWithFreezes(on(dates), NOW);
    expect(result.current).toBeGreaterThanOrEqual(10);
  });

  it("adds nothing to chase", () => {
    // ADR 0006: this corrects an existing mechanic, it does not add a score.
    // The shape is the guard — no points, no level, no multiplier.
    const result = calculateStreaksWithFreezes(on(run("2026-09-21", 10)), NOW);
    expect(Object.keys(result).sort()).toEqual([
      "current",
      "freezesLeft",
      "frozen",
      "longest",
    ]);
  });
});

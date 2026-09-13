import { describe, expect, it } from "vitest";
import type { Schedule, Track, VocabMonth } from "@/types";
import { monthsInTeachingOrder } from "./months-in-order";

const month = (track: Track, ordinal: number): VocabMonth => ({
  track,
  ordinal,
  title: `${track} ${ordinal}`,
  days: [],
});

const schedule = (track: Track, order: number[]): Schedule => ({
  track,
  startMonth: "2026-01",
  order,
  shuffleSeed: null,
});

const record = (...months: VocabMonth[]): Record<string, VocabMonth> =>
  Object.fromEntries(months.map((m) => [`${m.track}/${m.ordinal}`, m]));

const titles = (months: VocabMonth[]) => months.map((m) => m.title);

describe("monthsInTeachingOrder", () => {
  it("returns only the requested track", () => {
    const months = record(month("gre", 1), month("sat", 1), month("gre", 2));
    expect(titles(monthsInTeachingOrder(months, {}, "gre"))).toEqual([
      "gre 1",
      "gre 2",
    ]);
    expect(titles(monthsInTeachingOrder(months, {}, "sat"))).toEqual(["sat 1"]);
  });

  it("falls back to ordinal order when the track has no schedule", () => {
    const months = record(month("gre", 3), month("gre", 1), month("gre", 2));
    expect(titles(monthsInTeachingOrder(months, {}, "gre"))).toEqual([
      "gre 1",
      "gre 2",
      "gre 3",
    ]);
  });

  it("follows the schedule when there is one", () => {
    const months = record(month("gre", 1), month("gre", 2), month("gre", 3));
    // Teaching order and ordinal order are the same thing until the user
    // reorders, so the test has to reorder to say anything.
    expect(
      titles(monthsInTeachingOrder(months, { gre: schedule("gre", [3, 1, 2]) }, "gre")),
    ).toEqual(["gre 3", "gre 1", "gre 2"]);
  });

  it("uses each track's own schedule, not the other's", () => {
    const months = record(
      month("gre", 1),
      month("gre", 2),
      month("sat", 1),
      month("sat", 2),
    );
    const schedules = {
      gre: schedule("gre", [2, 1]),
      sat: schedule("sat", [1, 2]),
    };
    expect(titles(monthsInTeachingOrder(months, schedules, "gre"))).toEqual([
      "gre 2",
      "gre 1",
    ]);
    expect(titles(monthsInTeachingOrder(months, schedules, "sat"))).toEqual([
      "sat 1",
      "sat 2",
    ]);
  });

  it("is empty for a track with nothing loaded", () => {
    expect(monthsInTeachingOrder(record(month("gre", 1)), {}, "sat")).toEqual([]);
  });

  it("does not mutate the input", () => {
    const months = record(month("gre", 2), month("gre", 1));
    const before = Object.keys(months);
    monthsInTeachingOrder(months, {}, "gre");
    expect(Object.keys(months)).toEqual(before);
  });
});

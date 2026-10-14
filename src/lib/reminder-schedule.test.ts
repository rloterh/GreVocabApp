import { describe, expect, it } from "vitest";
import { REMINDER_ID, nextOccurrence, reminderPayload } from "./reminder-schedule";

/**
 * Only the pure parts are unit-testable here — everything else is a call into
 * the OS scheduler, and mocking that would assert that the mock was called
 * rather than that a reminder arrives. That part is verified by running the
 * app: see CONTINUING.md.
 */
describe("nextOccurrence", () => {
  const at = (h: number, m: number) => new Date(2027, 2, 1, h, m, 30, 250);

  it("is today when the time is still ahead", () => {
    const next = nextOccurrence("19:00", at(9, 0))!;
    expect(next.getDate()).toBe(1);
    expect(next.getHours()).toBe(19);
    expect(next.getMinutes()).toBe(0);
  });

  it("is tomorrow when the time has passed", () => {
    const next = nextOccurrence("07:30", at(9, 0))!;
    expect(next.getDate()).toBe(2);
    expect(next.getHours()).toBe(7);
  });

  it("is tomorrow when the time is exactly now", () => {
    // Scheduling for the instant that has just arrived is scheduling for the
    // past by the time the OS sees it.
    const next = nextOccurrence("09:00", at(9, 0))!;
    expect(next.getDate()).toBe(2);
  });

  it("zeroes seconds and milliseconds", () => {
    // Inherited from `now`, they would make a 19:00 reminder arrive at
    // 19:00:30 — and a repeating alarm drift a little further each day.
    const next = nextOccurrence("19:00", at(9, 0))!;
    expect(next.getSeconds()).toBe(0);
    expect(next.getMilliseconds()).toBe(0);
  });

  it("crosses a month boundary", () => {
    const next = nextOccurrence("07:00", new Date(2027, 2, 31, 22, 0))!;
    expect(next.getMonth()).toBe(3);
    expect(next.getDate()).toBe(1);
  });

  it("accepts a single-digit hour", () => {
    expect(nextOccurrence("7:30", at(9, 0))?.getHours()).toBe(7);
  });

  it.each(["", "nonsense", "25:00", "12:60", "12", "12:5"])(
    "rejects %o",
    (bad) => {
      expect(nextOccurrence(bad, at(9, 0))).toBeNull();
    },
  );
});

/**
 * The payload shape is worth pinning down because getting it wrong fails
 * quietly: the OS accepts a malformed-but-valid schedule and arms the wrong
 * alarm, which nothing short of `dumpsys alarm` on a device will tell you.
 * That is how the first version shipped a reminder repeating every two
 * minutes.
 */
describe("reminderPayload", () => {
  it("schedules a calendar pattern, not an instant", () => {
    const payload = reminderPayload("19:00");
    // `{ at: { date, repeating } }` is the trap: Android derives the repeat
    // interval from `date - now`, so the reminder repeats at whatever the
    // distance to the first firing happened to be.
    expect(payload?.schedule).toEqual({
      interval: {
        interval: { hour: 19, minute: 0, second: 0 },
        allowWhileIdle: true,
      },
    });
  });

  it("pins seconds to zero", () => {
    // Left unset, the pattern matches any second of the minute and the OS
    // re-arms once a second for the whole minute.
    const schedule = reminderPayload("07:30")?.schedule as {
      interval: { interval: Record<string, number> };
    };
    expect(schedule.interval.interval.second).toBe(0);
  });

  it("names its own small icon", () => {
    // Without this the plugin falls back to Android's generic info glyph, and
    // silently — a wrong name looks exactly like no change.
    expect(reminderPayload("19:00")?.icon).toBe("ic_stat_lexicon");
  });

  it("reuses one id, so rescheduling replaces", () => {
    expect(reminderPayload("07:30")?.id).toBe(REMINDER_ID);
    expect(reminderPayload("19:00")?.id).toBe(REMINDER_ID);
  });

  it("carries a body that will still be true when it fires", () => {
    // Scheduled hours ahead, so it cannot name a count of due words.
    expect(String(reminderPayload("19:00")?.body)).not.toMatch(/\d/);
  });

  it.each(["", "nonsense", "25:00", "12:60"])("rejects %o", (bad) => {
    expect(reminderPayload(bad)).toBeNull();
  });
});

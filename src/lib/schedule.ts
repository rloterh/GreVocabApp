import type { Schedule, Track, VocabMonth } from "@/types";
import { seedFor, seededShuffle } from "@/lib/order";

/**
 * When a user starts, and what they study when.
 *
 * The corpus has no calendar in it — month one is month one (ADR 0012). This
 * module is the *only* place that turns a teaching position into a date, and
 * the only place that turns a date back into one. Everything else asks it.
 *
 * Pure. No clock is read here; callers pass the date they mean.
 *
 * See docs/SCHEDULE.md.
 */

/** "2027-03" — a calendar month, as opposed to a teaching position. */
export type CalendarMonth = string;

/**
 * A position in `order` with nothing studied in it.
 *
 * No ordinal is ever 0, so this cannot be confused with a real month. It
 * exists because a user migrating from calendar-keyed content may have gaps —
 * April and September with nothing between — and a schedule that closed those
 * gaps would move their work without telling them.
 */
export const GAP = 0;

export const CALENDAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isCalendarMonth(value: unknown): value is CalendarMonth {
  return typeof value === "string" && CALENDAR_MONTH_RE.test(value);
}

/** The calendar month a Date falls in. */
export function calendarMonthOfDate(date: Date): CalendarMonth {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Calendar-month arithmetic on the string, not on a Date.
 *
 * Going through `Date` here would be a bug waiting to happen: adding a month
 * to 31 January lands on 3 March in every JavaScript engine, and a schedule
 * that skips February is not a schedule.
 */
export function addCalendarMonths(
  month: CalendarMonth,
  delta: number,
): CalendarMonth {
  const [yearText, monthText] = month.split("-");
  const total = Number(yearText) * 12 + (Number(monthText) - 1) + delta;
  const year = Math.floor(total / 12);
  const index = total - year * 12;
  return `${String(year).padStart(4, "0")}-${String(index + 1).padStart(2, "0")}`;
}

/** Whole months from `a` to `b`. Negative when `b` is earlier. */
export function calendarMonthsBetween(
  a: CalendarMonth,
  b: CalendarMonth,
): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

// --- Building a schedule -----------------------------------------------------

/**
 * The schedule a user gets if they accept both defaults: start today, months
 * in the order they were taught.
 */
export function identitySchedule(
  track: Track,
  startMonth: CalendarMonth,
  ordinals: readonly number[],
): Schedule {
  return {
    track,
    startMonth,
    order: [...ordinals].sort((a, b) => a - b),
    shuffleSeed: null,
  };
}

/**
 * A schedule with the months in a seeded random order.
 *
 * Note what this does *not* do: it does not move a single word. Reordering is
 * a permutation of integers, so a user who reshuffles in month 14 keeps every
 * progress record they have.
 */
export function shuffledSchedule(
  track: Track,
  startMonth: CalendarMonth,
  ordinals: readonly number[],
  seed: string,
): Schedule {
  return {
    track,
    startMonth,
    order: seededShuffle(
      [...ordinals].sort((a, b) => a - b),
      seedFor([track, "months", seed]),
    ),
    shuffleSeed: seed,
  };
}

/**
 * Bring a schedule's `order` back in line with the ordinals that actually
 * exist, preserving the relative order of the ones it already knew.
 *
 * Called after loading or removing months. A schedule listing an ordinal with
 * no month behind it would put a gap in the calendar; an ordinal missing from
 * the schedule would make a month unreachable, which is the worse of the two
 * because nothing about the UI would say so.
 */
export function reconcile(
  schedule: Schedule,
  ordinals: readonly number[],
): Schedule {
  const present = new Set(ordinals);
  // `0` is a deliberately empty position — a calendar month the user studies
  // nothing in, which the tracks migration creates for anyone whose months had
  // gaps. Dropping those would slide every later month forward by one.
  const kept = schedule.order.filter((o) => o === GAP || present.has(o));
  const known = new Set(kept);
  const added = [...ordinals].filter((o) => !known.has(o)).sort((a, b) => a - b);
  if (kept.length === schedule.order.length && added.length === 0) {
    return schedule;
  }
  // A schedule the user has not arranged should stay in teaching order, so
  // loading month 3 after month 5 does not teach them in the order they
  // happened to arrive. One the user *has* arranged is theirs: new months go
  // on the end rather than being silently slotted into their sequence.
  const order = isUnarranged(schedule)
    ? [...kept, ...added].sort((a, b) => a - b)
    : [...kept, ...added];
  return { ...schedule, order };
}

/**
 * Has this schedule been left exactly as the corpus teaches it?
 *
 * Gaps count as arrangement: they come from the tracks migration reproducing
 * a user's real calendar, and closing them would move their months.
 */
export function isUnarranged(schedule: Schedule): boolean {
  if (schedule.shuffleSeed !== null) return false;
  let previous = 0;
  for (const ordinal of schedule.order) {
    if (ordinal === GAP || ordinal <= previous) return false;
    previous = ordinal;
  }
  return true;
}

// --- Reading a schedule ------------------------------------------------------

/** Teaching position (0-based) of an ordinal, or -1. */
export function positionOf(schedule: Schedule, ordinal: number): number {
  if (ordinal === GAP) return -1;
  return schedule.order.indexOf(ordinal);
}

/** The calendar month a teaching position falls in. */
export function calendarMonthAt(
  schedule: Schedule,
  position: number,
): CalendarMonth {
  return addCalendarMonths(schedule.startMonth, position);
}

/** The calendar month a given corpus month falls in, or null if unscheduled. */
export function calendarMonthOf(
  schedule: Schedule,
  ordinal: number,
): CalendarMonth | null {
  const position = positionOf(schedule, ordinal);
  return position < 0 ? null : calendarMonthAt(schedule, position);
}

/** Which corpus month is studied in a given calendar month, or null. */
export function ordinalForCalendarMonth(
  schedule: Schedule,
  month: CalendarMonth,
): number | null {
  const position = calendarMonthsBetween(schedule.startMonth, month);
  if (position < 0 || position >= schedule.order.length) return null;
  const ordinal = schedule.order[position];
  return ordinal === GAP ? null : ordinal;
}

/** The calendar month the schedule runs out, inclusive. */
export function lastCalendarMonth(schedule: Schedule): CalendarMonth | null {
  if (schedule.order.length === 0) return null;
  return calendarMonthAt(schedule, schedule.order.length - 1);
}

/**
 * Every scheduled month, in teaching order, paired with its calendar month.
 *
 * The shape the Archive and Calendar want, computed once rather than by each
 * of them calling `calendarMonthOf` in a loop.
 */
export function timeline(
  schedule: Schedule,
): Array<{ ordinal: number; month: CalendarMonth; position: number }> {
  return schedule.order
    .map((ordinal, position) => ({
      ordinal,
      position,
      month: calendarMonthAt(schedule, position),
    }))
    .filter((entry) => entry.ordinal !== GAP);
}

// --- Word redistribution -----------------------------------------------------

/**
 * Deal a track's words back out across its months.
 *
 * This is the one operation that genuinely moves words, and it is safe for
 * exactly one reason: word ids do not contain positions (ADR 0011), so a word
 * that lands in month 22 instead of month 3 keeps its entire history.
 *
 * It discards the difficulty banding the corpus was built with, which is why
 * it is opt-in, seeded, and preceded by a sentence saying so.
 *
 * Day *shapes* are preserved — a month that had 30 days of 3 words still has
 * 30 days of 3 words — so the month a user is part-way through does not
 * change size under them.
 */
export function redistributeWords(
  months: readonly VocabMonth[],
  seed: string,
): VocabMonth[] {
  if (months.length === 0) return [];
  const track = months[0].track;
  const pool = seededShuffle(
    months.flatMap((m) => m.days.flatMap((d) => d.words)),
    seedFor([track, "words", seed]),
  );

  let cursor = 0;
  return months.map((month) => ({
    ...month,
    days: month.days.map((day) => {
      const words = pool.slice(cursor, cursor + day.words.length);
      cursor += day.words.length;
      return { ...day, words };
    }),
  }));
}

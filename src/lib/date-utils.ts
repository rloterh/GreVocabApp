import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  differenceInDays,
  isSameDay,
  addDays,
  subDays,
} from "date-fns";

/** Format a date as "YYYY-MM-DD" */
export function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Format a date as "YYYY-MM" */
export function toMonthKey(date: Date): string {
  return format(date, "yyyy-MM");
}

/** Convert a month key ("2026-04") to a Date on the first of that month */
export function monthKeyToDate(monthKey: string): Date {
  return parseISO(`${monthKey}-01`);
}

/** Human display for month key */
export function formatMonthKey(monthKey: string): string {
  return format(monthKeyToDate(monthKey), "MMMM yyyy");
}

/** All days in a month key, as Date[] */
export function daysInMonth(monthKey: string): Date[] {
  const start = startOfMonth(monthKeyToDate(monthKey));
  const end = endOfMonth(start);
  const days: Date[] = [];
  let cur = start;
  while (cur <= end) {
    days.push(cur);
    cur = addDays(cur, 1);
  }
  return days;
}

export {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  differenceInDays,
  isSameDay,
  addDays,
  subDays,
};

/** Slugify a word for a stable ID */
export function slugify(word: string): string {
  return word
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

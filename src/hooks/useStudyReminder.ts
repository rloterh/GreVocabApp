/**
 * The optional daily study nudge, and where it is handled.
 *
 * Two routes, and only ever one of them at a time. Where the OS can hold an
 * alarm, `src/lib/reminder-schedule.ts` hands it over and this hook does
 * nothing further — that is the whole point of a reminder, since it has to
 * arrive when the app is *not* open. Everywhere else, meaning the web build,
 * the interval below watches the clock while a tab happens to be open.
 *
 * The interval is explicitly skipped when the OS has the alarm. Running both
 * would notify twice on any day the app were open at the right moment, which
 * is the one day the user is least in need of a nudge.
 *
 * The "fire once per day" guard lives in the settings store rather than a ref,
 * so reloading the page mid-evening does not produce a second notification.
 */

import { useEffect, useRef } from "react";
import { canScheduleNotifications } from "@/lib/platform";
import {
  cancelDailyReminder,
  scheduleDailyReminder,
} from "@/lib/reminder-schedule";
import { notificationPermission } from "@/lib/notification-permission";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useVocabStore } from "@/store/useVocabStore";
import { useProgressStore } from "@/store/useProgressStore";
import { toDateKey } from "@/lib/date-utils";
import { countDue } from "@/lib/sm2";

/** How often we re-check the clock. A minute is plenty for a daily nudge. */
const TICK_MS = 60_000;

/**
 * Show a notification now, from the browser API.
 *
 * Only the web path reaches this: the caller returns early wherever the OS is
 * holding the alarm, so there is no Tauri branch here to go stale. It used to
 * have one, which was unreachable and still looked like the supported route.
 */
function notify(title: string, body: string): void {
  try {
    new Notification(title, { body });
  } catch {
    // Some webviews expose Notification but refuse to construct it. Nothing
    // useful to do; the slot is already claimed for today.
  }
}

/** Parse "HH:mm" into minutes since midnight. Returns null if malformed. */
function minutesOfDay(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Mount once, near the root. No-op unless the user has switched reminders on
 * and granted permission.
 */
export function useStudyReminder(): void {
  const enabled = useSettingsStore((s) => s.studyReminderEnabled);
  const time = useSettingsStore((s) => s.studyReminderTime);
  const lastReminderDate = useSettingsStore((s) => s.lastReminderDate);
  const setSettings = useSettingsStore((s) => s.set);
  const months = useVocabStore((s) => s.months);
  const wordsProgress = useProgressStore((s) => s.words);

  // The tick needs current vocab and progress, but neither should re-arm the
  // interval — they change constantly during a study session.
  const dataRef = useRef({ months, wordsProgress });
  dataRef.current = { months, wordsProgress };

  // Where the OS can hold an alarm, let it. This is the whole point of a
  // reminder: it has to arrive when the app is *not* open, and the interval
  // below cannot do that however carefully it is written.
  useEffect(() => {
    if (!canScheduleNotifications()) return;
    if (!enabled) {
      void cancelDailyReminder();
      return;
    }
    void scheduleDailyReminder(time);
  }, [enabled, time]);

  useEffect(() => {
    if (!enabled) return;
    // Handed to the OS above; running the interval too would notify twice on
    // any day the app happens to be open at the right moment.
    if (canScheduleNotifications()) return;
    if (notificationPermission() !== "granted") return;

    const parsed = minutesOfDay(time);
    if (parsed === null) return;
    // Bound outside the closure: `tick` is a hoisted function declaration, so
    // TypeScript will not carry the null-narrowing of `parsed` into it.
    const targetMinutes: number = parsed;

    function tick() {
      const now = new Date();
      const today = toDateKey(now);
      if (useSettingsStore.getState().lastReminderDate === today) return;
      if (now.getHours() * 60 + now.getMinutes() < targetMinutes) return;

      const { months: ms, wordsProgress: wp } = dataRef.current;
      const ids = Object.values(ms).flatMap((m) =>
        m.days.flatMap((d) => d.words.map((w) => w.id)),
      );
      const due = countDue(ids, wp, now);

      // Claim the slot before showing anything, so a re-render mid-tick
      // cannot produce a duplicate.
      setSettings({ lastReminderDate: today });

      const body =
        due > 0
          ? `${due} word${due === 1 ? "" : "s"} due for review.`
          : "No reviews due — a few minutes of practice still helps.";
      notify("Lexicon", body);
    }

    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [enabled, time, lastReminderDate, setSettings]);
}

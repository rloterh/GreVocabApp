/**
 * Optional daily study nudge.
 *
 * Deliberately modest: this fires only while the app is open. A reminder that
 * reaches you with the app closed needs a service worker on web, or
 * tauri-plugin-notification (plus Rust-side capability changes) on desktop —
 * neither of which is wired up yet. See ROADMAP.md, Phase 4.
 *
 * The "fire once per day" guard lives in the settings store rather than a ref,
 * so reloading the page mid-evening does not produce a second notification.
 */

import { useEffect, useRef } from "react";
import { canScheduleNotifications } from "@/lib/platform";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useVocabStore } from "@/store/useVocabStore";
import { useProgressStore } from "@/store/useProgressStore";
import { toDateKey } from "@/lib/date-utils";
import { countDue } from "@/lib/sm2";

/** How often we re-check the clock. A minute is plenty for a daily nudge. */
const TICK_MS = 60_000;

/**
 * Show a notification through the best route this build has.
 *
 * In a packaged build the OS notification service is used, which is what lets
 * a reminder mean something when the app is not in front of the user. The web
 * build falls back to the browser API, which only works while a tab is open —
 * honest, but much weaker, and the UI says so.
 */
async function notify(title: string, body: string): Promise<void> {
  if (canScheduleNotifications()) {
    try {
      const { sendNotification, isPermissionGranted, requestPermission } =
        await import("@tauri-apps/plugin-notification");
      // Android 13+ requires this at runtime; elsewhere it resolves granted.
      if (!(await isPermissionGranted())) {
        if ((await requestPermission()) !== "granted") return;
      }
      sendNotification({ title, body });
      return;
    } catch {
      // Plugin missing or refused — fall through to the browser API rather
      // than dropping the reminder entirely.
    }
  }

  try {
    new Notification(title, { body });
  } catch {
    // Some webviews expose Notification but refuse to construct it. Nothing
    // useful to do; the slot is already claimed for today.
  }
}

/** Does this runtime expose the Notification API at all? */
export function supportsNotifications(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Current permission, or "unsupported" when there is no Notification API. */
export function notificationPermission():
  | NotificationPermission
  | "unsupported" {
  if (!supportsNotifications()) return "unsupported";
  return Notification.permission;
}

/**
 * Ask for permission. Resolves to the resulting state; callers should treat
 * anything other than "granted" as "reminders are off".
 */
export async function requestNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (!supportsNotifications()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    // Older implementations use the callback form and can throw here.
    return Notification.permission;
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

  useEffect(() => {
    if (!enabled) return;
    // The packaged build asks through the plugin at send time, including the
    // Android 13+ runtime prompt; only the browser gates up front.
    if (!canScheduleNotifications() && notificationPermission() !== "granted") {
      return;
    }

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
      void notify("Lexicon", body);
    }

    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [enabled, time, lastReminderDate, setSettings]);
}

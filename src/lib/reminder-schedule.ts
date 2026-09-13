import { canScheduleNotifications } from "@/lib/platform";
import { requestNotificationPermission } from "@/lib/notification-permission";

/**
 * Handing the daily reminder to the operating system.
 *
 * `useStudyReminder` runs a `setInterval` inside the app and fires a
 * notification when the clock passes the chosen time. That works, and it is
 * useless for the thing a reminder is for: it cannot fire unless the app is
 * already open, which is exactly when you do not need reminding.
 *
 * `tauri-plugin-notification` can hand a notification to the OS scheduler, so
 * it arrives whether or not the app is running. This module is that, and the
 * interval stays as the web fallback — a browser tab cannot schedule anything
 * without a service worker and a push backend, which docs/MOBILE.md rules out.
 *
 * The alarm is *inexact*. `setExactAndAllowWhileIdle` needs
 * SCHEDULE_EXACT_ALARM, which Android 14 does not grant by default and which
 * Play reserves for alarm clocks and calendars; a vocabulary nudge is neither,
 * so the plugin falls back to `setAndAllowWhileIdle` and the system may hold
 * the reminder back by up to an hour. That is the correct trade for this
 * feature, and the settings copy says so rather than promising a minute.
 *
 * ROADMAP claimed this was "DONE on the code side" on 2026-09-12. It was not:
 * the plugin was registered and permission was requested, but nothing ever
 * called a scheduling API, so no reminder could ever have arrived with the app
 * closed. Running the app on a device is what surfaced the gap.
 */

/**
 * One id, reused.
 *
 * Rescheduling replaces rather than accumulates. Without a fixed id, changing
 * the time three times leaves three alarms and the user is reminded three
 * times a day.
 */
export const REMINDER_ID = 1;

const TITLE = "Lexicon";

/**
 * Deliberately generic.
 *
 * A scheduled notification's body is fixed when it is scheduled, not when it
 * fires, so it cannot truthfully say "5 words due" — that number is hours or
 * days stale by the time anyone reads it. Saying something true and vague
 * beats saying something precise and wrong.
 */
const BODY = "Time for today's words.";

/**
 * The notification's own mark, rather than Android's generic (i).
 *
 * Per notification, not per app: `plugins.notification` in tauri.conf.json
 * looks like the place for this and is not — the Rust plugin declares its
 * config type as `()`, so any `plugins.notification` object fails
 * deserialization and the app aborts on startup with
 * `invalid type: map, expected unit`. `NotificationData.icon` is the supported
 * route, and the Android side prefers it over the global anyway.
 *
 * The drawable is `src-tauri/android-res/drawable/ic_stat_lexicon.xml`,
 * installed into the generated project by `scripts/android-prepare.mjs`. If
 * the name ever stops resolving, the plugin silently falls back to
 * `android.R.drawable.ic_dialog_info` — so a wrong name looks like no change
 * rather than an error.
 */
const ICON = "ic_stat_lexicon";

/** The accent the rest of the app uses for anything it is confident about. */
const ICON_COLOR = "#3DBE91";

/** `HH:mm` split into numbers, or null if it is not a time. */
export function parseTime(
  time: string,
): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

/** The next occurrence of `HH:mm`, today if it is still ahead, else tomorrow. */
export function nextOccurrence(time: string, now: Date): Date | null {
  const parsed = parseTime(time);
  if (!parsed) return null;

  const at = new Date(now);
  at.setHours(parsed.hours, parsed.minutes, 0, 0);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at;
}

/**
 * The payload for `plugin:notification|notify`.
 *
 * A calendar *pattern* — "whenever the clock reads 19:00" — rather than an
 * instant. The instant form is the obvious one and it is wrong here: with
 * `{ at: { date, repeating: true } }` the Android side computes the repeat
 * interval as `date - now`, so a reminder set at 18:00 for 19:00 repeats
 * hourly, and one set at 18:59 repeats every minute. Verified on a device:
 * `dumpsys alarm` reported `repeatInterval=119840` for a reminder two minutes
 * out. The pattern form re-arms itself for the same clock time each day, which
 * is what a daily reminder means.
 *
 * Exported so a test can read the payload without an OS to send it to.
 */
export function reminderPayload(time: string): Record<string, unknown> | null {
  const parsed = parseTime(time);
  if (!parsed) return null;
  return {
    id: REMINDER_ID,
    title: TITLE,
    body: BODY,
    icon: ICON,
    iconColor: ICON_COLOR,
    schedule: {
      interval: {
        interval: { hour: parsed.hours, minute: parsed.minutes, second: 0 },
        // So Doze does not swallow it on a phone that has been in a pocket all
        // evening, which is every phone at reminder time.
        allowWhileIdle: true,
      },
    },
  };
}

/**
 * Schedule the daily reminder, replacing any existing one.
 *
 * Returns whether the OS took it. `false` means the caller should fall back to
 * the in-app interval — on the web, or when the plugin or permission is
 * unavailable.
 */
export type ScheduleOutcome =
  | { ok: true; at: Date }
  | { ok: false; reason: string };

/** The last attempt, so the UI can tell the user what happened. */
let lastOutcome: ScheduleOutcome | null = null;
export function lastScheduleOutcome(): ScheduleOutcome | null {
  return lastOutcome;
}

export async function scheduleDailyReminder(
  time: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (!canScheduleNotifications()) {
    lastOutcome = { ok: false, reason: "this build cannot schedule" };
    return false;
  }
  const payload = reminderPayload(time);
  const at = nextOccurrence(time, now);
  if (!payload || !at) {
    lastOutcome = { ok: false, reason: `could not read the time "${time}"` };
    return false;
  }

  try {
    const { cancel } = await import("@tauri-apps/plugin-notification");
    const { invoke } = await import("@tauri-apps/api/core");

    if ((await requestNotificationPermission()) !== "granted") {
      lastOutcome = { ok: false, reason: "notification permission refused" };
      return false;
    }

    // Clear the previous alarm before setting the next, or a time change
    // leaves the old one armed as well.
    try {
      await cancel([REMINDER_ID]);
    } catch {
      // Nothing scheduled yet; that is the normal first-run case.
    }

    // `invoke` directly rather than the plugin's `sendNotification`.
    //
    // `sendNotification` does not talk to Rust: it calls
    // `new window.Notification(...)` and relies on the plugin's init script
    // having replaced that global. It also drops its return value on the
    // floor, so a rejected invoke is an unhandled rejection rather than an
    // error this function can report. Calling the command by name removes a
    // layer that can silently not be there, and makes failure catchable.
    await invoke("plugin:notification|notify", { options: payload });
    lastOutcome = { ok: true, at };
    return true;
  } catch (error) {
    // Surfaced, not swallowed. A reminder that silently fails to schedule is
    // indistinguishable from one that scheduled fine and has not fired yet,
    // which is the worst failure mode this feature has — and is exactly what
    // happened the first time it was written.
    lastOutcome = {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
    return false;
  }
}

/** Remove the scheduled reminder. Safe to call when none exists. */
export async function cancelDailyReminder(): Promise<void> {
  if (!canScheduleNotifications()) return;
  try {
    const { cancel } = await import("@tauri-apps/plugin-notification");
    await cancel([REMINDER_ID]);
  } catch {
    // Plugin missing, or nothing to cancel.
  }
}

/** Ids the OS says it is holding. Used to verify a schedule actually landed. */
export async function pendingReminderIds(): Promise<number[]> {
  if (!canScheduleNotifications()) return [];
  try {
    const { pending } = await import("@tauri-apps/plugin-notification");
    return (await pending()).map((notification) => notification.id);
  } catch {
    return [];
  }
}

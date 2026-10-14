# ADR 0015 — The daily reminder is an OS calendar pattern, and it is inexact

**Status:** accepted · 2026-09-13

## Context

Lexicon has offered a daily study reminder since 0.1.0. Until today it could
not work. `useStudyReminder` ran a `setInterval` and fired a notification when
the clock passed the chosen time, which means the reminder could only arrive
while the app was already open — precisely when nobody needs reminding. ROADMAP
recorded this as "DONE 2026-09-12, on the code side" because
`tauri-plugin-notification` was registered and its permission requested. Both
were true. Neither schedules anything.

Running the app on an Android 14 emulator is what exposed it, and then exposed
three further faults that no amount of reading the code would have found. Each
is written up in `src/lib/reminder-schedule.ts` and docs/MOBILE.md; the two
that forced decisions rather than fixes are below.

**The obvious payload repeats at the wrong interval.** The plugin's `Schedule`
type offers `{ at: { date, repeating: true } }`, which reads exactly like "this
instant, then daily". On Android the repeat interval is computed as
`date - now`, so a 19:00 reminder scheduled at 18:00 repeats hourly and one
scheduled at 18:59 repeats every minute. `dumpsys alarm` reported
`repeatInterval=119840` for a reminder two minutes out.

**Exactness is not ours to take.** `setExactAndAllowWhileIdle` requires
`SCHEDULE_EXACT_ALARM`, which Android 14 does not grant by default, and Play
reserves `USE_EXACT_ALARM` for alarm clocks and calendars. The plugin therefore
falls back to `setAndAllowWhileIdle`, and the system may hold the reminder for
up to an hour. Measured on the emulator: a 19:00 alarm was still pending at
19:30, with a hard deadline of 20:00.

## Decision

**Schedule a calendar pattern, not an instant.**

`{ interval: { hour, minute, second: 0 } }`. The OS matches the pattern, fires,
and re-arms itself for the same clock time the next day. `second: 0` is not
decoration: left unset the pattern matches any second of the minute, and the
alarm re-arms once a second for a whole minute.

**Accept an inexact alarm, and say so in the UI.**

A vocabulary nudge is not an alarm clock. Asking the user to grant "Alarms &
reminders" in system settings for a study reminder is a worse trade than
arriving a little late, and claiming the exact-alarm exemption on Play for this
feature would be a misrepresentation. So the reminder is inexact, and the
settings copy reads "at or shortly after" rather than naming a minute.

**Check permission before requesting it.**

Not merely polite — required. On Android 13+ the plugin's `requestPermissions`
has no `else` branch for the already-granted case, so the invoke is never
resolved and the promise never settles. The unresolved request then takes
`notify` and `checkPermissions` down with it for the rest of the process. The
symptom is a settings checkbox that will not stay switched on, with nothing in
the log to explain it.

**Invoke the command by name rather than through `sendNotification`.**

`sendNotification` calls `new window.Notification(...)` and depends on an init
script having replaced that global. When that indirection is not there the call
fails silently and never appears in `logcat` — indistinguishable from a
reminder that scheduled correctly and has not fired yet, which is the worst
failure mode this feature has. Invoking `plugin:notification|notify` directly
makes failure a rejected promise, which Settings reports.

## Consequences

- The reminder arrives with the app closed. This is the feature finally
  existing, not an improvement to it.
- It may arrive up to an hour late while the device is idle. If that turns out
  to matter in practice, the escape hatch is `SCHEDULE_EXACT_ALARM` with a
  user-facing explanation — a bigger, more intrusive change, deliberately not
  taken pre-emptively.
- `reminderPayload` is pure and exported, so the schedule shape is unit-tested
  without an OS. The tests assert the *pattern* form specifically, because the
  instant form is accepted by the OS and silently arms the wrong alarm.
- We depend on an upstream bug staying benign. If the plugin ever fixes
  `requestPermissions`, checking first is still correct; if it regresses
  elsewhere, `requestNotificationPermission` has a deadline so the UI cannot
  wedge.
- Verified on an emulator, not on hardware. A vendor battery manager can still
  suppress this, and only a real phone will say.

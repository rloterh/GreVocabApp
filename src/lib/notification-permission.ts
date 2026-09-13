import { canScheduleNotifications } from "@/lib/platform";

/**
 * Asking permission to notify, on a runtime where the obvious way hangs.
 *
 * `Notification.requestPermission()` looks like the portable answer. On
 * Android it is a trap. tauri-plugin-notification's init script replaces the
 * global with one that invokes `plugin:notification|request_permission`, and
 * on Android 13+ that command never settles when permission is *already*
 * granted — `NotificationPlugin.kt` reads:
 *
 * ```kotlin
 * if (getPermissionState(LOCAL_NOTIFICATIONS) !== PermissionState.GRANTED) {
 *   requestPermissionForAlias(LOCAL_NOTIFICATIONS, invoke, "permissionsCallback")
 * }
 * ```
 *
 * with no `else`. The granted case falls off the end of the function and the
 * `invoke` is never resolved, so the promise is never settled.
 *
 * That is worse than slow. A request left hanging also takes `notify` and
 * `checkPermissions` down with it for the rest of the process, so one
 * unanswered promise disables notifications until the app is restarted —
 * which is exactly how this was found: the reminder checkbox would not stay
 * switched on, and nothing in the log said why.
 *
 * So: ask whether permission is already held, and only request it when the
 * answer is no. That is the path the plugin handles correctly, and it is also
 * the polite one. The deadline below is belt and braces.
 */

/** "unsupported" means the runtime has no notification API at all. */
export type PermissionResult = NotificationPermission | "unsupported";

/**
 * How long to wait for a permission request before giving up on it.
 *
 * Generous, because the clock is running while a human decides what to tap.
 */
const REQUEST_TIMEOUT_MS = 60_000;

/** Does this runtime expose the Notification API at all? */
export function supportsNotifications(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * Current permission, or "unsupported" when there is no Notification API.
 *
 * Synchronous, including under Tauri: the plugin's init script asks the OS
 * once at startup and keeps `Notification.permission` in step, so this stays
 * a property read rather than a round trip.
 */
export function notificationPermission(): PermissionResult {
  if (!supportsNotifications()) return "unsupported";
  return Notification.permission;
}

/**
 * Ask for permission. Resolves to the resulting state; callers should treat
 * anything other than "granted" as "reminders are off".
 */
export async function requestNotificationPermission(): Promise<PermissionResult> {
  if (canScheduleNotifications()) return requestFromOs();

  if (!supportsNotifications()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    // Older implementations use the callback form and can throw here.
    return Notification.permission;
  }
}

async function requestFromOs(): Promise<PermissionResult> {
  let plugin: typeof import("@tauri-apps/plugin-notification");
  try {
    plugin = await import("@tauri-apps/plugin-notification");
  } catch {
    return "unsupported";
  }

  // The cheap question first — and the one that avoids the hang described
  // above. `isPermissionGranted` is a plain state read on every platform.
  if (await plugin.isPermissionGranted()) return "granted";

  // Genuinely not granted, so there is a dialog to show and the plugin does
  // resolve this path. The deadline is only here so that a runtime which
  // repeats the bug in some other case cannot leave the UI waiting forever.
  const answered = await Promise.race([
    plugin.requestPermission().then(
      (state) => state,
      () => "denied" as const,
    ),
    new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), REQUEST_TIMEOUT_MS),
    ),
  ]);

  // "default" is the honest answer to an unanswered question: not granted,
  // but not refused either, and worth offering again.
  if (answered === "timeout") return "default";
  return answered;
}

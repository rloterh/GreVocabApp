/**
 * What this build can actually do.
 *
 * Asked as **capability questions**, not platform questions. The difference
 * matters: `isAndroid()` scattered through the UI means every new platform
 * needs every call site revisited, and it invites checks like "not desktop,
 * therefore no notifications" which are wrong on both mobile platforms.
 *
 * A component should ask "can I watch a folder?" and get an answer, without
 * knowing why not.
 *
 * See docs/MOBILE.md and docs/adr/0004-android-first.md.
 */

import { isTauri } from "@/lib/utils";

export type Platform = "web" | "desktop" | "android" | "ios";

/**
 * Which platform this is.
 *
 * Tauri exposes the OS through a plugin, but that is async and most callers
 * need an answer during render, so this reads the user agent — which is
 * reliable for the only distinction that matters here: is this a phone.
 */
export function platform(): Platform {
  if (!isTauri()) return "web";
  if (typeof navigator === "undefined") return "desktop";

  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "desktop";
}

export function isMobile(): boolean {
  const current = platform();
  return current === "android" || current === "ios";
}

/**
 * Can the app watch a folder for dropped vocabulary files?
 *
 * Desktop only, and not because of a missing API: Android's scoped storage
 * makes "watch a directory" the wrong model entirely. The import path there is
 * the system file picker and a share-target intent, which is a different
 * feature rather than a degraded version of this one.
 */
export function canWatchFolder(): boolean {
  return platform() === "desktop";
}

/** A tray icon needs a tray. */
export function canUseTray(): boolean {
  return platform() === "desktop";
}

/** A global shortcut needs a keyboard and a window manager. */
export function canUseGlobalShortcut(): boolean {
  return platform() === "desktop";
}

/**
 * Can a reminder fire while the app is closed?
 *
 * This is the capability that makes daily reminders worth having. The browser
 * cannot do it at all; a packaged build can, through the OS scheduler.
 */
export function canScheduleNotifications(): boolean {
  return isTauri();
}

/**
 * Does this platform require asking for notification permission at runtime?
 *
 * Android 13 and up. Asking where it is not required is harmless but produces
 * a permission prompt the user did not expect, which is its own small failure.
 */
export function needsNotificationPermission(): boolean {
  return platform() === "android" || platform() === "web";
}

/**
 * Does the system provide a back gesture the app must handle?
 *
 * On Android, back must navigate within the app before exiting it — a back
 * press that closes the app from three screens deep feels broken.
 */
export function hasSystemBack(): boolean {
  return platform() === "android";
}

/** Can the app read and write arbitrary files the user points at? */
export function canUseFileSystem(): boolean {
  return isTauri();
}

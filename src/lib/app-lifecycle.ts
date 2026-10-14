/**
 * "The app went to the background" and "the app came back", on every platform.
 *
 * In a browser, and in the desktop app, that is `visibilitychange`. In the
 * Android app it is not: Tauri's WebView reports `visibilityState` as
 * "visible" with the app in the background and fires nothing on Home or on
 * return — measured on an Android 14 emulator, 2026-10-14. So the activity
 * says so itself (`src-tauri/android-src/MainActivity.kt` dispatches
 * `lexicon:pause` and `lexicon:resume` on the window), and this listens to
 * both sources. A platform that sends both — none today — gets a duplicate
 * call, so handlers must be idempotent; the two that exist are.
 */

export const PAUSE_EVENT = "lexicon:pause";
export const RESUME_EVENT = "lexicon:resume";

export function onAppHidden(handler: () => void): () => void {
  const onVisibility = () => {
    if (document.visibilityState === "hidden") handler();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener(PAUSE_EVENT, handler);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener(PAUSE_EVENT, handler);
  };
}

export function onAppShown(handler: () => void): () => void {
  const onVisibility = () => {
    if (document.visibilityState === "visible") handler();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener(RESUME_EVENT, handler);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener(RESUME_EVENT, handler);
  };
}

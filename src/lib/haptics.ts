/**
 * A small buzz for right and wrong, on devices that can.
 *
 * Tied to the sound switch rather than a setting of its own: both are
 * "feedback beyond the screen", and a third switch for it would be a decision
 * nobody asked to make. Off by default, like sound, and a no-op wherever the
 * Vibration API is missing — every desktop browser in practice, and an
 * Android WebView without the VIBRATE permission, which
 * scripts/android-prepare.mjs adds.
 *
 * Patterns are short on purpose. A long buzz on every wrong answer is a
 * punishment; this should be felt, not noticed.
 *
 * See docs/GAMES-UI.md §4.
 */

import { canVibrate } from "@/lib/platform";
import { useSettingsStore } from "@/store/useSettingsStore";

export type HapticName = "correct" | "wrong";

const PATTERNS: Record<HapticName, number | number[]> = {
  correct: 12,
  wrong: [20, 40, 20],
};

export function haptic(name: HapticName): void {
  if (!useSettingsStore.getState().soundEnabled || !canVibrate()) return;
  try {
    navigator.vibrate(PATTERNS[name]);
  } catch {
    // A browser may refuse outside a user gesture. Nothing to do about it.
  }
}

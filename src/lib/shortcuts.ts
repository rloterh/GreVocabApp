/**
 * Global keyboard shortcuts.
 *
 * The matching is pure and lives here; `src/hooks/useShortcuts.ts` does
 * nothing but bind it to the window and dispatch. That split is what makes the
 * sequence handling ("g" then "d") testable without a DOM.
 *
 * See ROADMAP.md, Phase 5.
 */

import type { Page } from "@/store/useAppStore";

/** What a keypress resolved to. */
export type ShortcutAction =
  | { type: "navigate"; page: Page }
  | { type: "help" }
  | { type: "close" };

export interface ShortcutSpec {
  /** How the binding is written for a human, e.g. "g d". */
  keys: string;
  label: string;
  action: ShortcutAction;
}

/**
 * The "go to" sequences. Vim-style two-key bindings, because single letters
 * would collide with anything we might later want to bind directly.
 */
export const GO_TO: Record<string, ShortcutSpec> = {
  d: { keys: "g d", label: "Dashboard", action: { type: "navigate", page: "dashboard" } },
  p: { keys: "g p", label: "Daily practice", action: { type: "navigate", page: "practice" } },
  f: { keys: "g f", label: "Flashcards", action: { type: "navigate", page: "flashcards" } },
  q: { keys: "g q", label: "Quiz", action: { type: "navigate", page: "quiz" } },
  w: { keys: "g w", label: "Sentence builder", action: { type: "navigate", page: "sentences" } },
  c: { keys: "g c", label: "Calendar", action: { type: "navigate", page: "calendar" } },
  a: { keys: "g a", label: "Archive", action: { type: "navigate", page: "archive" } },
  r: { keys: "g r", label: "Progress", action: { type: "navigate", page: "progress" } },
  s: { keys: "g s", label: "Settings", action: { type: "navigate", page: "settings" } },
};

/** Single-key bindings. */
export const DIRECT: Record<string, ShortcutSpec> = {
  "/": { keys: "/", label: "Search", action: { type: "navigate", page: "search" } },
  "?": { keys: "?", label: "Keyboard shortcuts", action: { type: "help" } },
};

/** Everything, in the order the help overlay should list it. */
export const ALL_SHORTCUTS: ShortcutSpec[] = [
  DIRECT["/"],
  DIRECT["?"],
  ...Object.values(GO_TO),
];

/** How long a pending "g" waits for its second key. */
export const SEQUENCE_TIMEOUT_MS = 1200;

/**
 * Is this event coming from somewhere the user is typing?
 *
 * Shortcuts must never fire while someone is writing a sentence, so this errs
 * towards leaving the keypress alone.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  // Duck-typed rather than `instanceof HTMLElement`: that check fails for
  // elements from another realm (an iframe), and it makes this module
  // untestable outside a DOM for no benefit.
  const el = target as { tagName?: unknown; isContentEditable?: unknown } | null;
  if (!el || typeof el.tagName !== "string") return false;
  if (el.isContentEditable === true) return true;
  const tag = el.tagName.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export interface ShortcutResult {
  action: ShortcutAction | null;
  /** The pending prefix after this key: "g" while waiting, null otherwise. */
  pending: string | null;
  /** Whether the key was consumed and its default should be prevented. */
  handled: boolean;
}

const IGNORED: ShortcutResult = { action: null, pending: null, handled: false };

/**
 * Resolve one keypress.
 *
 * @param pending the prefix already typed, or null
 * @param key     `KeyboardEvent.key`
 * @param modifiers whether a modifier was held — any modifier means this is
 *                  someone else's shortcut, not ours
 */
export function resolveShortcut(
  pending: string | null,
  key: string,
  modifiers: { ctrl?: boolean; meta?: boolean; alt?: boolean } = {},
): ShortcutResult {
  if (modifiers.ctrl || modifiers.meta || modifiers.alt) {
    // Leave browser and OS bindings alone, and drop any half-typed sequence.
    return IGNORED;
  }

  if (key === "Escape") {
    return { action: { type: "close" }, pending: null, handled: false };
  }

  if (pending === "g") {
    const spec = GO_TO[key.toLowerCase()];
    // Either way the sequence is over — a wrong second key cancels it rather
    // than leaving "g" armed for the next thing the user types.
    return spec
      ? { action: spec.action, pending: null, handled: true }
      : { action: null, pending: null, handled: false };
  }

  if (key === "g") {
    return { action: null, pending: "g", handled: true };
  }

  const direct = DIRECT[key];
  if (direct) {
    return { action: direct.action, pending: null, handled: true };
  }

  return IGNORED;
}

/**
 * Bind the global shortcuts to the window.
 *
 * All the matching logic lives in `src/lib/shortcuts.ts`; this only listens,
 * dispatches, and times out a half-typed sequence.
 *
 * See ROADMAP.md, Phase 5.
 */

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import {
  isTypingTarget,
  resolveShortcut,
  SEQUENCE_TIMEOUT_MS,
} from "@/lib/shortcuts";

export interface ShortcutsState {
  /** Whether the keyboard-shortcuts overlay is open. */
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
}

export function useShortcuts(): ShortcutsState {
  const navigate = useAppStore((s) => s.navigate);
  const [helpOpen, setHelpOpen] = useState(false);

  const pending = useRef<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const clearPending = () => {
      pending.current = null;
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };

    function onKeyDown(e: KeyboardEvent) {
      // Never steal a keypress from a field the user is typing in.
      if (isTypingTarget(e.target)) return;

      const result = resolveShortcut(pending.current, e.key, {
        ctrl: e.ctrlKey,
        meta: e.metaKey,
        alt: e.altKey,
      });

      clearPending();

      if (result.pending) {
        pending.current = result.pending;
        // A sequence that is never completed should not stay armed forever.
        timer.current = window.setTimeout(clearPending, SEQUENCE_TIMEOUT_MS);
      }

      if (result.handled) e.preventDefault();

      switch (result.action?.type) {
        case "navigate":
          setHelpOpen(false);
          navigate(result.action.page);
          break;
        case "help":
          setHelpOpen((open) => !open);
          break;
        case "close":
          setHelpOpen(false);
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearPending();
    };
  }, [navigate]);

  return { helpOpen, setHelpOpen };
}

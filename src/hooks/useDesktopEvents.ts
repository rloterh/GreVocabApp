/**
 * Respond to the desktop shell.
 *
 * The tray menu and the global shortcut both emit `open-flashcards` from Rust
 * (`src-tauri/src/desktop.rs`); this navigates there. Inert in the browser.
 *
 * See ROADMAP.md, Phase 4.
 */

import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { isTauri } from "@/lib/utils";

/** Event name, matching OPEN_FLASHCARDS in desktop.rs. */
const OPEN_FLASHCARDS = "open-flashcards";

export function useDesktopEvents(): void {
  const navigate = useAppStore((s) => s.navigate);

  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      if (cancelled) return;
      // Flashcards already opens on the due deck when anything is due, so
      // navigating there is the whole behaviour.
      unlisten = await listen(OPEN_FLASHCARDS, () => navigate("flashcards"));
      if (cancelled) unlisten?.();
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [navigate]);
}

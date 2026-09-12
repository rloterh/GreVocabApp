/**
 * Put focus back where it was when a dialog closes.
 *
 * Radix restores focus to its `DialogTrigger` — but every dialog in this app
 * is driven by an `open` prop from a button elsewhere, so Radix has no trigger
 * to return to and focus lands on a container instead. For a keyboard user
 * that means the next Tab starts again from the top of the page, which is the
 * difference between a dialog being usable and being a dead end.
 *
 * Remembering the element ourselves is a few lines and fixes every dialog at
 * once, rather than restructuring five call sites around `DialogTrigger`.
 */

import { useEffect, useRef } from "react";

export function useRestoreFocus(open: boolean): void {
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      // Captured on the way in, while it is still the active element.
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement ? active : null;
      return;
    }

    const target = opener.current;
    opener.current = null;
    if (!target) return;

    // After the close animation has finished handing focus around, and only if
    // the element is still on the page — a dialog that removed its own trigger
    // should not have focus forced onto a detached node.
    const id = window.setTimeout(() => {
      if (target.isConnected) target.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);
}

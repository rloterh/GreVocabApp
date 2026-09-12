/**
 * The `?` overlay listing every global shortcut.
 *
 * See ROADMAP.md, Phase 5.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ALL_SHORTCUTS } from "@/lib/shortcuts";
import { useRestoreFocus } from "@/hooks/useRestoreFocus";

export function ShortcutsHelp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Keyboard users must land back on the control that opened this.
  useRestoreFocus(open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            These work anywhere except while you are typing in a field.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1">
          {ALL_SHORTCUTS.map((shortcut) => (
            <li
              key={shortcut.keys}
              className="flex items-center justify-between gap-4 rounded-md border border-border/40 px-3 py-2"
            >
              <span className="text-sm">{shortcut.label}</span>
              <span className="flex gap-1 shrink-0">
                {shortcut.keys.split(" ").map((key, i) => (
                  <kbd
                    key={`${shortcut.keys}-${i}`}
                    className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-mono border border-border/60"
                  >
                    {key}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>

        <p className="text-[11px] text-muted-foreground">
          Flashcards has its own keys during a session: Space to flip, 1–4 to
          rate, arrows to move, Escape to pause.
        </p>
      </DialogContent>
    </Dialog>
  );
}

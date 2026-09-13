/**
 * Share a deck, and receive one.
 *
 * Two small components: a copy button for a month, and a dialog that takes a
 * pasted code. The encoding lives in `src/lib/share.ts`; a received deck goes
 * through `loadMonth` like any file, because a pasted string is the least
 * trustworthy input this app takes.
 *
 * See ROADMAP.md, Phase 5.
 */

import { useState } from "react";
import { ClipboardPaste, Share2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useVocabStore } from "@/store/useVocabStore";
import { useAppStore } from "@/store/useAppStore";
import { decodeDeck, encodeDeck, findDeckCode, supportsSharing } from "@/lib/share";
import { formatMonthKey } from "@/lib/date-utils";
import type { VocabMonth } from "@/types";

/** Copy one month to the clipboard as a deck code. */
export function ShareDeckButton({ month }: { month: VocabMonth }) {
  const showToast = useAppStore((s) => s.showToast);
  const [busy, setBusy] = useState(false);

  if (!supportsSharing()) return null;

  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-muted-foreground hover:text-foreground"
      disabled={busy}
      title={`Copy ${month.title} as a shareable code`}
      onClick={async () => {
        setBusy(true);
        try {
          const code = await encodeDeck(month);
          await navigator.clipboard.writeText(code);
          showToast({
            title: "Deck code copied",
            description: `${month.title} — paste it anywhere to share.`,
            variant: "success",
          });
        } catch (e) {
          showToast({
            title: "Could not copy deck",
            description: e instanceof Error ? e.message : undefined,
            variant: "error",
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Share2 className="w-3.5 h-3.5" />
      <span className="sr-only">Share {month.title}</span>
    </Button>
  );
}

/** Paste a deck code someone sent you. */
export function ImportDeckButton() {
  const loadMonth = useVocabStore((s) => s.loadMonth);
  const showToast = useAppStore((s) => s.showToast);

  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!supportsSharing()) return null;

  async function run() {
    setError(null);
    setBusy(true);
    try {
      // Accept a whole pasted message, not just a bare code.
      const raw = findDeckCode(code) ?? code;
      const decoded = await decodeDeck(raw);
      const result = loadMonth(decoded);
      if (!result.ok) {
        setError(`That deck did not validate: ${result.error}`);
        return;
      }
      setOpen(false);
      setCode("");
      showToast({
        title: `Imported ${formatMonthKey(result.monthKey)}`,
        variant: "success",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ClipboardPaste className="w-3.5 h-3.5" />
        Paste deck code
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import a shared deck</DialogTitle>
            <DialogDescription>
              Paste a code someone sent you. It is checked against the same
              rules as a file before anything loads.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label className="sr-only" htmlFor="deck-code">
              Deck code
            </label>
            <textarea
              id="deck-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="lex1:…"
              rows={5}
              disabled={busy}
              autoFocus
              className="w-full rounded-md border border-input bg-background p-3 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />

            {error && (
              <p className="text-xs text-destructive leading-relaxed" role="alert">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button onClick={run} disabled={busy || !code.trim()}>
                {busy ? "Importing…" : "Import"}
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

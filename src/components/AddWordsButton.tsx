/**
 * Adding words of your own to a month you already have.
 *
 * The words are given, so nothing is being chosen here — only the definition,
 * example and mnemonic are generated. That makes this much cheaper than a
 * month, and it is the route for "I keep meeting *perspicacious* and want it
 * in here".
 *
 * Collisions are reported before anything is generated, naming the month the
 * word is already in, because being told afterwards is useless.
 *
 * See docs/VOCAB-GENERATION.md.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
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
import { selectProvider } from "@/lib/ai/client";
import { AiError } from "@/lib/ai/errors";
import { generateCards } from "@/lib/generate";
import { splitWordList } from "@/lib/generation-plan";
import { formatMonthKey } from "@/lib/date-utils";
import type { VocabMonth } from "@/types";

export function AddWordsButton({ month }: { month: VocabMonth }) {
  const addWordsToMonth = useVocabStore((s) => s.addWordsToMonth);
  const getVocabIndex = useVocabStore((s) => s.getVocabIndex);
  const showToast = useAppStore((s) => s.showToast);

  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const words = useMemo(() => splitWordList(text), [text]);

  /** Said before generating: afterwards is too late to be useful. */
  const collisions = useMemo(() => {
    if (!open || words.length === 0) return [];
    const index = getVocabIndex();
    return words
      .map((word) => ({ word, existing: index.lookup(word) }))
      .filter((row) => row.existing)
      .map((row) => ({
        word: row.word,
        where: row.existing!.retiredAt
          ? "a month you removed"
          : formatMonthKey(row.existing!.monthKey),
      }));
  }, [open, words, getVocabIndex]);

  async function add() {
    setError(null);
    setBusy(true);
    try {
      const provider = await selectProvider();
      const cards = await generateCards({
        provider,
        words,
        monthKey: month.month,
      });
      const result = addWordsToMonth(month.month, cards);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setOpen(false);
      setText("");
      showToast({
        title: `Added ${result.added} word${result.added === 1 ? "" : "s"}`,
        description:
          result.added < cards.length
            ? `${cards.length - result.added} did not fit — the month is full.`
            : formatMonthKey(month.month),
        variant: "success",
      });
    } catch (e) {
      if (e instanceof AiError && e.kind === "cancelled") return;
      setError(e instanceof Error ? e.message : "Could not add those words.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Plus className="w-3.5 h-3.5" />
        Add words
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add words to {formatMonthKey(month.month)}</DialogTitle>
            <DialogDescription>
              Type the words you want. Only the definition, example and mnemonic
              are generated — the words are yours.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"perspicacious, obdurate\nor one per line"}
              rows={4}
              autoFocus
              disabled={busy}
              className="w-full rounded-md border border-input bg-background p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />

            <p className="text-[11px] text-muted-foreground">
              {words.length} word{words.length === 1 ? "" : "s"}
            </p>

            {collisions.length > 0 && (
              <p className="text-[11px] text-warning flex items-start gap-1.5 leading-relaxed">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                <span>
                  Already in your vocabulary:{" "}
                  {collisions.map((c) => `${c.word} (${c.where})`).join(", ")}.
                  They will be added anyway, because you asked for them.
                </span>
              </p>
            )}

            {error && (
              <p className="text-xs text-destructive leading-relaxed" role="alert">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button onClick={() => void add()} disabled={busy || words.length === 0}>
                {busy ? "Writing cards…" : `Add ${words.length || ""}`.trim()}
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

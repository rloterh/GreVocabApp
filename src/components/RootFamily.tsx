/**
 * The root a word belongs to, and the words you already have that share it.
 *
 * Shown only when there is something to show: a root with no other loaded
 * member is a piece of trivia, and a card that sometimes carries a line of
 * trivia is a card whose layout moves for no reason.
 *
 * See `src/lib/roots.ts` for why membership is curated rather than inferred.
 */

import { useMemo } from "react";
import { Sprout } from "lucide-react";
import { useVocabStore } from "@/store/useVocabStore";
import { allWordsInMonth } from "@/lib/vocabulary";
import { relativesOf } from "@/lib/roots";
import { cn } from "@/lib/utils";

export function RootFamily({
  word,
  className,
  onSelect,
}: {
  word: string;
  className?: string;
  /** Given a word id, when a relative is chosen. Omit to render plain text. */
  onSelect?: (wordId: string) => void;
}) {
  const getAllMonths = useVocabStore((s) => s.getAllMonths);
  const months = useVocabStore((s) => s.months);

  const families = useMemo(
    () => relativesOf(word, getAllMonths().flatMap(allWordsInMonth)),
    [word, getAllMonths, months],
  );

  if (families.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {families.map(({ family, words }) => (
        <div key={family.root}>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Sprout className="w-3 h-3 shrink-0 text-accent" />
            <span>
              <span className="font-medium text-foreground">{family.root}</span>
              {" — "}
              {family.meaning}
              <span className="opacity-70"> ({family.origin})</span>
            </span>
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {words.map((related) =>
              onSelect && related.id ? (
                <button
                  key={related.word}
                  type="button"
                  onClick={() => onSelect(related.id!)}
                  className="rounded-md border border-border/60 px-2 py-1 text-xs hover:border-border hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {related.word}
                </button>
              ) : (
                <span
                  key={related.word}
                  className="rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground"
                >
                  {related.word}
                </span>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

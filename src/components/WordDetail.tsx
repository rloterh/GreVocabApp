/**
 * Per-word detail modal.
 *
 * Everything the app knows about one word in one place: the card content, the
 * mastery and quiz tallies, the SM-2 scheduling state, and the actual review
 * history reconstructed from past study sessions.
 *
 * See ROADMAP.md, Phase 2.
 */

import { useMemo } from "react";
import { BookOpen, CalendarClock, Check, Flame, X, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProgressStore } from "@/store/useProgressStore";
import { differenceInDays, format, toDateKey } from "@/lib/date-utils";
import { schedulingStateOf } from "@/lib/sm2";
import { cn } from "@/lib/utils";
import type { StudyRating, VocabWord } from "@/types";
import { useRestoreFocus } from "@/hooks/useRestoreFocus";

export interface WordDetailTarget extends VocabWord {
  monthKey: string;
  monthName: string;
  day: number;
}

const RATING_STYLE: Record<
  StudyRating,
  {
    label: string;
    className: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  again: { label: "Again", className: "text-destructive", icon: X },
  hard: { label: "Hard", className: "text-warning", icon: Flame },
  good: { label: "Good", className: "text-accent", icon: Check },
  easy: { label: "Easy", className: "text-success", icon: Zap },
};

/**
 * Turn a due date into something a human reads at a glance.
 * Compared by calendar day so it agrees with `isDue` in src/lib/sm2.ts.
 */
function describeDue(
  dueAt: string,
  now: Date,
): { text: string; overdue: boolean } {
  const due = new Date(dueAt);
  const days = differenceInDays(
    new Date(toDateKey(due)),
    new Date(toDateKey(now)),
  );
  if (days < 0) {
    const n = Math.abs(days);
    return { text: `Overdue by ${n} day${n === 1 ? "" : "s"}`, overdue: true };
  }
  if (days === 0) return { text: "Due today", overdue: true };
  if (days === 1) return { text: "Due tomorrow", overdue: false };
  return { text: `Due in ${days} days`, overdue: false };
}

export function WordDetail({
  word,
  onOpenChange,
  onOpenPractice,
}: {
  /** The word to show, or null when the modal is closed. */
  word: WordDetailTarget | null;
  onOpenChange: (open: boolean) => void;
  /** Jump to this word's day in Daily Practice. */
  onOpenPractice?: (word: WordDetailTarget) => void;
}) {
  // Keyboard users must land back on the control that opened this.
  useRestoreFocus(word !== null);
  const wordsProgress = useProgressStore((s) => s.words);
  const studies = useProgressStore((s) => s.studies);

  const progress = word ? wordsProgress[word.id] : undefined;
  const sm2 = schedulingStateOf(progress);

  // Reconstruct this word's review history from stored study sessions.
  // Sessions are already capped at 100 by the store, so this stays small.
  const history = useMemo(() => {
    if (!word) return [];
    return studies
      .flatMap((s) =>
        s.events
          .filter((e) => e.wordId === word.id)
          .map((e) => ({
            at: s.finishedAt,
            rating: e.rating,
            msToRate: e.msToRate,
          })),
      )
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [studies, word]);

  const now = new Date();
  const due = progress?.dueAt ? describeDue(progress.dueAt, now) : null;
  const accuracy =
    progress && progress.quizAttempts > 0
      ? Math.round((progress.quizCorrect / progress.quizAttempts) * 100)
      : null;

  return (
    <Dialog open={word !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        {word && (
          <>
            <DialogHeader>
              <div className="flex items-baseline gap-2 flex-wrap pr-8">
                <DialogTitle className="display-serif text-2xl font-semibold">
                  {word.word}
                </DialogTitle>
                <span className="text-sm italic text-muted-foreground">
                  {word.partOfSpeech}
                </span>
              </div>
              <DialogDescription>
                {word.monthName} &middot; Day {word.day}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div>
                <p className="text-sm leading-relaxed">{word.definition}</p>
                {word.example && (
                  <p className="mt-2 text-sm text-muted-foreground italic leading-relaxed">
                    &ldquo;{word.example}&rdquo;
                  </p>
                )}
                {word.mnemonic && (
                  <p className="mt-3 rounded-md border border-border/60 bg-secondary/30 p-3 text-xs text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground">
                      Mnemonic:
                    </span>{" "}
                    {word.mnemonic}
                  </p>
                )}
              </div>

              <section>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                  Spaced repetition
                </p>
                {progress?.dueAt ? (
                  <div className="rounded-lg border border-border/60 p-4">
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <CalendarClock
                        className={cn(
                          "w-4 h-4 shrink-0",
                          due?.overdue ? "text-accent" : "text-muted-foreground",
                        )}
                      />
                      <p className="text-sm font-medium">{due?.text}</p>
                      <span className="text-xs text-muted-foreground">
                        &middot; {format(new Date(progress.dueAt), "d MMM yyyy")}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <Stat label="Ease" value={sm2.easeFactor.toFixed(2)} />
                      <Stat label="Interval" value={`${sm2.intervalDays}d`} />
                      <Stat label="Reps" value={String(sm2.reps)} />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Not scheduled yet &mdash; rate this word in Flashcards and
                    the scheduler will pick a review date.
                  </p>
                )}
              </section>

              <section>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                  Progress
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={progress?.mastered ? "success" : "outline"}>
                    {progress?.mastered ? "Mastered" : "In progress"}
                  </Badge>
                  <Badge variant="outline" className="tabular">
                    Reviewed {progress?.timesReviewed ?? 0}&times;
                  </Badge>
                  {accuracy !== null && (
                    <Badge variant="outline" className="tabular">
                      Quiz {accuracy}% ({progress?.quizCorrect}/
                      {progress?.quizAttempts})
                    </Badge>
                  )}
                  {progress?.lastReviewed && (
                    <Badge variant="outline">
                      Last seen{" "}
                      {format(new Date(progress.lastReviewed), "d MMM")}
                    </Badge>
                  )}
                </div>
              </section>

              <section>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                  Review history
                </p>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No flashcard reviews recorded yet.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {history.slice(0, 12).map((h, i) => {
                      const meta = RATING_STYLE[h.rating];
                      const Icon = meta.icon;
                      return (
                        <li
                          key={`${h.at}-${i}`}
                          className="flex items-center justify-between gap-3 rounded-md border border-border/40 px-3 py-1.5"
                        >
                          <span className="flex items-center gap-2 text-sm">
                            <Icon
                              className={cn("w-3.5 h-3.5", meta.className)}
                            />
                            <span className={meta.className}>{meta.label}</span>
                          </span>
                          <span className="text-xs text-muted-foreground tabular">
                            {format(new Date(h.at), "d MMM yyyy")} &middot;{" "}
                            {(h.msToRate / 1000).toFixed(1)}s
                          </span>
                        </li>
                      );
                    })}
                    {history.length > 12 && (
                      <li className="text-xs text-muted-foreground pt-1">
                        + {history.length - 12} earlier
                      </li>
                    )}
                  </ul>
                )}
              </section>

              {onOpenPractice && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => onOpenPractice(word)}
                >
                  <BookOpen className="w-4 h-4" />
                  Open day {word.day} in practice
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-medium tabular mt-0.5">{value}</p>
    </div>
  );
}

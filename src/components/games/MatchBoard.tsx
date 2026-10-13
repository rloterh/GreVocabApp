/**
 * A Match Up board: five words, five meanings, paired by tapping one of each.
 *
 * A right pair locks in and fades; a wrong pair flashes and costs two
 * seconds — time, never points (docs/GAMES.md §4.6). Selection can start on
 * either side. Every item is a real button, so Tab and Enter play the whole
 * board without a pointer.
 *
 * On a phone the words sit in a wrapping row above the meanings, so a long
 * definition gets the full width; from `md` up the two columns sit side by
 * side. Definitions are never truncated.
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { seedFor, seededShuffle } from "@/lib/order";
import type { AnswerRecord, MatchQuestion } from "@/lib/games/types";
import { cn } from "@/lib/utils";

/** What a wrong pairing costs, in milliseconds of the board's clock. */
export const MISMATCH_PENALTY_MS = 2000;
const EASE = [0.16, 1, 0.3, 1] as const;

export function MatchBoard({
  question,
  phase,
  matchedIds,
  answer,
  reduceMotion,
  onMatch,
  onMiss,
  onContinue,
}: {
  question: MatchQuestion;
  phase: string;
  matchedIds: readonly string[];
  answer: AnswerRecord | undefined;
  reduceMotion: boolean;
  onMatch: (wordId: string) => void;
  onMiss: () => void;
  onContinue: () => void;
}) {
  // The meanings column in a stable shuffled order, so it never lines up
  // with the words.
  const rights = useMemo(
    () => seededShuffle(question.pairs, seedFor([question.wordId, "match"])),
    [question],
  );
  const [word, setWord] = useState<string | null>(null);
  const [meaning, setMeaning] = useState<string | null>(null);
  const [wrong, setWrong] = useState<{ word: string; meaning: string } | null>(null);
  const asking = phase === "asking";

  // Resolve a selection once both sides are chosen.
  useEffect(() => {
    if (!word || !meaning) return;
    if (word === meaning) {
      onMatch(word);
      setWord(null);
      setMeaning(null);
      return;
    }
    onMiss();
    setWrong({ word, meaning });
    setWord(null);
    setMeaning(null);
    const t = window.setTimeout(() => setWrong(null), 450);
    return () => window.clearTimeout(t);
  }, [word, meaning, onMatch, onMiss]);

  const done = phase === "feedback" && answer;
  const matched = new Set(matchedIds);

  return (
    <div className="flex flex-1 flex-col pb-2 pt-4">
      <p className="text-center text-[11px] uppercase tracking-wider text-muted-foreground">
        Match each word {question.matchKind === "synonym" ? "to its synonym" : "to its meaning"}
        <span className="tabular normal-case tracking-normal"> · {matched.size} of {question.pairs.length}</span>
      </p>

      <div className="mt-4 grid content-start gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div role="group" aria-label="Words" className="flex flex-wrap content-start gap-2 md:flex-col md:flex-nowrap">
          {question.pairs.map((p) => {
            const isMatched = matched.has(p.wordId);
            const isWrong = wrong?.word === p.wordId;
            return (
              <motion.button
                key={p.wordId}
                type="button"
                disabled={!asking || isMatched}
                aria-pressed={word === p.wordId}
                data-pair={p.wordId}
                onClick={() => setWord(word === p.wordId ? null : p.wordId)}
                animate={isWrong && !reduceMotion ? { x: [0, -4, 4, -4, 4, 0] } : { x: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className={cn(
                  "display-serif min-h-[2.75rem] rounded-xl border px-4 py-2 text-left text-lg font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isMatched
                    ? "border-success/60 bg-success/10 text-success opacity-70"
                    : word === p.wordId
                      ? "border-primary bg-primary text-primary-foreground"
                      : isWrong
                        ? "border-destructive/60 bg-destructive/10"
                        : "border-border bg-card [@media(hover:hover)]:hover:border-primary/60",
                )}
              >
                {isMatched && <Check className="mr-1.5 inline h-4 w-4" aria-label="paired" />}
                {p.word}
              </motion.button>
            );
          })}
        </div>

        <div role="group" aria-label="Meanings" className="flex flex-col gap-2">
          {rights.map((p) => {
            const isMatched = matched.has(p.wordId);
            const isWrong = wrong?.meaning === p.wordId;
            return (
              <motion.button
                key={p.wordId}
                type="button"
                disabled={!asking || isMatched}
                aria-pressed={meaning === p.wordId}
                data-pair={p.wordId}
                onClick={() => setMeaning(meaning === p.wordId ? null : p.wordId)}
                animate={
                  isWrong && !reduceMotion
                    ? { x: [0, -4, 4, -4, 4, 0] }
                    : { x: 0, opacity: isMatched ? 0.55 : 1 }
                }
                transition={{ duration: 0.3, ease: EASE }}
                className={cn(
                  "min-h-[2.75rem] rounded-xl border px-4 py-2.5 text-left text-sm leading-snug transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isMatched
                    ? "border-success/60 bg-success/10"
                    : meaning === p.wordId
                      ? "border-primary bg-primary text-primary-foreground"
                      : isWrong
                        ? "border-destructive/60 bg-destructive/10"
                        : "border-border bg-card [@media(hover:hover)]:hover:border-primary/60",
                )}
              >
                {isMatched && (
                  <span className="display-serif mr-2 font-semibold text-success">{p.word} ·</span>
                )}
                {p.match}
              </motion.button>
            );
          })}
        </div>
      </div>

      {done && (
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: EASE }}
          className="mt-4 rounded-xl border border-border bg-card p-4 text-sm"
        >
          <p className="font-medium">
            <span className={answer.correct ? "text-success" : "text-foreground"}>
              {answer.correct
                ? "All paired"
                : answer.timedOut
                  ? `Time's up — ${answer.matched ?? 0} of ${question.pairs.length} paired`
                  : `${answer.matched ?? 0} of ${question.pairs.length} paired`}
            </span>
            <span className="tabular ml-2 text-success">+{answer.points}</span>
          </p>
          {!answer.correct && (
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {question.pairs
                .filter((p) => !matched.has(p.wordId))
                .map((p) => (
                  <li key={p.wordId}>
                    <span className="display-serif font-semibold text-foreground">{p.word}</span> — {p.match}
                  </li>
                ))}
            </ul>
          )}
          <div className="mt-3 flex justify-end">
            <Button size="sm" autoFocus onClick={onContinue}>
              Continue
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

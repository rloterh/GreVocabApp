/**
 * Unscramble: tap the tiles into order — or type them.
 *
 * Tap a tile to place it in the next slot, tap a placed letter to send it
 * back. On a keyboard, typing a letter places the first unused tile with it
 * and Backspace takes the last one back. A full row that is not the word
 * shakes and clears; it costs nothing but the time it took
 * (docs/GAMES.md §4.8).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AnswerRecord, TilesQuestion } from "@/lib/games/types";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

export function TilesPanel({
  question,
  phase,
  answer,
  reduceMotion,
  onSolve,
  onMiss,
  onContinue,
}: {
  question: TilesQuestion;
  phase: string;
  answer: AnswerRecord | undefined;
  reduceMotion: boolean;
  onSolve: (hinted: boolean) => void;
  onMiss: () => void;
  onContinue: () => void;
}) {
  const [placed, setPlaced] = useState<number[]>([]);
  const [hinted, setHinted] = useState(false);
  const [shaking, setShaking] = useState(false);
  const asking = phase === "asking";
  const n = question.tiles.length;

  const place = useCallback(
    (i: number) => {
      if (!asking || shaking) return;
      setPlaced((p) => (p.includes(i) || p.length >= n ? p : [...p, i]));
    },
    [asking, shaking, n],
  );

  // The parent re-renders ten times a second while the clock runs, handing
  // down new callbacks each time. Held in refs, so the check below runs once
  // per full row — not once per render, which replayed the "wrong" sound ten
  // times a second and restarted the clear timer before it could fire.
  const solveRef = useRef(onSolve);
  const missRef = useRef(onMiss);
  solveRef.current = onSolve;
  missRef.current = onMiss;

  // A full row is checked once: solved, or shaken and cleared.
  useEffect(() => {
    if (!asking || placed.length !== n) return;
    const spelled = placed.map((i) => question.tiles[i]).join("");
    if (spelled === question.word) {
      solveRef.current(hinted);
      return;
    }
    missRef.current();
    setShaking(true);
    const t = window.setTimeout(() => {
      setShaking(false);
      // A hint's letter stays where the hint put it.
      setPlaced((p) => (hinted ? p.slice(0, 1) : []));
    }, 450);
    return () => window.clearTimeout(t);
  }, [placed, n, asking, question, hinted]);

  // Typing plays too.
  useEffect(() => {
    if (!asking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Backspace") {
        e.preventDefault();
        setPlaced((p) => (hinted && p.length <= 1 ? p : p.slice(0, -1)));
        return;
      }
      if (/^[a-zA-Z]$/.test(e.key)) {
        const letter = e.key.toLowerCase();
        setPlaced((p) => {
          const i = question.tiles.findIndex((t, j) => t === letter && !p.includes(j));
          return i < 0 || p.length >= n ? p : [...p, i];
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asking, question, n, hinted]);

  const hint = () => {
    const i = question.tiles.findIndex((t) => t === question.word[0]);
    if (i < 0) return;
    setHinted(true);
    setPlaced([i]);
  };

  const done = phase === "feedback" && answer;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6 text-center">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Unscramble the word</p>
      <div className="max-w-[34rem]">
        <p className="text-xs italic text-muted-foreground">{question.partOfSpeech}</p>
        <p className="mt-1 text-balance text-[clamp(1.1rem,3.5vw,1.4rem)] leading-snug">{question.definition}</p>
      </div>

      {/* The answer row. */}
      <motion.div
        role="group"
        aria-label={`Your word, ${placed.length} of ${n} letters`}
        className="flex flex-wrap justify-center gap-1.5"
        animate={shaking && !reduceMotion ? { x: [0, -6, 6, -6, 6, 0] } : { x: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
      >
        {Array.from({ length: n }).map((_, k) => {
          const tile = placed[k];
          const letter = done ? question.word[k] : tile === undefined ? "" : question.tiles[tile];
          return (
            <button
              key={k}
              type="button"
              disabled={!asking || tile === undefined || (hinted && k === 0)}
              onClick={() => setPlaced((p) => p.filter((_, j) => j !== k))}
              aria-label={letter ? `Remove ${letter}` : `Empty slot ${k + 1}`}
              className={cn(
                "display-serif flex h-12 w-10 items-center justify-center rounded-lg border-b-2 text-2xl font-semibold uppercase transition-colors sm:h-14 sm:w-12",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                done
                  ? answer.correct
                    ? "border-success bg-success/10 text-success"
                    : "border-foreground/40 bg-secondary/60"
                  : shaking
                    ? "border-destructive bg-destructive/10"
                    : letter
                      ? "border-primary bg-card"
                      : "border-border bg-secondary/40",
              )}
            >
              {letter}
            </button>
          );
        })}
      </motion.div>

      {/* The tiles. */}
      {!done && (
        <div role="group" aria-label="Letters" className="flex max-w-md flex-wrap justify-center gap-2">
          {question.tiles.map((t, i) => {
            const used = placed.includes(i);
            return (
              <motion.button
                key={i}
                type="button"
                disabled={!asking || used}
                onClick={() => place(i)}
                whileTap={reduceMotion ? undefined : { scale: 0.92 }}
                aria-label={`Letter ${t}`}
                className={cn(
                  "display-serif h-12 w-12 rounded-xl border text-xl font-semibold uppercase transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  used ? "border-transparent opacity-20" : "border-border bg-card shadow-sm [@media(hover:hover)]:hover:border-primary/60",
                )}
              >
                {t}
              </motion.button>
            );
          })}
        </div>
      )}

      {!done && (
        <Button type="button" variant="ghost" size="sm" onClick={hint} disabled={!asking || hinted}>
          <Lightbulb /> {hinted ? "First letter placed" : "Hint (half points)"}
        </Button>
      )}

      {done && (
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: EASE }}
          className="w-full max-w-sm rounded-xl border border-border bg-card p-4 text-left text-sm"
        >
          <p className="font-medium">
            <span className={answer.correct ? "text-success" : "text-foreground"}>
              {answer.correct ? "Solved" : "Time's up"}
            </span>
            {answer.correct && <span className="tabular ml-2 text-success">+{answer.points}</span>}
            {!answer.correct && (
              <span className="text-muted-foreground">
                {" — "}it was <span className="display-serif font-semibold text-foreground">{question.word}</span>.
              </span>
            )}
          </p>
          {question.explain.example && (
            <p className="mt-2 italic text-muted-foreground">“{question.explain.example}”</p>
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

/**
 * After a round: the result, then a review of every answer.
 *
 * Words right leads and points sit under it — points are the game, words are
 * the point. "New best" appears only when an earlier best was actually beaten;
 * a first round says it is the score to beat instead of praising 2 of 10.
 *
 * The one door from a game into the scheduler is here, and the user opens it:
 * "Review these in Flashcards" applies *again* to missed words they have
 * already studied. Nothing else a game does touches SM-2. See
 * docs/adr/0016-games-are-rounds-not-progression.md.
 *
 * Design: docs/GAMES-UI.md §1.6–1.7.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confetti, type ConfettiVariant } from "@/components/Confetti";
import { SpeakButton } from "@/components/SpeakButton";
import type { GameDefinition } from "@/lib/games/catalogue";
import { TIER_LABEL } from "@/lib/games/catalogue";
import type { BestOutcome } from "@/lib/games/scoring";
import type { AnswerRecord, GameRound } from "@/lib/games/types";
import { describeMonthKey } from "@/lib/track";
import { missedWordIds, tally } from "@/lib/games/session";
import { Spelling } from "@/components/games/SpellPanel";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

export interface ResultsProps {
  definition: GameDefinition;
  round: GameRound;
  answers: AnswerRecord[];
  score: number;
  outcome: BestOutcome;
  /** Missed words the user has studied — the only ones review can schedule. */
  reviewable: string[];
  /** wordId → month key, for saying where an unstudied word lives. */
  monthOf: Record<string, string>;
  reduceMotion: boolean;
  onReviewMissed: (wordIds: string[]) => void;
  onOpenLibrary: () => void;
  onPlayAgain: () => void;
  onExit: () => void;
}

export function GameResults(props: ResultsProps) {
  const { definition, round, answers, score, outcome, reviewable, reduceMotion } = props;
  const [reviewing, setReviewing] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  // Pairs for a Match Up round, questions everywhere else.
  const { right, total } = tally(round.questions, answers);
  const perfect = total > 0 && right === total;

  const celebration: ConfettiVariant | null = reduceMotion
    ? null
    : perfect
      ? "emoji"
      : outcome.kind === "new-best"
        ? "streamers"
        : null;

  const wordOf = new Map(
    round.questions.flatMap((q) =>
      q.kind === "match" ? q.pairs.map((p) => [p.wordId, p.word] as const) : [[q.wordId, q.word] as const],
    ),
  );
  const missedWords = missedWordIds(round.questions, answers).map((id) => wordOf.get(id) ?? id);

  return (
    <div className="relative mx-auto w-full max-w-xl py-10">
      {celebration && <Confetti variant={celebration} />}

      <motion.div
        className="text-center"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {definition.name} · {TIER_LABEL[round.tier]}
        </p>
        <h1 className="display-serif mt-4 text-6xl font-semibold tracking-tight">
          <CountUp to={right} reduceMotion={reduceMotion} /> <span className="text-muted-foreground">of</span>{" "}
          <span className="tabular">{total}</span>
          {perfect && "!"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">right</p>

        <p className="tabular mt-8 text-3xl font-semibold">
          <CountUp to={score} reduceMotion={reduceMotion} delay={300} /> <span className="text-base font-normal text-muted-foreground">pts</span>
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground" data-testid="best-line">
          {outcome.kind === "first" && `First round on ${TIER_LABEL[round.tier]}. This is the score to beat.`}
          {outcome.kind === "new-best" && (
            <span className="text-success">New best — up from {outcome.previous.toLocaleString()}.</span>
          )}
          {outcome.kind === "not-best" && `Best is ${outcome.best.toLocaleString()}.`}
        </p>
      </motion.div>

      {missedWords.length > 0 && (
        <motion.div
          className="mt-8 rounded-xl border border-border bg-card p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduceMotion ? 0 : 0.5, duration: 0.3 }}
        >
          <p className="text-sm">
            <span className="text-muted-foreground">Missed: </span>
            <span className="display-serif">{missedWords.join(" · ")}</span>
          </p>
          {reviewable.length > 0 && (
            <Button
              variant="outline"
              className="mt-3 w-full sm:w-auto"
              disabled={scheduled}
              onClick={() => {
                props.onReviewMissed(reviewable);
                setScheduled(true);
              }}
            >
              {scheduled
                ? "Added to today's reviews"
                : `Review ${reviewable.length === 1 ? "this" : `these ${reviewable.length}`} in Flashcards`}
            </Button>
          )}
        </motion.div>
      )}

      <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button size="lg" onClick={props.onPlayAgain} autoFocus>
          Play again
        </Button>
        <Button size="lg" variant="outline" onClick={() => setReviewing((v) => !v)} aria-expanded={reviewing}>
          {reviewing ? "Hide answers" : "Review answers"}
        </Button>
        <Button size="lg" variant="ghost" onClick={props.onExit}>
          Games
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {reviewing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.3, ease: EASE }}
            className="overflow-hidden"
          >
            <AnswerReview {...props} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AnswerReview({ round, answers, reviewable, monthOf, onReviewMissed, onOpenLibrary }: ResultsProps) {
  const [open, setOpen] = useState<number | null>(null);
  const [queued, setQueued] = useState<Set<string>>(new Set());
  const studied = new Set(reviewable);

  return (
    <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-card" aria-label="Your answers">
      {round.questions.map((q, i) => {
        const a = answers[i];
        const yours =
          q.kind === "spell"
            ? a?.typed ?? null
            : q.kind === "match"
              ? `${a?.matched ?? 0} of ${q.pairs.length} paired`
              : a?.chosen === null || a?.chosen === undefined
                ? null
                : q.options[a.chosen];
        const right =
          q.kind === "spell" ? q.word : q.kind === "match" ? "all five" : q.options[q.answer]!;
        const expanded = open === i;
        return (
          <li key={`${i}-${q.wordId}`}>
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : i)}
              aria-expanded={expanded}
              className="flex w-full items-start gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className="display-serif flex-1 text-lg font-semibold">{q.word}</span>
              <span className="text-right text-sm">
                <span className={cn("inline-flex items-center gap-1.5", a?.correct ? "text-success" : "text-destructive")}>
                  {a?.timedOut ? "Time's up" : yours ?? "—"}
                  {a?.correct ? <Check className="h-4 w-4" aria-label="right" /> : <X className="h-4 w-4" aria-label="wrong" />}
                </span>
                {!a?.correct && <span className="block text-muted-foreground">correct: {right}</span>}
              </span>
              <ChevronDown
                className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
                aria-hidden="true"
              />
            </button>
            {expanded && (
              <div className="space-y-3 px-4 pb-4 text-sm">
                {q.kind === "match" && (
                  <ul className="space-y-1 rounded-lg bg-secondary/40 p-3">
                    {q.pairs.map((p) => (
                      <li key={p.wordId}>
                        <span className="display-serif font-semibold">{p.word}</span>
                        <span className="text-muted-foreground"> — {p.match}</span>
                        {a?.missedIds?.includes(p.wordId) && <span className="ml-1 text-destructive">(unpaired)</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {q.kind === "spell" && a && !a.correct && (
                  <p>
                    It’s spelled <Spelling answer={q.word} typed={a.typed ?? ""} />.
                  </p>
                )}
                {q.kind === "verdict" && (
                  <div className="rounded-lg bg-secondary/40 p-3">
                    <p>{q.statement}</p>
                    <p className="mt-1 text-muted-foreground">
                      {q.answer === 0 ? "A fact." : "Fiction."} {q.explain.note}
                    </p>
                  </div>
                )}
                {q.kind === "choice" && q.sentence && (
                  <p className="rounded-lg bg-secondary/40 p-3">
                    {q.sentence.split("____").map((part, j, all) => (
                      <span key={j}>
                        {part}
                        {j < all.length - 1 && <span className="display-serif font-semibold text-success">{right}</span>}
                      </span>
                    ))}
                  </p>
                )}
                {q.kind === "choice" && q.trap !== undefined && a?.chosen === q.trap && q.explain.note && (
                  <p className="text-warning">{q.explain.note}</p>
                )}
                <div className="flex items-start gap-2">
                  <p className="flex-1">
                    <span className="italic text-muted-foreground">{q.partOfSpeech}</span> — {q.explain.definition}
                  </p>
                  <SpeakButton word={q.word} size="sm" />
                </div>
                {q.explain.example && <p className="italic text-muted-foreground">“{q.explain.example}”</p>}
                {studied.has(q.wordId) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={queued.has(q.wordId)}
                    onClick={() => {
                      onReviewMissed([q.wordId]);
                      setQueued((s) => new Set(s).add(q.wordId));
                    }}
                  >
                    {queued.has(q.wordId) ? "Added to today's reviews" : "Review in Flashcards"}
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Not in your notebook yet
                    {monthOf[q.wordId] ? ` — it's in ${describeMonthKey(monthOf[q.wordId]!)}` : ""}.{" "}
                    <button type="button" className="text-accent underline-offset-4 hover:underline" onClick={onOpenLibrary}>
                      Open the library
                    </button>
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Counts up to `to` once. Instant under reduced motion. */
function CountUp({ to, reduceMotion, delay = 0 }: { to: number; reduceMotion: boolean; delay?: number }) {
  const [value, setValue] = useState(reduceMotion ? to : 0);
  const done = useRef(false);
  useEffect(() => {
    if (reduceMotion || done.current) {
      setValue(to);
      return;
    }
    let frame = 0;
    const timer = window.setTimeout(() => {
      const start = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - start) / 600);
        setValue(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) frame = requestAnimationFrame(step);
        else done.current = true;
      };
      frame = requestAnimationFrame(step);
    }, delay);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [to, reduceMotion, delay]);
  return <span className="tabular">{value.toLocaleString()}</span>;
}

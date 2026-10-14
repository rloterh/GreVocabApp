/**
 * One round, full screen.
 *
 * Immersive on purpose: the sidebar, rail and tab bar are covered, global
 * shortcuts stand down, and system back pauses. A stray tap on "Cards"
 * mid-question should not be able to throw a round away. The pause sheet is
 * the only way out.
 *
 * All timing goes through the reducer in src/lib/games/session.ts with real
 * timestamps; this component only decides *when* to ask it the time. That is
 * why a backgrounded tab cannot gain or lose seconds: the clock is never
 * counted, only read. Hiding the page pauses the round anyway.
 *
 * Design: docs/GAMES-UI.md §1.3–1.5.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Pause, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GameDefinition } from "@/lib/games/catalogue";
import { TIER_LABEL } from "@/lib/games/catalogue";
import {
  createSession,
  reduce,
  remainingMs,
  type SessionEvent,
  type SessionState,
} from "@/lib/games/session";
import type { GameRound, GameTimer } from "@/lib/games/types";
import { playSound } from "@/lib/sound";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { isTypingTarget } from "@/lib/shortcuts";
import { spelledRight } from "@/lib/games/builders/spell";
import { MatchBoard, MISMATCH_PENALTY_MS } from "@/components/games/MatchBoard";
import { SpellPanel } from "@/components/games/SpellPanel";
import { TilesPanel } from "@/components/games/TilesPanel";
import { PictureDiagram } from "@/components/games/PictureDiagram";
import { diagramById } from "@/lib/games/pictures/round";
import { useAppStore } from "@/store/useAppStore";
import { useSettingsStore } from "@/store/useSettingsStore";

const EASE = [0.16, 1, 0.3, 1] as const;
/** How long a question takes to enter; the clock starts after it. */
const ENTER_MS = 320;
/** How long right/wrong stays on screen before the next question. */
const FEEDBACK_MS = 900;
/** Options this short sit two by two from `md` up. */
const SHORT_OPTION = 18;
/** How often the digits and the time-out check refresh. */
const TICK_MS = 100;

export function GameStage({
  definition,
  round,
  timer,
  limitMs,
  onFinish,
  onRestart,
  onQuit,
}: {
  definition: GameDefinition;
  round: GameRound;
  /** The timer setting the round started under; changes apply next round. */
  timer: GameTimer;
  limitMs: number | null;
  onFinish: (state: SessionState) => void;
  onRestart: () => void;
  onQuit: () => void;
}) {
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const soundOn = useSettingsStore((s) => s.soundEnabled);
  const gameTimer = useSettingsStore((s) => s.gameTimer);
  const setSettings = useSettingsStore((s) => s.set);
  const setImmersive = useAppStore((s) => s.setImmersive);
  const setBackHandler = useAppStore((s) => s.setBackHandler);

  const questions = round.questions;
  const [state, setState] = useState<SessionState>(() =>
    createSession(questions, round.tier, limitMs),
  );
  const [now, setNow] = useState(() => performance.now());
  const [holding, setHolding] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const finished = useRef(false);
  const warned = useRef(-1);
  const lastTickSecond = useRef<number | null>(null);

  const dispatch = useCallback(
    (event: SessionEvent) => setState((s) => reduce(s, event, questions)),
    [questions],
  );

  const question = questions[state.index];
  const enterMs = reduceMotion ? 0 : ENTER_MS;

  // ── Immersion: shortcuts off, back pauses ────────────────────────────
  useEffect(() => {
    setImmersive(true);
    return () => setImmersive(false);
  }, [setImmersive]);

  useEffect(() => {
    setBackHandler(() => {
      dispatch({ type: "PAUSE", now: performance.now() });
      return true;
    });
    return () => setBackHandler(null);
  }, [dispatch, setBackHandler]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") dispatch({ type: "PAUSE", now: performance.now() });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [dispatch]);

  // ── The round's lifecycle ─────────────────────────────────────────────
  useEffect(() => {
    playSound("start");
    dispatch({ type: "START", now: performance.now() });
  }, [dispatch]);

  // Arm the clock once the question has finished entering.
  useEffect(() => {
    if (state.phase !== "entering") return;
    const timer = window.setTimeout(() => dispatch({ type: "ARM", now: performance.now() }), enterMs);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.index, enterMs, dispatch]);

  // While asking: refresh the digits, check for a time-out, tick the last
  // three seconds.
  useEffect(() => {
    if (state.phase !== "asking") return;
    const timer = window.setInterval(() => {
      const t = performance.now();
      setNow(t);
      dispatch({ type: "TICK", now: t });
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [state.phase, dispatch]);

  const remaining = remainingMs(state, now);
  const seconds = remaining === null ? null : Math.ceil(remaining / 1000);

  useEffect(() => {
    if (state.phase !== "asking" || seconds === null || state.limitMs === null) return;
    if (seconds <= 3 && seconds > 0 && lastTickSecond.current !== seconds) {
      lastTickSecond.current = seconds;
      playSound("tick");
    }
    // Once per question, at a quarter of the time left: the timer is never
    // the only signal, and a screen reader cannot see a bar.
    if (remaining !== null && remaining <= state.limitMs / 4 && warned.current !== state.index) {
      warned.current = state.index;
      setAnnouncement(`${seconds} seconds left`);
    }
  }, [seconds, remaining, state.phase, state.index, state.limitMs]);

  // Announce each question as it arrives.
  useEffect(() => {
    if (state.phase === "entering" && question) {
      lastTickSecond.current = null;
      // Never the word itself for a gap or a spelling — announcing it would
      // give it away.
      const prompt =
        question.kind === "verdict"
          ? question.statement
          : question.kind === "spell"
            ? `Spell the word. ${question.definition}`
            : question.kind === "tiles"
              ? `Unscramble ${question.tiles.length} letters. ${question.definition}`
            : question.kind === "match"
              ? `Match ${question.pairs.length} words to their meanings`
              : question.kind === "picture"
                ? `What is this part called? ${diagramById(question.diagram)?.title ?? ""}, one part highlighted.`
                : question.ask ?? question.sentence?.replace(/____/g, "blank") ?? question.word;
      setAnnouncement(`Question ${state.index + 1} of ${state.total}: ${prompt}`);
    }
  }, [state.phase, state.index, state.total, question]);

  // React to the answer just recorded.
  const lastAnswer = state.answers[state.index];
  useEffect(() => {
    if (state.phase !== "feedback" || !lastAnswer || !question) return;
    const right =
      question.kind === "match"
        ? `${lastAnswer.matched ?? 0} of ${question.pairs.length} paired`
        : question.kind === "spell" || question.kind === "tiles"
          ? `spelled ${[...question.word].join(" ")}`
          : question.options[question.answer];
    if (lastAnswer.correct) {
      playSound("correct");
      haptic("correct");
      setAnnouncement(`Correct. Plus ${lastAnswer.points}.`);
    } else if (lastAnswer.timedOut) {
      playSound("timeout");
      setAnnouncement(`Time's up. The answer was ${right}.`);
    } else {
      playSound("wrong");
      haptic("wrong");
      setAnnouncement(`Not quite. The answer was ${right}.`);
    }
  }, [state.phase, lastAnswer, question]);

  // Move on after feedback, unless a finger is holding it on screen — or the
  // question has an explanation to read. Fact or Fiction's "why" is the
  // learning moment, so it waits for Continue and the clock stays stopped.
  const waitsForContinue =
    question?.kind === "verdict" ||
    question?.kind === "match" ||
    question?.kind === "spell" ||
    question?.kind === "tiles";
  useEffect(() => {
    if (state.phase !== "feedback" || holding || waitsForContinue) return;
    const timer = window.setTimeout(() => dispatch({ type: "NEXT", now: performance.now() }), FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.index, holding, waitsForContinue, dispatch]);

  useEffect(() => {
    if (state.phase === "finished" && !finished.current) {
      finished.current = true;
      onFinish(state);
    }
  }, [state, onFinish]);

  // ── Keyboard ───────────────────────────────────────────────────────────
  const choose = useCallback(
    (choice: number) => dispatch({ type: "ANSWER", choice, now: performance.now() }),
    [dispatch],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // "p" is a letter to someone spelling a word — in Spell It's field, and
      // anywhere on an Unscramble board, which takes typed letters with no
      // field at all. Only Escape pauses there.
      const typing = isTypingTarget(e.target) || question?.kind === "tiles";
      if (e.key === "Escape" || (!typing && (e.key === "p" || e.key === "P"))) {
        e.preventDefault();
        dispatch({ type: state.phase === "paused" ? "RESUME" : "PAUSE", now: performance.now() });
        return;
      }
      // Match Up and Spell It are played on their own controls.
      if (typing || question?.kind === "match" || question?.kind === "spell") {
        if (state.phase === "feedback" && e.key === "Enter" && !typing) {
          e.preventDefault();
          dispatch({ type: "NEXT", now: performance.now() });
        }
        return;
      }
      const count = question?.options.length ?? 0;
      if (state.phase === "asking" && /^[1-9]$/.test(e.key) && Number(e.key) <= count) {
        e.preventDefault();
        choose(Number(e.key) - 1);
      } else if (state.phase === "asking" && count === 2 && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        // Fact on the left, Fiction on the right — as they sit on screen.
        e.preventDefault();
        choose(e.key === "ArrowLeft" ? 0 : 1);
      } else if (state.phase === "feedback" && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        dispatch({ type: "NEXT", now: performance.now() });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.phase, question, choose, dispatch]);

  const pause = () => dispatch({ type: "PAUSE", now: performance.now() });
  const next = useCallback(() => dispatch({ type: "NEXT", now: performance.now() }), [dispatch]);
  const onMatch = useCallback(
    (wordId: string) => {
      playSound("correct");
      dispatch({ type: "MATCH", wordId, now: performance.now() });
    },
    [dispatch],
  );
  const onMiss = useCallback(() => {
    playSound("wrong");
    haptic("wrong");
    dispatch({ type: "PENALTY", ms: MISMATCH_PENALTY_MS });
  }, [dispatch]);
  const resume = () => {
    setNow(performance.now());
    dispatch({ type: "RESUME", now: performance.now() });
  };

  const twoByTwo = useMemo(
    () => (question ? question.options.every((o) => o.length <= SHORT_OPTION) : false),
    [question],
  );

  const showingPrompt = state.phase !== "paused" && state.phase !== "ready" && question;
  const fraction = remaining === null || state.limitMs === null ? 1 : remaining / state.limitMs;
  const urgent = seconds !== null && seconds <= 3 && state.phase === "asking";

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-background text-foreground"
      style={{
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
      onPointerDown={() => state.phase === "feedback" && setHolding(true)}
      onPointerUp={() => setHolding(false)}
      onPointerCancel={() => setHolding(false)}
      data-testid="game-stage"
    >
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {/* HUD */}
      <div className="mx-auto w-full max-w-[640px] px-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={pause}
            aria-label="Pause"
            disabled={state.phase === "paused" || state.phase === "finished"}
          >
            <Pause />
          </Button>
          <div className="flex flex-1 items-center gap-1" aria-hidden="true">
            {questions.map((_, i) => {
              const answer = state.answers[i];
              return (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors duration-300",
                    answer ? (answer.correct ? "bg-success" : "bg-destructive/70") : i === state.index ? "bg-foreground/40" : "bg-border",
                  )}
                />
              );
            })}
          </div>
          <p className="tabular text-xs text-muted-foreground w-10 text-right">
            {Math.min(state.index + 1, state.total)}/{state.total}
          </p>
          <Score value={state.score} reduceMotion={reduceMotion} />
        </div>

        {/* Time bar */}
        <div className="mt-3 flex items-center gap-3">
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-border/60">
            <div
              className={cn(
                "absolute inset-y-0 left-0 w-full origin-left rounded-full transition-colors duration-200",
                urgent ? "bg-destructive" : fraction <= 0.5 ? "bg-warning" : "bg-primary",
              )}
              style={{ transform: `scaleX(${Math.max(0, Math.min(1, fraction))})` }}
            />
          </div>
          <p
            className={cn("tabular w-9 text-right text-sm font-medium", urgent ? "text-destructive" : "text-muted-foreground")}
            aria-hidden="true"
          >
            {seconds === null ? "∞" : `:${String(seconds).padStart(2, "0")}`}
          </p>
        </div>
      </div>

      {/* Prompt and options. On a phone the options anchor to the bottom, in
          reach of a thumb; with room to spare they sit with the word. */}
      <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col px-4 md:justify-center">
        <AnimatePresence mode="wait">
          {showingPrompt && (question.kind === "match" || question.kind === "spell" || question.kind === "tiles") && (
            <motion.div
              // Distinct from the question branch's key below: two siblings under
              // one AnimatePresence sharing a key can leave a ghost copy mid-exit.
              key={`panel-${state.index}`}
              className="flex flex-1 flex-col"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: reduceMotion ? 0.15 : 0.32, ease: EASE }}
            >
              {question.kind === "match" ? (
                <MatchBoard
                  question={question}
                  phase={state.phase}
                  matchedIds={state.matchedIds}
                  answer={lastAnswer}
                  reduceMotion={reduceMotion}
                  onMatch={onMatch}
                  onMiss={onMiss}
                  onContinue={next}
                />
              ) : question.kind === "tiles" ? (
                <TilesPanel
                  question={question}
                  phase={state.phase}
                  answer={lastAnswer}
                  reduceMotion={reduceMotion}
                  onSolve={(hinted) =>
                    dispatch({ type: "ANSWER", choice: 0, now: performance.now(), typed: question.word, hinted })
                  }
                  onMiss={() => {
                    playSound("wrong");
                    haptic("wrong");
                  }}
                  onContinue={next}
                />
              ) : (
                <SpellPanel
                  question={question}
                  phase={state.phase}
                  answer={lastAnswer}
                  reduceMotion={reduceMotion}
                  onSubmit={(typed, hinted) =>
                    dispatch({
                      type: "ANSWER",
                      choice: spelledRight(typed, question.word) ? 0 : -1,
                      now: performance.now(),
                      typed,
                      hinted,
                    })
                  }
                  onContinue={next}
                />
              )}
            </motion.div>
          )}
          {showingPrompt && question.kind !== "match" && question.kind !== "spell" && question.kind !== "tiles" && (
            <motion.div
              key={`question-${state.index}`}
              className="flex flex-1 flex-col md:flex-none"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: reduceMotion ? 0.15 : 0.32, ease: EASE }}
            >
              <div className="flex flex-1 flex-col items-center justify-center py-6 text-center md:flex-none md:pb-12 md:pt-0">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {question.kind === "picture" ? definition.instruction : question.instruction ?? definition.instruction}
                  {question.kind === "choice" && question.sentence && (
                    <span className="normal-case tracking-normal"> · any form of the word</span>
                  )}
                </p>
                {question.kind === "picture" ? (
                  <PicturePrompt diagramId={question.diagram} part={question.part} />
                ) : question.kind === "verdict" ? (
                  <h2 className="mt-4 max-w-[34rem] text-balance text-[clamp(1.35rem,4.5vw,2rem)] font-medium leading-snug">
                    <Quoted text={question.statement} />
                  </h2>
                ) : question.sentence ? (
                  <h2 className="mt-4 max-w-[34rem] text-balance text-[clamp(1.25rem,4vw,1.75rem)] leading-relaxed">
                    <Gapped
                      sentence={question.sentence}
                      filled={state.phase === "feedback" ? question.options[question.answer]! : null}
                    />
                  </h2>
                ) : question.kind === "choice" && question.ask ? (
                  <h2 className="display-serif mt-4 text-[clamp(1.75rem,5.5vw,2.75rem)] font-semibold leading-tight tracking-tight">
                    {question.ask}
                  </h2>
                ) : (
                  <>
                    <h2 className="display-serif mt-3 break-words text-[clamp(2.5rem,8vw,4.5rem)] font-semibold leading-none tracking-tight">
                      {question.word}
                    </h2>
                    <p className="mt-3 text-xs italic text-muted-foreground">{question.partOfSpeech}</p>
                  </>
                )}
              </div>

              <div
                role="radiogroup"
                aria-label={
                  question.kind === "verdict"
                    ? question.statement
                    : question.kind === "picture"
                      ? definition.instruction
                      : `${question.instruction ?? definition.instruction}: ${question.sentence ?? question.word}`
                }
                className={cn(
                  "grid gap-2.5 pb-2",
                  question.kind === "verdict" || question.kind === "picture" || (question.kind === "choice" && question.ask)
                    ? "grid-cols-2"
                    : twoByTwo
                      ? "grid-cols-1 md:grid-cols-2"
                      : "grid-cols-1",
                )}
              >
                {question.options.map((option, i) => (
                  <OptionButton
                    key={`${state.index}-${option}`}
                    index={i}
                    label={option}
                    state={optionState(state, i, question.answer)}
                    disabled={state.phase !== "asking"}
                    reduceMotion={reduceMotion}
                    delay={reduceMotion ? 0 : i * 0.04}
                    compact={question.kind === "verdict"}
                    onChoose={() => choose(i)}
                  />
                ))}
              </div>

              <div className="min-h-[3.5rem] pt-2 text-center">
                {state.phase === "feedback" && lastAnswer && question.kind === "verdict" && (
                  <motion.div
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.28, ease: EASE }}
                    className="mt-2 rounded-xl border border-border bg-card p-4 text-left text-sm"
                  >
                    <p className="font-medium">
                      <span className={lastAnswer.correct ? "text-success" : "text-foreground"}>
                        {lastAnswer.timedOut ? "Time's up" : lastAnswer.correct ? "Correct" : "Not quite"}
                      </span>
                      <span className="text-muted-foreground">
                        {" — "}that's {question.answer === 0 ? "a fact" : "fiction"}.
                      </span>
                      {lastAnswer.correct && (
                        <span className="tabular ml-2 text-success">+{lastAnswer.points}</span>
                      )}
                    </p>
                    {question.explain.note && <p className="mt-2">{question.explain.note}</p>}
                    <p className="mt-2 text-muted-foreground">
                      <span className="display-serif text-foreground">{question.word}</span>: {question.explain.definition}
                    </p>
                    {question.explain.example && (
                      <p className="mt-1 italic text-muted-foreground">“{question.explain.example}”</p>
                    )}
                    <div className="mt-3 flex justify-end">
                      <Button
                        size="sm"
                        autoFocus
                        onClick={(e) => {
                          e.stopPropagation();
                          dispatch({ type: "NEXT", now: performance.now() });
                        }}
                      >
                        Continue
                      </Button>
                    </div>
                  </motion.div>
                )}
                {state.phase === "feedback" && lastAnswer && question.kind === "choice" && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                    className="text-sm text-muted-foreground"
                  >
                    <span className={cn("tabular font-medium", lastAnswer.correct ? "text-success" : "text-muted-foreground")}>
                      {lastAnswer.timedOut ? "Time's up" : lastAnswer.correct ? `+${lastAnswer.points}` : "+0"}
                    </span>
                    <span className="mx-2 opacity-50">·</span>
                    {lastAnswer.chosen !== null && lastAnswer.chosen === question.trap && question.explain.note ? (
                      question.explain.note
                    ) : (
                      <>
                        <span className="display-serif text-foreground">{question.word}</span>: {question.explain.definition}
                      </>
                    )}
                  </motion.p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Pause sheet. The prompt is hidden behind it, so pausing cannot buy
          time to think. */}
      <AnimatePresence>
        {state.phase === "paused" && (
          <motion.div
            className="absolute inset-0 z-10 flex items-end justify-center bg-background/80 backdrop-blur-md sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="pause-title"
              className="w-full max-w-sm rounded-t-2xl border border-border bg-card p-6 shadow-2xl sm:rounded-2xl"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: EASE }}
              style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
            >
              <p id="pause-title" className="display-serif text-xl font-semibold">Paused</p>
              <p className="tabular mt-1 text-sm text-muted-foreground">
                {definition.name} · {TIER_LABEL[round.tier]} · {Math.min(state.index + 1, state.total)} of {state.total} ·{" "}
                {state.score.toLocaleString()} pts
              </p>
              <div className="mt-5 grid gap-2">
                <Button size="lg" onClick={resume} autoFocus>
                  Resume
                </Button>
                <Button size="lg" variant="outline" onClick={onRestart}>
                  Restart this round
                </Button>
                <Button size="lg" variant="ghost" onClick={onQuit}>
                  Quit to Games
                </Button>
              </div>
              <div className="mt-5 space-y-3 border-t border-border pt-4 text-sm">
                <Segmented
                  label="Sound"
                  value={soundOn ? "on" : "off"}
                  options={[
                    { value: "on", label: "On" },
                    { value: "off", label: "Off" },
                  ]}
                  onChange={(v) => setSettings({ soundEnabled: v === "on" })}
                />
                <Segmented
                  label="Timer"
                  value={gameTimer}
                  options={[
                    { value: "standard", label: "Standard" },
                    { value: "relaxed", label: "Relaxed" },
                    { value: "off", label: "Off" },
                  ]}
                  onChange={(v) => setSettings({ gameTimer: v as GameTimer })}
                />
                {gameTimer !== timer && (
                  <p className="text-xs text-muted-foreground">The new timer starts with your next round.</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Picture It's prompt: what the object is, and the drawing with one part lit. */
function PicturePrompt({ diagramId, part }: { diagramId: string; part: string }) {
  const diagram = diagramById(diagramId);
  if (!diagram) return null;
  return (
    <div className="mt-2 w-full max-w-[30rem]">
      <p className="text-sm text-muted-foreground">{diagram.title}</p>
      <PictureDiagram diagram={diagram} highlight={part} className="mt-2 max-h-[38vh]" />
    </div>
  );
}

/** A statement with its “quoted” words set in the word face. */
function Quoted({ text }: { text: string }) {
  return (
    <>
      {text.split(/(“[^”]+”)/).map((part, i) =>
        part.startsWith("“") ? (
          <span key={i} className="display-serif font-semibold">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** A sentence with its gap drawn as a line — and, once answered, the word in it. */
function Gapped({ sentence, filled }: { sentence: string; filled: string | null }) {
  const parts = sentence.split("____");
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <span
              className={cn(
                "mx-1 inline-block min-w-[5ch] border-b-2 px-1 text-center align-baseline",
                filled ? "display-serif border-success font-semibold text-success" : "border-primary/70",
              )}
            >
              {filled ?? <span className="sr-only">blank</span>}
              {!filled && <span aria-hidden="true">&nbsp;</span>}
            </span>
          )}
        </span>
      ))}
    </>
  );
}

type OptionState = "idle" | "chosen-right" | "chosen-wrong" | "right" | "faded";

/** How option `i` looks: both your pick and the right answer are marked. */
function optionState(state: SessionState, i: number, key: number): OptionState {
  const answer = state.answers[state.index];
  if (state.phase !== "feedback" || !answer) return "idle";
  if (answer.chosen === i) return answer.correct ? "chosen-right" : "chosen-wrong";
  return i === key ? "right" : "faded";
}

function OptionButton({
  index,
  label,
  state,
  disabled,
  reduceMotion,
  delay,
  onChoose,
  compact = false,
}: {
  index: number;
  label: string;
  state: OptionState;
  disabled: boolean;
  reduceMotion: boolean;
  delay: number;
  onChoose: () => void;
  /** Half-width (Fact | Fiction): the label wraps, so the cross says it alone. */
  compact?: boolean;
}) {
  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={state === "chosen-right" || state === "chosen-wrong"}
      disabled={disabled}
      onClick={onChoose}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={
        state === "chosen-wrong" && !reduceMotion
          ? { opacity: 1, y: 0, x: [0, -4, 4, -4, 4, 0] }
          : { opacity: state === "faded" ? 0.4 : 1, y: 0, x: 0 }
      }
      transition={{ duration: state === "chosen-wrong" ? 0.3 : 0.24, delay: state === "idle" ? delay : 0, ease: EASE }}
      whileTap={disabled || reduceMotion ? undefined : { scale: 0.98 }}
      className={cn(
        "group relative flex min-h-[3.25rem] w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-base font-medium transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-default",
        // Hover only where there is real hover: on a touch screen it sticks to
        // whatever was last tapped and reads as a selection.
        state === "idle" &&
          "border-border bg-card [@media(hover:hover)]:hover:border-primary/60 [@media(hover:hover)]:hover:bg-primary/5",
        (state === "chosen-right" || state === "right") && "border-success bg-success text-success-foreground",
        state === "chosen-wrong" && "border-destructive/60 bg-destructive/10",
        state === "faded" && "border-border bg-card",
      )}
    >
      <span
        className={cn(
          "tabular hidden w-4 text-xs text-muted-foreground [@media(pointer:fine)]:inline",
          (state === "chosen-right" || state === "right") && "text-success-foreground/80",
        )}
        aria-hidden="true"
      >
        {index + 1}
      </span>
      <span className="flex-1">{label}</span>
      {(state === "chosen-right" || state === "right") && <Check className="h-5 w-5" aria-label="Correct answer" />}
      {state === "chosen-wrong" && (
        <span className="flex items-center gap-1.5 text-xs text-destructive">
          <span className={compact ? "sr-only" : undefined}>Your answer</span>
          <X className="h-4 w-4" aria-hidden="true" />
        </span>
      )}
    </motion.button>
  );
}

/** The score, counting up to each new value. Instant under reduced motion. */
function Score({ value, reduceMotion }: { value: number; reduceMotion: boolean }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduceMotion || value === from.current) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 400);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(origin + (value - origin) * eased));
      if (p < 1) frame = requestAnimationFrame(step);
      else from.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, reduceMotion]);
  return (
    <p className="tabular min-w-[4.5rem] text-right text-sm font-semibold" aria-label={`Score ${value}`}>
      {shown.toLocaleString()}
      <span className="ml-1 text-xs font-normal text-muted-foreground">pts</span>
    </p>
  );
}

function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex gap-0.5 rounded-lg border border-border bg-secondary/40 p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-[2.25rem] rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Flame,
  Keyboard,
  Layers,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  Sparkles,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/EmptyState";
import { JsonImporter } from "@/components/JsonImporter";
import { useVocabStore } from "@/store/useVocabStore";
import { useProgressStore } from "@/store/useProgressStore";
import { useAppStore } from "@/store/useAppStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { allWordsInMonth } from "@/lib/vocabulary";
import { cn, shuffle as shuffleArr } from "@/lib/utils";
import type {
  StudyDeck,
  StudyEvent,
  StudyRating,
  StudySession,
  VocabWord,
} from "@/types";

type Screen = "setup" | "playing" | "results";

interface EnrichedWord extends VocabWord {
  monthKey: string;
  monthName: string;
  day: number;
}

const RATING_META: Record<
  StudyRating,
  {
    label: string;
    shortcut: string;
    hint: string;
    color: string;
    ringColor: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  again: {
    label: "Again",
    shortcut: "1",
    hint: "Didn't know it",
    color: "bg-destructive/15 border-destructive/40 text-destructive hover:bg-destructive/25",
    ringColor: "hsl(var(--destructive))",
    icon: X,
  },
  hard: {
    label: "Hard",
    shortcut: "2",
    hint: "Almost had it",
    color: "bg-warning/15 border-warning/40 text-warning hover:bg-warning/25",
    ringColor: "hsl(var(--warning))",
    icon: Flame,
  },
  good: {
    label: "Good",
    shortcut: "3",
    hint: "Got it",
    color: "bg-accent/15 border-accent/40 text-accent hover:bg-accent/25",
    ringColor: "hsl(var(--accent))",
    icon: Check,
  },
  easy: {
    label: "Easy",
    shortcut: "4",
    hint: "Too easy!",
    color: "bg-success/15 border-success/40 text-success hover:bg-success/25",
    ringColor: "hsl(var(--success))",
    icon: Zap,
  },
};

export function Flashcards() {
  const { months, activeMonthKey, selectedDay, getActiveMonth } = useVocabStore();
  const applyStudyRating = useProgressStore((s) => s.applyStudyRating);
  const addStudySession = useProgressStore((s) => s.addStudySession);
  const isMastered = useProgressStore((s) => s.isMastered);
  const showToast = useAppStore((s) => s.showToast);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);

  const [screen, setScreen] = useState<Screen>("setup");
  const [deck, setDeck] = useState<StudyDeck>("month");
  const [doShuffle, setDoShuffle] = useState(true);
  const [cardLimit, setCardLimit] = useState(15);

  // Session state
  const [cards, setCards] = useState<EnrichedWord[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [events, setEvents] = useState<StudyEvent[]>([]);
  const [sessionStreak, setSessionStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [pulseColor, setPulseColor] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  const startedAtRef = useRef<number>(0);
  const cardShownAtRef = useRef<number>(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Build available pools
  const allEnriched: EnrichedWord[] = useMemo(() => {
    return Object.values(months).flatMap((m) =>
      m.days.flatMap((d) =>
        d.words.map((w) => ({
          ...w,
          monthKey: m.month,
          monthName: m.displayName,
          day: d.day,
        })),
      ),
    );
  }, [months]);

  const activeMonth = getActiveMonth();
  const activeMonthWords: EnrichedWord[] = useMemo(() => {
    if (!activeMonth) return [];
    return allWordsInMonth(activeMonth).map((w) => ({
      ...w,
      monthKey: activeMonth.month,
      monthName: activeMonth.displayName,
      day: activeMonth.days.find((d) => d.words.some((x) => x.id === w.id))?.day ?? 1,
    }));
  }, [activeMonth]);

  const dayWords: EnrichedWord[] = useMemo(() => {
    if (!activeMonth) return [];
    const day = activeMonth.days.find((d) => d.day === selectedDay);
    if (!day) return [];
    return day.words.map((w) => ({
      ...w,
      monthKey: activeMonth.month,
      monthName: activeMonth.displayName,
      day: selectedDay,
    }));
  }, [activeMonth, selectedDay]);

  const masteredPool = useMemo(
    () => allEnriched.filter((w) => isMastered(w.id)),
    [allEnriched, isMastered],
  );
  const unmasteredPool = useMemo(
    () => allEnriched.filter((w) => !isMastered(w.id)),
    [allEnriched, isMastered],
  );

  function poolFor(d: StudyDeck): EnrichedWord[] {
    switch (d) {
      case "month":
        return activeMonthWords;
      case "day":
        return dayWords;
      case "mastered":
        return masteredPool;
      case "unmastered":
        return unmasteredPool;
      case "all":
      default:
        return allEnriched;
    }
  }
  const availableCount = poolFor(deck).length;

  const startSession = useCallback(() => {
    const pool = poolFor(deck);
    if (pool.length === 0) return;
    const size = Math.min(cardLimit, pool.length);
    const chosen = doShuffle
      ? shuffleArr(pool).slice(0, size)
      : pool.slice(0, size);
    setCards(chosen);
    setIdx(0);
    setFlipped(false);
    setEvents([]);
    setSessionStreak(0);
    setBestStreak(0);
    setPulseColor(null);
    startedAtRef.current = Date.now();
    cardShownAtRef.current = Date.now();
    setElapsedMs(0);
    setScreen("playing");
  }, [deck, cardLimit, doShuffle, activeMonthWords, dayWords, masteredPool, unmasteredPool, allEnriched]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentCard = cards[idx];

  const rate = useCallback(
    (rating: StudyRating) => {
      if (!currentCard) return;
      const msToRate = Date.now() - cardShownAtRef.current;
      const event: StudyEvent = { wordId: currentCard.id, rating, msToRate };
      const nextEvents = [...events, event];
      setEvents(nextEvents);

      // Apply to progress
      applyStudyRating(currentCard.id, currentCard.monthKey, rating);

      // Streak logic — good & easy extend, hard maintains, again breaks
      const nextStreak =
        rating === "again"
          ? 0
          : rating === "hard"
            ? sessionStreak
            : sessionStreak + 1;
      setSessionStreak(nextStreak);
      if (nextStreak > bestStreak) setBestStreak(nextStreak);

      // Pulse
      setPulseColor(RATING_META[rating].ringColor);
      setTimeout(() => setPulseColor(null), 350);

      // Advance
      if (idx + 1 >= cards.length) {
        const finishedAt = Date.now();
        const session: StudySession = {
          id: `s-${finishedAt}`,
          startedAt: new Date(startedAtRef.current).toISOString(),
          finishedAt: new Date(finishedAt).toISOString(),
          deck,
          deckContext:
            deck === "month" || deck === "day" ? activeMonthKey ?? undefined : undefined,
          cardCount: cards.length,
          events: nextEvents,
          bestStreak: Math.max(bestStreak, nextStreak),
          totalMs: finishedAt - startedAtRef.current,
        };
        addStudySession(session);
        setScreen("results");
      } else {
        setIdx((i) => i + 1);
        setFlipped(false);
        cardShownAtRef.current = Date.now();
      }
    },
    [currentCard, events, cards, idx, sessionStreak, bestStreak, deck, activeMonthKey, applyStudyRating, addStudySession],
  );

  const restart = useCallback(() => {
    setScreen("setup");
    setCards([]);
    setIdx(0);
    setEvents([]);
    setFlipped(false);
  }, []);

  // Timer tick while playing
  useEffect(() => {
    if (screen !== "playing" || paused) return;
    const id = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 250);
    return () => clearInterval(id);
  }, [screen, paused]);

  // Keyboard shortcuts
  useEffect(() => {
    if (screen !== "playing" || paused) return;
    function onKey(e: KeyboardEvent) {
      // Don't hijack if typing in an input
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "1" && flipped) rate("again");
      else if (e.key === "2" && flipped) rate("hard");
      else if (e.key === "3" && flipped) rate("good");
      else if (e.key === "4" && flipped) rate("easy");
      else if (e.key === "ArrowLeft" && idx > 0) {
        setIdx((i) => i - 1);
        setFlipped(false);
      } else if (e.key === "ArrowRight" && idx < cards.length - 1) {
        setIdx((i) => i + 1);
        setFlipped(false);
      } else if (e.key === "Escape") setPaused(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, paused, flipped, idx, cards.length, rate]);

  function speak() {
    if (!currentCard || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(currentCard.word);
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  }

  if (allEnriched.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <EmptyState
          icon={Layers}
          title="No cards to study yet"
          description="Load a month of vocabulary first, then come back for a study session."
          action={<JsonImporter />}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <AnimatePresence mode="wait">
        {screen === "setup" && (
          <SetupScreen
            key="setup"
            deck={deck}
            setDeck={setDeck}
            doShuffle={doShuffle}
            setDoShuffle={setDoShuffle}
            cardLimit={cardLimit}
            setCardLimit={setCardLimit}
            availableCount={availableCount}
            counts={{
              day: dayWords.length,
              month: activeMonthWords.length,
              mastered: masteredPool.length,
              unmastered: unmasteredPool.length,
              all: allEnriched.length,
            }}
            activeMonthName={activeMonth?.displayName ?? "—"}
            selectedDay={selectedDay}
            onStart={startSession}
          />
        )}
        {screen === "playing" && currentCard && (
          <PlayScreen
            key="playing"
            card={currentCard}
            idx={idx}
            total={cards.length}
            flipped={flipped}
            setFlipped={setFlipped}
            sessionStreak={sessionStreak}
            elapsedMs={elapsedMs}
            pulseColor={pulseColor}
            paused={paused}
            setPaused={setPaused}
            reduceMotion={reduceMotion}
            onRate={rate}
            onSpeak={speak}
            onQuit={() => {
              if (
                events.length > 0 &&
                !confirm("Quit this session? Your ratings so far will still count.")
              ) {
                return;
              }
              restart();
            }}
            onPrev={() => {
              if (idx > 0) {
                setIdx(idx - 1);
                setFlipped(false);
                cardShownAtRef.current = Date.now();
              }
            }}
            onNext={() => {
              if (idx < cards.length - 1) {
                setIdx(idx + 1);
                setFlipped(false);
                cardShownAtRef.current = Date.now();
              }
            }}
          />
        )}
        {screen === "results" && (
          <ResultsScreen
            key="results"
            cards={cards}
            events={events}
            bestStreak={bestStreak}
            totalMs={Date.now() - startedAtRef.current}
            onStudyAgain={startSession}
            onNewDeck={restart}
            onShare={() => {
              const correct = events.filter(
                (e) => e.rating === "good" || e.rating === "easy",
              ).length;
              const text = `📚 Studied ${cards.length} words on Lexicon — ${correct} nailed, best streak ${bestStreak}!`;
              navigator.clipboard?.writeText(text);
              showToast({ title: "Copied to clipboard", variant: "success" });
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------- */

function SetupScreen({
  deck,
  setDeck,
  doShuffle,
  setDoShuffle,
  cardLimit,
  setCardLimit,
  availableCount,
  counts,
  activeMonthName,
  selectedDay,
  onStart,
}: {
  deck: StudyDeck;
  setDeck: (d: StudyDeck) => void;
  doShuffle: boolean;
  setDoShuffle: (v: boolean) => void;
  cardLimit: number;
  setCardLimit: (n: number) => void;
  availableCount: number;
  counts: Record<StudyDeck, number>;
  activeMonthName: string;
  selectedDay: number;
  onStart: () => void;
}) {
  const deckOptions: Array<{
    v: StudyDeck;
    label: string;
    sub: string;
    count: number;
  }> = [
    {
      v: "day",
      label: `Day ${selectedDay}`,
      sub: activeMonthName,
      count: counts.day,
    },
    {
      v: "month",
      label: "Current month",
      sub: activeMonthName,
      count: counts.month,
    },
    {
      v: "unmastered",
      label: "Still learning",
      sub: "Words not yet mastered",
      count: counts.unmastered,
    },
    {
      v: "mastered",
      label: "Refresh mastered",
      sub: "Keep them sharp",
      count: counts.mastered,
    },
    {
      v: "all",
      label: "All loaded",
      sub: "Everything you've imported",
      count: counts.all,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
    >
      <div className="mb-8">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
          Flashcards
        </p>
        <h1 className="display-serif text-4xl font-semibold">Ready to study?</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-lg">
          Pick a deck, hit start. Space to flip. 1–4 to rate. Arrow keys to navigate. Escape to pause.
        </p>
      </div>

      <Card className="mb-6">
        <CardContent className="p-5 space-y-6">
          <div>
            <p className="text-sm font-medium mb-3">Deck</p>
            <div className="grid gap-2">
              {deckOptions.map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setDeck(opt.v)}
                  disabled={opt.count === 0}
                  className={cn(
                    "rounded-md border p-3 text-left flex items-center justify-between gap-3 transition-colors",
                    deck === opt.v
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-border/80",
                    opt.count === 0 && "opacity-40 cursor-not-allowed",
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {opt.sub}
                    </p>
                  </div>
                  <Badge variant="outline" className="tabular shrink-0">
                    {opt.count}
                  </Badge>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border/60 bg-secondary/30 p-3">
            <div className="flex items-center gap-2.5">
              <Shuffle className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Shuffle cards</p>
                <p className="text-xs text-muted-foreground">
                  Otherwise: in original order
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDoShuffle(!doShuffle)}
              className={cn(
                "relative w-10 h-6 rounded-full transition-colors",
                doShuffle ? "bg-accent" : "bg-border",
              )}
              aria-pressed={doShuffle}
            >
              <motion.div
                className="absolute top-0.5 left-0.5 w-5 h-5 bg-background rounded-full shadow"
                animate={{ x: doShuffle ? 16 : 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </button>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-sm font-medium">How many cards?</p>
              <p className="text-sm tabular text-muted-foreground">
                {Math.min(cardLimit, availableCount)} of {availableCount}
              </p>
            </div>
            <input
              type="range"
              min={3}
              max={Math.max(3, Math.min(50, availableCount))}
              value={Math.min(cardLimit, availableCount)}
              onChange={(e) => setCardLimit(Number(e.target.value))}
              className="w-full accent-accent"
              disabled={availableCount < 3}
            />
            <div className="flex justify-between mt-2 text-[10px] text-muted-foreground tabular">
              <span>3</span>
              <span>{Math.max(3, Math.min(50, availableCount))}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          size="lg"
          className="flex-1 h-12"
          onClick={onStart}
          disabled={availableCount === 0}
        >
          <Play className="w-4 h-4" />
          {availableCount === 0 ? "Deck is empty" : "Start studying"}
        </Button>
      </div>

      <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <Keyboard className="w-3.5 h-3.5" />
        Tip: use keyboard for the fastest flow. Space, then 1-2-3-4.
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------- */

function PlayScreen({
  card,
  idx,
  total,
  flipped,
  setFlipped,
  sessionStreak,
  elapsedMs,
  pulseColor,
  paused,
  setPaused,
  reduceMotion,
  onRate,
  onSpeak,
  onQuit,
  onPrev,
  onNext,
}: {
  card: EnrichedWord;
  idx: number;
  total: number;
  flipped: boolean;
  setFlipped: (v: boolean | ((f: boolean) => boolean)) => void;
  sessionStreak: number;
  elapsedMs: number;
  pulseColor: string | null;
  paused: boolean;
  setPaused: (v: boolean) => void;
  reduceMotion: boolean;
  onRate: (r: StudyRating) => void;
  onSpeak: () => void;
  onQuit: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  // Drag / swipe support
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-8, 0, 8]);
  const opacity = useTransform(x, [-200, -50, 0, 50, 200], [0.4, 0.9, 1, 0.9, 0.4]);
  const bgLeft = useTransform(x, [-200, -30], [0.35, 0]);
  const bgRight = useTransform(x, [30, 200], [0, 0.35]);

  function onDragEnd(_e: unknown, info: { offset: { x: number } }) {
    if (!flipped) return;
    if (info.offset.x < -120) onRate("again");
    else if (info.offset.x > 120) onRate("good");
  }

  const mins = Math.floor(elapsedMs / 60000);
  const secs = Math.floor((elapsedMs % 60000) / 1000);
  const timeStr = `${mins}:${String(secs).padStart(2, "0")}`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={onQuit}
          >
            <X className="w-4 h-4" />
          </Button>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {card.monthName} · Day {card.day}
            </p>
            <p className="text-xs text-muted-foreground tabular">
              Card {idx + 1} of {total} · {timeStr}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AnimatePresence>
            {sessionStreak >= 3 && (
              <motion.div
                key={sessionStreak}
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.7, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                <Badge
                  variant="accent"
                  className="gap-1 tabular text-xs px-2.5 py-1"
                >
                  <Flame className="w-3 h-3" />
                  {sessionStreak} streak
                </Badge>
              </motion.div>
            )}
          </AnimatePresence>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setPaused(true)}
          >
            <Pause className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Progress value={((idx + (flipped ? 0.5 : 0)) / total) * 100} className="mb-8" />

      {/* Card area with pulse ring and swipe backdrops */}
      <div className="relative" style={{ perspective: "1200px" }}>
        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          animate={{
            boxShadow: pulseColor
              ? `0 0 0 4px ${pulseColor}, 0 0 60px ${pulseColor}`
              : "0 0 0 0px rgba(0,0,0,0)",
          }}
          transition={{ duration: 0.35 }}
        />
        {/* Swipe hint backgrounds — only visible while dragging */}
        <motion.div
          className="absolute inset-0 rounded-2xl bg-destructive/50 flex items-center justify-start pl-12 pointer-events-none"
          style={{ opacity: bgLeft }}
        >
          <X className="w-8 h-8 text-white" />
        </motion.div>
        <motion.div
          className="absolute inset-0 rounded-2xl bg-success/50 flex items-center justify-end pr-12 pointer-events-none"
          style={{ opacity: bgRight }}
        >
          <Check className="w-8 h-8 text-white" />
        </motion.div>

        <motion.div
          drag={flipped ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.35}
          onDragEnd={onDragEnd}
          style={{ x, rotate, opacity }}
          className="relative"
        >
          <motion.div
            key={card.id + (flipped ? "-back" : "-front")}
            initial={reduceMotion ? { opacity: 0 } : { rotateY: flipped ? -180 : 0 }}
            animate={reduceMotion ? { opacity: 1 } : { rotateY: flipped ? 180 : 0 }}
            transition={{
              duration: reduceMotion ? 0.15 : 0.6,
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{
              transformStyle: "preserve-3d",
              transformOrigin: "center",
            }}
            className="relative min-h-[420px] cursor-pointer select-none"
            onClick={() => setFlipped((f) => !f)}
          >
            {/* Front */}
            <div
              className="absolute inset-0 rounded-2xl border border-border bg-card shadow-xl flex flex-col items-center justify-center p-8"
              style={{ backfaceVisibility: "hidden" }}
            >
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-4">
                {card.partOfSpeech}
              </p>
              <h2 className="display-serif text-6xl md:text-7xl font-semibold text-center text-balance mb-6">
                {card.word}
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 opacity-60 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSpeak();
                  }}
                >
                  <Volume2 className="w-4 h-4" />
                </Button>
              </div>
              <p className="mt-8 text-xs text-muted-foreground">
                Tap card or press <kbd className="mx-1 px-1.5 py-0.5 rounded bg-secondary text-foreground text-[10px] font-mono">Space</kbd> to flip
              </p>
            </div>
            {/* Back */}
            <div
              className="absolute inset-0 rounded-2xl border border-border bg-card shadow-xl p-7 overflow-y-auto"
              style={{
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
              }}
            >
              <div className="flex items-baseline gap-3 flex-wrap mb-4">
                <h3 className="display-serif text-3xl font-semibold">
                  {card.word}
                </h3>
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                  {card.partOfSpeech}
                </Badge>
              </div>
              <div className="space-y-4">
                <Section label="Definition">
                  <p className="text-base leading-relaxed">{card.definition}</p>
                </Section>
                <Section label="Example">
                  <em className="text-foreground/90 text-sm leading-relaxed block">
                    "{card.example}"
                  </em>
                </Section>
                <Section label="Memory tip" icon={Sparkles}>
                  <p className="text-sm leading-relaxed text-foreground/85">
                    {card.mnemonic}
                  </p>
                </Section>
              </div>
              <p className="mt-6 text-xs text-muted-foreground text-center">
                How well did you know it?
              </p>
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Rating buttons */}
      <div className="mt-6 grid grid-cols-4 gap-2">
        {(["again", "hard", "good", "easy"] as const).map((r) => {
          const meta = RATING_META[r];
          const Icon = meta.icon;
          return (
            <motion.button
              key={r}
              type="button"
              disabled={!flipped}
              onClick={() => onRate(r)}
              whileHover={flipped ? { y: -2 } : undefined}
              whileTap={flipped ? { scale: 0.96 } : undefined}
              className={cn(
                "relative rounded-lg border p-3 text-left transition-all",
                flipped
                  ? meta.color
                  : "border-border/40 text-muted-foreground/50 cursor-not-allowed",
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <Icon className="w-4 h-4" />
                <kbd className="px-1.5 py-0.5 rounded bg-black/10 text-[10px] font-mono">
                  {meta.shortcut}
                </kbd>
              </div>
              <p className="text-sm font-semibold">{meta.label}</p>
              <p className="text-[10px] mt-0.5 opacity-70">{meta.hint}</p>
            </motion.button>
          );
        })}
      </div>

      {/* Bottom nav */}
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <button
          type="button"
          onClick={onPrev}
          disabled={idx === 0}
          className="flex items-center gap-1 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Prev
        </button>
        <span>
          Swipe {flipped ? "→ good, ← again" : "flip first"}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={idx >= total - 1}
          className="flex items-center gap-1 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Next
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Pause overlay */}
      <AnimatePresence>
        {paused && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/85 backdrop-blur-sm flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="rounded-2xl border border-border bg-card p-8 max-w-sm text-center"
            >
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                <Pause className="w-5 h-5 text-muted-foreground" />
              </div>
              <h3 className="display-serif text-2xl font-semibold mb-1">Paused</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Take a breath. Your session is saved.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setPaused(false);
                    onQuit();
                  }}
                >
                  Quit
                </Button>
                <Button className="flex-1" onClick={() => setPaused(false)}>
                  <Play className="w-4 h-4" />
                  Resume
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Section({
  label,
  children,
  icon: Icon,
}: {
  label: string;
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </p>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------- */

function ResultsScreen({
  cards,
  events,
  bestStreak,
  totalMs,
  onStudyAgain,
  onNewDeck,
  onShare,
}: {
  cards: EnrichedWord[];
  events: StudyEvent[];
  bestStreak: number;
  totalMs: number;
  onStudyAgain: () => void;
  onNewDeck: () => void;
  onShare: () => void;
}) {
  const counts: Record<StudyRating, number> = {
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  };
  for (const e of events) counts[e.rating]++;
  const total = events.length;
  const nailed = counts.good + counts.easy;
  const pct = total > 0 ? Math.round((nailed / total) * 100) : 0;
  const avgSec =
    events.length > 0
      ? (events.reduce((s, e) => s + e.msToRate, 0) / events.length) / 1000
      : 0;
  const mins = Math.floor(totalMs / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);

  const message =
    pct === 100
      ? "Perfect run."
      : pct >= 85
        ? "You're on fire."
        : pct >= 65
          ? "Solid — keep going."
          : "Good effort — worth another pass.";

  const stuck = events
    .filter((e) => e.rating === "again")
    .map((e) => cards.find((c) => c.id === e.wordId))
    .filter(Boolean) as EnrichedWord[];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3 }}
      className="relative"
    >
      {/* Confetti */}
      {pct >= 65 && <Confetti />}

      <div className="text-center mb-8 pt-6">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 200 }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-accent/15 text-accent mb-5"
        >
          <Sparkles className="w-9 h-9" />
        </motion.div>
        <p className="text-sm text-muted-foreground mb-2">{message}</p>
        <p className="display-serif text-6xl font-semibold tabular">
          {nailed}
          <span className="text-muted-foreground text-3xl"> / {total}</span>
        </p>
        <p className="text-sm text-muted-foreground mt-1 tabular">
          {pct}% · {mins}:{String(secs).padStart(2, "0")} · {avgSec.toFixed(1)}s / card
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {(["easy", "good", "hard", "again"] as const).map((r, i) => {
          const meta = RATING_META[r];
          const Icon = meta.icon;
          return (
            <motion.div
              key={r}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.06 }}
              className={cn("rounded-lg border p-4", meta.color)}
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className="w-4 h-4" />
                <p className="text-xs opacity-80">{meta.label}</p>
              </div>
              <p className="display-serif text-3xl font-semibold tabular">
                {counts[r]}
              </p>
            </motion.div>
          );
        })}
      </div>

      {bestStreak > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="rounded-lg border border-accent/30 bg-accent/5 p-4 mb-6 flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
            <Flame className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Best session streak
            </p>
            <p className="text-lg font-semibold tabular">
              {bestStreak} in a row
            </p>
          </div>
        </motion.div>
      )}

      {stuck.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.65 }}
          className="mb-6"
        >
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            Worth another look
          </p>
          <div className="space-y-2">
            {stuck.slice(0, 6).map((w) => (
              <div
                key={w.id}
                className="rounded-lg border border-border bg-card p-3 flex items-baseline gap-3"
              >
                <p className="display-serif text-lg font-semibold">{w.word}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {w.definition}
                </p>
              </div>
            ))}
            {stuck.length > 6 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                +{stuck.length - 6} more
              </p>
            )}
          </div>
        </motion.div>
      )}

      <div className="flex gap-2 flex-wrap">
        <Button className="flex-1" onClick={onStudyAgain}>
          <RotateCcw className="w-4 h-4" />
          Study again
        </Button>
        <Button variant="outline" className="flex-1" onClick={onNewDeck}>
          <Layers className="w-4 h-4" />
          New deck
        </Button>
        <Button variant="ghost" onClick={onShare} title="Copy summary">
          Share
        </Button>
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------- */

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 40 }).map((_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 500,
        y: -Math.random() * 200 - 100,
        rot: Math.random() * 720 - 360,
        scale: 0.6 + Math.random() * 0.8,
        color: [
          "hsl(var(--accent))",
          "hsl(var(--success))",
          "hsl(var(--warning))",
          "hsl(var(--primary))",
        ][i % 4]!,
        delay: Math.random() * 0.15,
      })),
    [],
  );
  return (
    <div className="absolute inset-x-0 top-0 h-0 pointer-events-none z-40">
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{
            x: p.x,
            y: p.y + 500,
            rotate: p.rot,
            opacity: [1, 1, 0],
          }}
          transition={{
            duration: 1.6,
            delay: p.delay,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="absolute left-1/2 top-8 w-2 h-3 rounded-sm origin-center"
          style={{
            backgroundColor: p.color,
            scale: p.scale,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Games: short timed rounds on the words the user is learning.
 *
 * This page orchestrates — hub, rules card, round, results. Everything with an
 * opinion lives elsewhere: questions and scoring in src/lib/games/, the words
 * in useGameCorpus, history and bests in useProgressStore.
 *
 * What a game is allowed to change is narrow, and deliberately so: its own
 * history and best, today's activity count, and — only when the user presses
 * the button on the results screen — the schedule of missed words they have
 * already studied. See docs/adr/0016-games-are-rounds-not-progression.md and
 * docs/GAMES.md.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Clock, Repeat2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { GameCover } from "@/components/games/GameCover";
import { GameStage } from "@/components/games/GameStage";
import { GameResults } from "@/components/games/GameResults";
import { DailyCard } from "@/components/games/DailyCard";
import { buildDailyRound, DAILY_SECONDS, dailyShareText } from "@/lib/games/daily";
import { buildPictureRound } from "@/lib/games/pictures/round";
import { useDailyResults } from "@/store/useDailyResults";
import type { GameRoundSummary } from "@/lib/games/types";
import { useGameCorpus, useStudiedCount, type GameCorpus } from "@/hooks/useGameCorpus";
import {
  GAMES,
  GAME_ORDER,
  TIER_DESCRIPTION,
  TIER_LABEL,
  TIER_ORDER,
  type GameDefinition,
} from "@/lib/games/catalogue";
import { MINE_MINIMUM } from "@/lib/games/pool";
import { buildRound } from "@/lib/games/round";
import {
  bestKey,
  compareWithBest,
  maxPointsPerQuestion,
  questionLimitMs,
  type BestOutcome,
} from "@/lib/games/scoring";
import { missedWordIds, roundDurationMs, tally, type SessionState } from "@/lib/games/session";
import {
  timingOf,
  type GameId,
  type GameRound,
  type GameTimer,
  type Tier,
} from "@/lib/games/types";
import { seedFor } from "@/lib/order";
import { playSound } from "@/lib/sound";
import { TRACK_META } from "@/lib/track";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { useProgressStore } from "@/store/useProgressStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useVocabStore } from "@/store/useVocabStore";

const EASE = [0.16, 1, 0.3, 1] as const;

/** A Daily Round's date, and whether the day's result was already set. */
type DailyMeta = { date: string; practice: boolean };

type View =
  | { kind: "hub" }
  | {
      kind: "playing";
      round: GameRound;
      timer: GameTimer;
      limitMs: number | null;
      attempt: number;
      daily?: DailyMeta;
    }
  | {
      kind: "results";
      round: GameRound;
      state: SessionState;
      outcome: BestOutcome;
      reviewable: string[];
      timer: GameTimer;
      daily?: DailyMeta;
    };

export function Games() {
  const track = useVocabStore((s) => s.activeTrack);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const gameTimer = useSettingsStore((s) => s.gameTimer);
  const lastGameTier = useSettingsStore((s) => s.lastGameTier);
  const setSettings = useSettingsStore((s) => s.set);
  const recordGameRound = useProgressStore((s) => s.recordGameRound);
  const applyStudyRating = useProgressStore((s) => s.applyStudyRating);
  const navigate = useAppStore((s) => s.navigate);
  const showToast = useAppStore((s) => s.showToast);
  const studiedCount = useStudiedCount(track);
  const daily = useDailyResults(track);

  const [view, setView] = useState<View>({ kind: "hub" });

  // Tapping Games in the nav while a result is showing means "back to the
  // games", the way a tab bar returns to its root. Never mid-round: the stage
  // covers the nav, and a round is only left through the pause sheet.
  const visits = useAppStore((s) => s.visits);
  const seenVisits = useRef(visits);
  useEffect(() => {
    if (visits === seenVisits.current) return;
    seenVisits.current = visits;
    setView((v) => (v.kind === "results" ? { kind: "hub" } : v));
  }, [visits]);
  /** The game and tier picked on the hub; also what the corpus loads for. */
  const [choice, setChoice] = useState<{ game: GameId; tier: Tier } | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [shortfall, setShortfall] = useState<string | null>(null);
  // Starts loading the moment a tier is picked, so the words are usually
  // ready by the time the rules card has been read.
  const [corpusAttempt, setCorpusAttempt] = useState(0);
  const corpus = useGameCorpus(track, choice?.tier ?? null, corpusAttempt);

  const pick = useCallback((game: GameId, tier: Tier) => {
    setChoice({ game, tier });
    setShortfall(null);
    setRulesOpen(true);
  }, []);

  // The Dashboard's Daily Round card asks for the round on arrival.
  const gamesIntent = useAppStore((s) => s.gamesIntent);
  const setGamesIntent = useAppStore((s) => s.setGamesIntent);
  useEffect(() => {
    if (gamesIntent !== "daily") return;
    setGamesIntent(null);
    pick("daily", "standard");
  }, [gamesIntent, setGamesIntent, pick]);

  const share = useCallback(
    async (round: Pick<GameRoundSummary, "daily" | "right" | "total">, results: boolean[]) => {
      const text = dailyShareText(round.daily ?? daily.today, TRACK_META[track].label, results);
      try {
        await navigator.clipboard.writeText(text);
        showToast({ title: "Copied", description: "Paste it anywhere.", variant: "success" });
      } catch {
        showToast({ title: "Couldn't copy", description: text, variant: "error" });
      }
    },
    [daily.today, showToast, track],
  );

  const start = useCallback(
    (game: GameId, tier: Tier, ready: GameCorpus, attempt = 0) => {
      const definition = GAMES[game];
      // Picture It draws from its own diagrams, not from the corpus, so it
      // never waits on the words loading — or on a network at all.
      if (game === "picture") {
        const timer = useSettingsStore.getState().gameTimer;
        const seed = seedFor([game, String(Date.now()), String(attempt)]);
        setRulesOpen(false);
        setView({
          kind: "playing",
          round: { game, track, tier: "standard", seed, questions: buildPictureRound(seed), shortfall: 0 },
          timer,
          limitMs: questionLimitMs(definition.seconds, "standard", timer),
          attempt,
        });
        return;
      }
      if (ready.status !== "ready") return;
      const isDaily = game === "daily";
      const round = isDaily
        ? buildDailyRound({
            date: daily.today,
            track,
            prompts: ready.prompts,
            pool: ready.pool,
            monthOf: ready.monthOf,
            index: ready.index,
          })
        : buildRound({
            game,
            track,
            tier,
            prompts: ready.prompts,
            pool: ready.pool,
            monthOf: ready.monthOf,
            index: ready.index,
            ambiguous: ready.ambiguous,
            // A fresh round every time; seeded so a given round is reproducible.
            seed: seedFor([game, track, tier, String(Date.now()), String(attempt)]),
          });
      if (round.shortfall > 0) {
        setShortfall(
          tier === "mine"
            ? `There aren't enough of your studied words to fill a round yet. Study a few more, or pick a tier.`
            : `These words can't fill a round right now. Try another tier.`,
        );
        return;
      }
      const timer = useSettingsStore.getState().gameTimer;
      if (!isDaily) {
        setSettings({ lastGameTier: { ...useSettingsStore.getState().lastGameTier, [game]: tier } });
      }
      setRulesOpen(false);
      setView({
        kind: "playing",
        round,
        timer,
        limitMs: questionLimitMs(isDaily ? DAILY_SECONDS : definition.seconds, tier, timer),
        attempt,
        // Once today's result is set, every further round is practice.
        daily: isDaily ? { date: daily.today, practice: Boolean(daily.results[daily.today]) } : undefined,
      });
    },
    [track, setSettings, daily],
  );

  const finish = useCallback(
    (round: GameRound, timer: GameTimer, state: SessionState, dailyMeta?: DailyMeta) => {
      const timing = timingOf(timer);
      const key = bestKey(round.game, round.track, round.tier, timing);
      // Read the best *before* filing this round, or every round would
      // compare against itself.
      const previous = useProgressStore.getState().gameBests[key];
      const outcome = compareWithBest(previous, state.score);
      const missed = missedWordIds(round.questions, state.answers);
      const { right, total } = tally(round.questions, state.answers);
      recordGameRound({
        id: `game-${Date.now().toString(36)}`,
        game: round.game,
        track: round.track,
        tier: round.tier,
        timing,
        daily: dailyMeta?.date ?? null,
        practice: dailyMeta?.practice || undefined,
        pattern: dailyMeta ? state.answers.map((a) => (a.correct ? "1" : "0")).join("") : undefined,
        finishedAt: new Date().toISOString(),
        score: state.score,
        right,
        total,
        ms: roundDurationMs(state),
        missed,
      });
      if (outcome.kind === "new-best") playSound("best");
      else playSound("complete");
      const progress = useProgressStore.getState().words;
      const reviewable = missed.filter((id) => (progress[id]?.timesReviewed ?? 0) > 0);
      setView({ kind: "results", round, state, outcome, reviewable, timer, daily: dailyMeta });
    },
    [recordGameRound],
  );

  const reviewMissed = useCallback(
    (ids: string[], monthOf: Record<string, string>) => {
      const progress = useProgressStore.getState().words;
      for (const id of ids) {
        applyStudyRating(id, monthOf[id] ?? progress[id]?.monthKey ?? "", "again");
      }
      showToast({
        title: ids.length === 1 ? "Added to today's reviews" : `${ids.length} words added to today's reviews`,
        variant: "success",
      });
    },
    [applyStudyRating, showToast],
  );

  // ── Playing ────────────────────────────────────────────────────────────
  if (view.kind === "playing") {
    const definition = GAMES[view.round.game];
    return (
      <GameStage
        key={`${view.round.seed}-${view.attempt}`}
        definition={definition}
        round={view.round}
        timer={view.timer}
        limitMs={view.limitMs}
        onFinish={(state) => finish(view.round, view.timer, state, view.daily)}
        onRestart={() => start(view.round.game, view.round.tier, corpus, view.attempt + 1)}
        onQuit={() => setView({ kind: "hub" })}
      />
    );
  }

  // ── Results ────────────────────────────────────────────────────────────
  if (view.kind === "results") {
    const monthOf = corpus.status === "ready" ? corpus.monthOf : {};
    return (
      <GameResults
        definition={GAMES[view.round.game]}
        round={view.round}
        answers={view.state.answers}
        score={view.state.score}
        outcome={view.outcome}
        daily={
          view.daily
            ? {
                ...view.daily,
                onShare: () =>
                  share(
                    { daily: view.daily!.date, right: 0, total: 0 },
                    view.state.answers.map((a) => a.correct),
                  ),
              }
            : undefined
        }
        reviewable={view.reviewable}
        monthOf={monthOf}
        reduceMotion={reduceMotion}
        onReviewMissed={(ids) => reviewMissed(ids, monthOf)}
        onOpenLibrary={() => navigate("archive")}
        onPlayAgain={() => start(view.round.game, view.round.tier, corpus, 0)}
        onExit={() => setView({ kind: "hub" })}
      />
    );
  }

  // ── Hub ────────────────────────────────────────────────────────────────
  const chosen = choice ? GAMES[choice.game] : null;

  return (
    <div className="mx-auto w-full max-w-5xl py-8">
      <div className="mb-8">
        <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">Games</p>
        <h1 className="display-serif text-3xl font-semibold">Play with your words.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Short timed rounds on the {TRACK_META[track].label} vocabulary. Ten questions, about two minutes.
        </p>
      </div>

      <DailyCard
        today={daily.today}
        dates={daily.dates}
        results={daily.results}
        reduceMotion={reduceMotion}
        onPlay={() => pick("daily", "standard")}
        onShare={(r) => share(r, [...(r.pattern ?? "")].map((c) => c === "1"))}
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {GAME_ORDER.map((id, i) => (
          <GameCard
            key={id}
            definition={GAMES[id]}
            lastTier={GAMES[id].tierless ? "standard" : lastGameTier[id] ?? (studiedCount >= MINE_MINIMUM ? "mine" : "standard")}
            studiedCount={studiedCount}
            timer={gameTimer}
            delay={reduceMotion ? 0 : i * 0.05}
            onPick={(tier) => pick(id, tier)}
          />
        ))}
      </div>

      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        {chosen && choice && (
          <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
            <GameCover tint={chosen.tint} mark={chosen.mark} className="h-20" />
            <div className="p-6">
              <DialogTitle className="display-serif text-2xl font-semibold">{chosen.name}</DialogTitle>
              <DialogDescription className="mt-1">
                {choice.game === "picture"
                  ? "Ten parts of ten things — a ship, a temple, a flower."
                  : choice.game === "daily"
                  ? "Four games, Standard words. The same round for everyone today."
                  : `${TIER_LABEL[choice.tier]} — ${TIER_DESCRIPTION[choice.tier]}`}
              </DialogDescription>
              <ul className="mt-5 space-y-3 text-sm">
                <li className="flex gap-3">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="tabular">
                    {gameTimer === "off"
                      ? "No timer — take as long as you like."
                      : `${(questionLimitMs(chosen.seconds, choice.tier, gameTimer)! / 1000).toFixed(0)} seconds a question.`}
                  </span>
                </li>
                <li className="flex gap-3">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="tabular">
                    {gameTimer === "off"
                      ? `${maxPointsPerQuestion(choice.tier, gameTimer)} points for each right answer.`
                      : `Up to ${maxPointsPerQuestion(choice.tier, gameTimer)} points each — the faster you answer, the more you keep.`}
                  </span>
                </li>
                <li className="flex gap-3">
                  <Repeat2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span>10 questions. Nothing here changes your flashcard schedule unless you ask it to.</span>
                </li>
              </ul>

              <div className="mt-5 flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Timer</span>
                <div role="radiogroup" aria-label="Timer" className="flex gap-0.5 rounded-lg border border-border bg-secondary/40 p-0.5">
                  {(["standard", "relaxed", "off"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={gameTimer === t}
                      onClick={() => setSettings({ gameTimer: t })}
                      className={cn(
                        "min-h-[2.25rem] rounded-md px-3 text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        gameTimer === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {shortfall && <p className="mt-4 text-sm text-warning">{shortfall}</p>}
              {corpus.status === "error" && choice.game !== "picture" && (
                <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
                  <p>Couldn’t load these words — are you offline?</p>
                  <p className="mt-1 text-muted-foreground">
                    Your own studied words don’t need a connection: try Mine.
                  </p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => setCorpusAttempt((n) => n + 1)}>
                    Try again
                  </Button>
                </div>
              )}

              <Button
                size="lg"
                className="mt-6 w-full"
                autoFocus
                disabled={corpus.status !== "ready" && choice.game !== "picture"}
                onClick={() => start(choice.game, choice.tier, corpus)}
              >
                {corpus.status === "loading" && choice.game !== "picture" ? "Getting the words ready…" : "Play"}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function GameCard({
  definition,
  lastTier,
  studiedCount,
  timer,
  delay,
  onPick,
}: {
  definition: GameDefinition;
  lastTier: Tier;
  studiedCount: number;
  timer: GameTimer;
  delay: number;
  onPick: (tier: Tier) => void;
}) {
  const track = useVocabStore((s) => s.activeTrack);
  // A stored object read by key: a stable reference, safe as a selector.
  const best = useProgressStore((s) => s.gameBests[bestKey(definition.id, track, lastTier, timingOf(timer))]);
  const mineLocked = studiedCount < MINE_MINIMUM;

  const tiers = useMemo(() => TIER_ORDER, []);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: EASE }}
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
      aria-labelledby={`game-${definition.id}`}
    >
      <GameCover tint={definition.tint} mark={definition.mark} title={definition.name} className="h-28" />
      <div className="p-5">
        <h2 id={`game-${definition.id}`} className="sr-only">
          {definition.name}
        </h2>
        <p className="text-sm">{definition.blurb}</p>
        <p className="tabular mt-1 text-xs text-muted-foreground">
          {best
            ? `Best ${best.score.toLocaleString()} · ${best.right} of ${best.total}${definition.tierless ? "" : ` · ${TIER_LABEL[lastTier]}`}`
            : definition.tierless
              ? "No rounds yet"
              : `No rounds on ${TIER_LABEL[lastTier]} yet`}
        </p>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={`Play ${definition.name}`}>
          {definition.tierless && (
            <button
              type="button"
              onClick={() => onPick("standard")}
              className="min-h-[2.25rem] rounded-full border border-primary bg-primary px-5 text-xs font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Play
            </button>
          )}
          {!definition.tierless && tiers.map((tier) => {
            const locked = tier === "mine" && mineLocked;
            return (
              <button
                key={tier}
                type="button"
                disabled={locked}
                onClick={() => onPick(tier)}
                title={TIER_DESCRIPTION[tier]}
                className={cn(
                  "min-h-[2.25rem] rounded-full border px-3.5 text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  tier === lastTier && !locked
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:border-primary/60 hover:bg-primary/5",
                )}
              >
                {TIER_LABEL[tier]}
              </button>
            );
          })}
        </div>
        {mineLocked && !definition.tierless && (
          <p className="mt-3 text-xs text-muted-foreground">
            Mine unlocks at {MINE_MINIMUM} studied words · you've studied {studiedCount}.
          </p>
        )}
      </div>
    </motion.section>
  );
}

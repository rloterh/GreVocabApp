/**
 * The Daily Round, above the games.
 *
 * Fourteen dots: a day played is filled, a day missed is simply empty —
 * never red, never a count of misses. This is a record, not a second streak
 * (docs/adr/0016-games-are-rounds-not-progression.md).
 */

import { motion } from "framer-motion";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GameCover } from "@/components/games/GameCover";
import type { GameRoundSummary } from "@/lib/games/types";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

export function DailyCard({
  today,
  dates,
  results,
  reduceMotion,
  onPlay,
  onShare,
}: {
  today: string;
  dates: readonly string[];
  results: Record<string, GameRoundSummary | undefined>;
  reduceMotion: boolean;
  onPlay: () => void;
  onShare: (round: GameRoundSummary) => void;
}) {
  const todays = results[today];
  const label = new Date(`${today}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <motion.section
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="mb-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
      aria-labelledby="daily-heading"
      data-testid="daily-card"
    >
      <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <GameCover tint="primary" mark="◷" title={label} className="h-24 md:h-auto" />
        <div className="p-5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Daily Round</p>
          <h2 id="daily-heading" className="display-serif mt-1 text-xl font-semibold">
            {todays ? `${todays.right} of ${todays.total} today` : "Today’s round is waiting"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ten mixed questions — the same round for everyone today.
          </p>

          <ol className="mt-4 flex items-center gap-1.5" aria-label="The last fourteen days">
            {dates.map((d) => {
              const r = results[d];
              const isToday = d === today;
              return (
                <li
                  key={d}
                  title={r ? `${d}: ${r.right} of ${r.total}` : `${d}: not played`}
                  aria-label={r ? `${d}, ${r.right} of ${r.total}` : `${d}, not played`}
                  className={cn(
                    "h-2.5 w-2.5 shrink-0 rounded-full",
                    r ? "bg-primary" : "bg-border",
                    isToday && "ring-2 ring-primary/40 ring-offset-2 ring-offset-card",
                  )}
                />
              );
            })}
          </ol>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={onPlay}>{todays ? "Play again (practice)" : "Play today’s round"}</Button>
            {todays && (
              <Button variant="outline" onClick={() => onShare(todays)}>
                <Copy /> Copy result
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

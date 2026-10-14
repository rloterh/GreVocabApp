/**
 * Games on the Progress page: the best round per game and tier, and the last
 * fourteen Daily Rounds.
 *
 * **No total, anywhere.** A sum of game points is the one number ADR 0016
 * refuses: it would grow forever, mean nothing, and sit beside mastery asking
 * to be compared with it. GamesProgress.test.tsx renders a history and
 * asserts its sum appears nowhere on screen.
 */

import { useMemo } from "react";
import { bestKey } from "@/lib/games/scoring";
import { GAME_NAMES, GAME_ORDER, TIER_LABEL, TIER_ORDER } from "@/lib/games/names";
import { useDailyResults } from "@/store/useDailyResults";
import { useProgressStore } from "@/store/useProgressStore";
import { useVocabStore } from "@/store/useVocabStore";
import { cn } from "@/lib/utils";

export function GamesProgress() {
  const track = useVocabStore((s) => s.activeTrack);
  const bests = useProgressStore((s) => s.gameBests);
  const { dates, results, today } = useDailyResults(track);

  const rows = useMemo(
    () =>
      GAME_ORDER.map((game) => ({
        game,
        cells: TIER_ORDER.map((tier) => bests[bestKey(game, track, tier, "timed")]),
      })).filter((row) => row.cells.some(Boolean)),
    [bests, track],
  );
  const played = dates.filter((d) => results[d]).length;

  if (rows.length === 0 && played === 0) return null;

  return (
    <section data-testid="games-progress">
      <h2 className="mb-4 text-lg font-semibold">Games</h2>

      {played > 0 && (
        <div className="mb-5 rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Daily Rounds, last fourteen days · <span className="tabular">{played}</span> played
          </p>
          <ol className="mt-3 grid grid-cols-7 gap-2 sm:grid-cols-[repeat(14,minmax(0,1fr))]" aria-label="Daily Rounds">
            {dates.map((d) => {
              const r = results[d];
              const date = new Date(`${d}T12:00:00`);
              const label = date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
              return (
                <li
                  key={d}
                  title={label}
                  aria-label={r ? `${label}: ${r.right} of ${r.total}` : `${label}: not played`}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-center",
                    r ? "border-primary/40 bg-primary/5" : "border-border",
                    d === today && "ring-1 ring-primary/40",
                  )}
                >
                  {/* The day alone on a phone, where "Oct 10" wraps; the
                      full date is in the title and the spoken label. */}
                  <span className="text-[10px] text-muted-foreground" aria-hidden="true">
                    <span className="sm:hidden">{date.getDate()}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </span>
                  <span className="tabular text-xs font-semibold sm:text-sm" aria-hidden="true">
                    {r ? `${r.right}/${r.total}` : "—"}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {rows.length > 0 && (
        // A phone gets a list — six columns do not fit 360px — and only the
        // tiers actually played.
        <ul className="space-y-2 sm:hidden" aria-label="Best round per game, timed">
          {rows.map(({ game, cells }) => (
            <li key={game} className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-sm font-medium">{GAME_NAMES[game]}</p>
              <p className="tabular mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {cells.map((best, i) =>
                  best ? (
                    <span key={i}>
                      {TIER_LABEL[TIER_ORDER[i]!]} <span className="font-semibold text-foreground">{best.score.toLocaleString()}</span>
                    </span>
                  ) : null,
                )}
              </p>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <div className="hidden overflow-x-auto rounded-xl border border-border bg-card sm:block">
          <table className="w-full text-sm">
            <caption className="sr-only">Best round per game and tier, timed</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Best, timed</th>
                {TIER_ORDER.map((tier) => (
                  <th key={tier} className="px-3 py-2 text-right font-medium">
                    {TIER_LABEL[tier]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ game, cells }) => (
                <tr key={game} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="px-4 py-2.5 text-left font-medium">
                    {GAME_NAMES[game]}
                  </th>
                  {cells.map((best, i) => (
                    <td key={i} className="tabular px-3 py-2.5 text-right">
                      {best ? (
                        <span title={`${best.right} of ${best.total}`}>{best.score.toLocaleString()}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

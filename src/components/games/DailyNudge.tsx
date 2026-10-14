/**
 * The Daily Round on the Dashboard: one line about today, and one tap to play.
 *
 * Deliberately not a stat tile. ADR 0016 keeps every game number out of the
 * stats row, where it would sit beside mastery and ask to be compared with
 * it; this says what happened today and nothing cumulative.
 */

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppStore } from "@/store/useAppStore";
import { useDailyResults } from "@/store/useDailyResults";
import { useVocabStore } from "@/store/useVocabStore";

export function DailyNudge() {
  const track = useVocabStore((s) => s.activeTrack);
  const { today, results } = useDailyResults(track);
  const navigate = useAppStore((s) => s.navigate);
  const setGamesIntent = useAppStore((s) => s.setGamesIntent);
  const todays = results[today];

  return (
    <Card data-testid="daily-nudge">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Daily Round</p>
          <p className="mt-0.5 text-sm">
            {todays ? (
              <>
                <span className="tabular font-semibold">
                  {todays.right} of {todays.total}
                </span>{" "}
                today. A new round tomorrow.
              </>
            ) : (
              "Ten mixed questions, the same for everyone today."
            )}
          </p>
        </div>
        <Button
          variant={todays ? "outline" : "default"}
          size="sm"
          onClick={() => {
            setGamesIntent(todays ? null : "daily");
            navigate("games");
          }}
        >
          {todays ? "Games" : "Play"}
        </Button>
      </CardContent>
    </Card>
  );
}

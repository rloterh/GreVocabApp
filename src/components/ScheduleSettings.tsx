/**
 * Changing the schedule after setup.
 *
 * Three controls, and the order they appear in is the order of how much they
 * cost. Moving the start date and reordering months are free and reversible —
 * they permute integers and never touch a word. Redistributing words moves
 * content, keeps every progress record, and throws away the difficulty banding
 * the corpus was built with, so it goes last, behind a sentence that says so.
 *
 * See docs/SCHEDULE.md.
 */

import { useState } from "react";
import { ListOrdered, Shuffle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Choice } from "@/components/ScheduleSetup";
import { useVocabStore } from "@/store/useVocabStore";
import { useAppStore } from "@/store/useAppStore";
import { TRACK_META } from "@/lib/track";
import {
  calendarMonthAt,
  isCalendarMonth,
  isUnarranged,
  timeline,
} from "@/lib/schedule";
import { formatMonthKey } from "@/lib/date-utils";

export function ScheduleSettings() {
  const activeTrack = useVocabStore((s) => s.activeTrack);
  const months = useVocabStore((s) => s.months);
  const schedule = useVocabStore((s) => s.getSchedule());
  const setStartMonth = useVocabStore((s) => s.setStartMonth);
  const shuffleMonths = useVocabStore((s) => s.shuffleMonths);
  const resetMonthOrder = useVocabStore((s) => s.resetMonthOrder);
  const redistribute = useVocabStore((s) => s.redistribute);
  const showToast = useAppStore((s) => s.showToast);

  const [confirmingRedistribute, setConfirming] = useState(false);

  const label = TRACK_META[activeTrack].label;
  const scheduled = timeline(schedule);
  const loaded = Object.values(months).filter((m) => m.track === activeTrack);
  const arranged = !isUnarranged(schedule);

  if (loaded.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Load some {label} vocabulary first — there is nothing to schedule yet.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="schedule-start" className="text-xs font-medium block mb-1.5">
          {label} starts in
        </label>
        <Input
          id="schedule-start"
          type="month"
          value={schedule.startMonth}
          onChange={(e) => {
            if (isCalendarMonth(e.target.value)) {
              setStartMonth(activeTrack, e.target.value);
            }
          }}
          className="tabular max-w-[200px]"
        />
        <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
          {scheduled.length > 0 ? (
            <>
              {scheduled.length} {scheduled.length === 1 ? "month" : "months"},
              running {formatMonthKey(calendarMonthAt(schedule, 0))} to{" "}
              {formatMonthKey(
                calendarMonthAt(schedule, schedule.order.length - 1),
              )}
              . Nothing moves between months — only which dates they fall on.
            </>
          ) : (
            "Nothing scheduled yet."
          )}
        </p>
      </div>

      <fieldset>
        <legend className="text-xs font-medium mb-2">Month order</legend>
        <div role="radiogroup" className="flex gap-2">
          <Choice
            selected={!arranged}
            onSelect={() => resetMonthOrder(activeTrack)}
            icon={ListOrdered}
            label="As taught"
            hint="Difficulty builds across the track"
          />
          <Choice
            selected={arranged}
            onSelect={() => shuffleMonths(activeTrack)}
            icon={Shuffle}
            label="Shuffled"
            hint={arranged ? "Pick again to reshuffle" : "Variety over progression"}
          />
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
          Free to change at any time. Months you have already studied stay
          studied — reordering permutes the calendar, it does not move a single
          word.
        </p>
      </fieldset>

      <div className="border-t border-border/60 pt-4">
        <p className="text-xs font-medium mb-1.5">Reshuffle the words</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          This mixes every {label} word across all {loaded.length} months. You
          keep everything you have learned, but the difficulty will no longer
          build from month to month, and the original layout is only
          recoverable by loading the months again from the library.
        </p>

        {confirmingRedistribute ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                redistribute(activeTrack);
                setConfirming(false);
                showToast({
                  title: "Words reshuffled",
                  description: `${loaded.length} ${label} months redealt. Your progress is unchanged.`,
                  variant: "success",
                });
              }}
            >
              Yes, reshuffle
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => setConfirming(true)}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Reshuffle {label} words
          </Button>
        )}
      </div>
    </div>
  );
}

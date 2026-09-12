/**
 * When would you like to start, and how should the months run?
 *
 * Two questions, both already answered, one tap from done. A setup screen that
 * must be read before the app can be used is a setup screen most people will
 * resent; this one has a correct answer selected and a Skip that accepts it.
 *
 * See docs/SCHEDULE.md.
 */

import { useEffect, useState } from "react";
import { CalendarDays, Shuffle, ListOrdered } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useVocabStore } from "@/store/useVocabStore";
import { TRACKS } from "@/lib/track";
import {
  addCalendarMonths,
  calendarMonthOfDate,
  isCalendarMonth,
} from "@/lib/schedule";
import { formatMonthKey } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

export type MonthOrder = "taught" | "shuffled";

/**
 * A radio in the shape of a card.
 *
 * Exported because the Settings section asks the same two questions and they
 * must not drift into looking like different decisions.
 */
export function Choice({
  selected,
  onSelect,
  icon: Icon,
  label,
  hint,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex-1 min-w-0 rounded-lg border p-3 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-accent bg-accent/10"
          : "border-border/60 hover:border-border hover:bg-secondary/40",
      )}
    >
      <span className="flex items-center gap-2">
        <Icon
          className={cn(
            "w-3.5 h-3.5 shrink-0",
            selected ? "text-accent" : "text-muted-foreground",
          )}
        />
        <span className="text-sm font-medium truncate">{label}</span>
      </span>
      <span className="mt-1 block text-[11px] text-muted-foreground leading-relaxed">
        {hint}
      </span>
    </button>
  );
}

export interface ScheduleChoice {
  startMonth: string;
  order: MonthOrder;
  valid: boolean;
}

/**
 * Write a choice to every track.
 *
 * Every track, not only the open one: this is the single moment the user says
 * when they are beginning, and a second track quietly starting "today" months
 * later would be a surprise nobody asked for. Settings moves them apart
 * afterwards.
 */
export function useApplySchedule() {
  const setStartMonth = useVocabStore((s) => s.setStartMonth);
  const shuffleMonths = useVocabStore((s) => s.shuffleMonths);
  const resetMonthOrder = useVocabStore((s) => s.resetMonthOrder);

  return (choice: ScheduleChoice) => {
    if (!choice.valid) return;
    for (const track of TRACKS) {
      setStartMonth(track, choice.startMonth);
      if (choice.order === "shuffled") shuffleMonths(track, choice.startMonth);
      else resetMonthOrder(track);
    }
  };
}

export function ScheduleSetup({
  onChange,
}: {
  /** Fires on every edit. The parent decides when to apply it. */
  onChange?: (choice: ScheduleChoice) => void;
}) {
  const months = useVocabStore((s) => s.months);

  const today = calendarMonthOfDate(new Date());
  const [startMonth, setStart] = useState(today);
  const [picking, setPicking] = useState(false);
  const [order, setOrder] = useState<MonthOrder>("taught");

  const valid = isCalendarMonth(startMonth);
  const count = Object.keys(months).length;

  useEffect(() => {
    onChange?.({ startMonth, order, valid });
    // `onChange` is the parent's setter and is deliberately not a dependency:
    // an inline arrow would re-run this on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMonth, order, valid]);

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="text-xs font-medium mb-2">
          When would you like to start?
        </legend>
        <div role="radiogroup" className="flex gap-2">
          <Choice
            selected={!picking}
            onSelect={() => {
              setPicking(false);
              setStart(today);
            }}
            icon={CalendarDays}
            label="Today"
            hint={formatMonthKey(today)}
          />
          <Choice
            selected={picking}
            onSelect={() => setPicking(true)}
            icon={CalendarDays}
            label="Pick a month"
            hint="Past or future — both work"
          />
        </div>
        {picking && (
          <div className="mt-2">
            <label htmlFor="start-month" className="sr-only">
              Start month
            </label>
            <Input
              id="start-month"
              type="month"
              value={startMonth}
              onChange={(e) => setStart(e.target.value)}
              className="tabular"
              autoFocus
            />
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="text-xs font-medium mb-2">
          How should the months run?
        </legend>
        <div role="radiogroup" className="flex gap-2">
          <Choice
            selected={order === "taught"}
            onSelect={() => setOrder("taught")}
            icon={ListOrdered}
            label="As taught"
            hint="Difficulty builds across three years"
          />
          <Choice
            selected={order === "shuffled"}
            onSelect={() => setOrder("shuffled")}
            icon={Shuffle}
            label="Shuffled"
            hint="Variety over progression"
          />
        </div>
      </fieldset>

      <p className="text-[11px] text-muted-foreground leading-relaxed" aria-live="polite">
        {valid ? (
          <>
            Month one falls in <strong>{formatMonthKey(startMonth)}</strong>
            {count > 0 && (
              <>
                , and the {count} loaded {count === 1 ? "month runs" : "months run"}{" "}
                to {formatMonthKey(addCalendarMonths(startMonth, count - 1))}
              </>
            )}
            . You can change this later in Settings.
          </>
        ) : (
          "Pick a month to continue."
        )}
      </p>

    </div>
  );
}

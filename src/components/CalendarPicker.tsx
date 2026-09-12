import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from "lucide-react";
import {
  addMonths,
  format,
  getDaysInMonth,
  isSameDay,
  startOfMonth,
  subMonths,
} from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toMonthKey } from "@/lib/date-utils";

interface CalendarPickerProps {
  /** Currently selected date */
  value: Date | null;
  onChange: (date: Date) => void;
  /** Predicate: does this date have vocabulary available? */
  isDateAvailable: (date: Date) => boolean;
  /** Optional list of months that have any vocab (for month/year dropdown filtering) */
  availableMonthKeys?: string[];
  /** Minimum year in year selector */
  minYear?: number;
  /** Maximum year */
  maxYear?: number;
}

export function CalendarPicker({
  value,
  onChange,
  isDateAvailable,
  availableMonthKeys,
  minYear = new Date().getFullYear() - 2,
  maxYear = new Date().getFullYear() + 2,
}: CalendarPickerProps) {
  const [viewDate, setViewDate] = useState<Date>(value ?? new Date());

  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = maxYear; y >= minYear; y--) arr.push(y);
    return arr;
  }, [minYear, maxYear]);

  const currentMonthKey = toMonthKey(viewDate);

  function setYear(year: number) {
    setViewDate(new Date(year, viewDate.getMonth(), 1));
  }

  function setMonth(month: number) {
    setViewDate(new Date(viewDate.getFullYear(), month, 1));
  }

  function prevMonth() {
    setViewDate(subMonths(viewDate, 1));
  }
  function nextMonth() {
    setViewDate(addMonths(viewDate, 1));
  }

  const monthStart = startOfMonth(viewDate);
  const startWeekday = monthStart.getDay(); // 0 = Sunday
  const numDays = getDaysInMonth(viewDate);

  // Build a 6x7 grid
  const cells: Array<Date | null> = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= numDays; d++) {
    cells.push(new Date(viewDate.getFullYear(), viewDate.getMonth(), d));
  }
  while (cells.length < 42) cells.push(null);

  const today = new Date();

  return (
    <div className="rounded-lg border border-border bg-card p-5 max-w-md">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-medium">Pick a date</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            aria-label="Previous month"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={prevMonth}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            aria-label="Next month"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={nextMonth}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <Select
          value={String(viewDate.getMonth())}
          onValueChange={(v) => setMonth(Number(v))}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 12 }).map((_, m) => {
              const disabled =
                availableMonthKeys &&
                !availableMonthKeys.includes(
                  `${viewDate.getFullYear()}-${String(m + 1).padStart(2, "0")}`,
                );
              return (
                <SelectItem
                  key={m}
                  value={String(m)}
                  disabled={disabled}
                >
                  {format(new Date(2000, m, 1), "MMMM")}
                  {disabled ? " —" : ""}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <Select
          value={String(viewDate.getFullYear())}
          onValueChange={(v) => setYear(Number(v))}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div
            key={i}
            className="text-center text-[10px] uppercase tracking-wider text-muted-foreground py-1.5"
          >
            {d}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentMonthKey}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="grid grid-cols-7 gap-1"
        >
          {cells.map((date, i) => {
            if (!date) return <div key={i} className="aspect-square" />;
            const available = isDateAvailable(date);
            const selected = value && isSameDay(date, value);
            const isToday = isSameDay(date, today);
            return (
              <button
                key={i}
                type="button"
                disabled={!available}
                onClick={() => available && onChange(date)}
                className={cn(
                  "aspect-square rounded-md text-sm font-medium relative transition-all",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  available
                    ? "hover:bg-secondary cursor-pointer"
                    : "text-muted-foreground/30 cursor-not-allowed",
                  selected &&
                    "bg-accent text-accent-foreground hover:bg-accent",
                  !selected && isToday && "text-accent font-semibold",
                )}
                title={
                  available
                    ? format(date, "MMMM d, yyyy")
                    : "No vocabulary loaded for this day"
                }
              >
                {date.getDate()}
                {available && !selected && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent/60" />
                )}
              </button>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

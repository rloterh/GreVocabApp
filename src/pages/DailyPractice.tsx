import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Calendar as CalendarIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { FlashCard } from "@/components/FlashCard";
import { EmptyState } from "@/components/EmptyState";
import { JsonImporter } from "@/components/JsonImporter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useVocabStore } from "@/store/useVocabStore";
import { useProgressStore } from "@/store/useProgressStore";
import { useAppStore } from "@/store/useAppStore";
import { dayKey, orderWords, seedFor } from "@/lib/order";
import { useSettingsStore } from "@/store/useSettingsStore";
import { keyOf } from "@/lib/track";

export function DailyPractice() {
  const {
    selectedDay,
    setSelectedDay,
    setActiveMonth,
    getActiveMonth,
    getAllMonths,
  } = useVocabStore();
  const toggleMastered = useProgressStore((s) => s.toggleMastered);
  const wordOrder = useSettingsStore((s) => s.wordOrder);
  const markReviewed = useProgressStore((s) => s.markReviewed);
  const isMastered = useProgressStore((s) => s.isMastered);
  const navigate = useAppStore((s) => s.navigate);

  const month = getActiveMonth();
  const months = getAllMonths();

  useEffect(() => {
    if (!month) return;
    // If selected day doesn't exist, jump to nearest available
    if (!month.days.some((d) => d.day === selectedDay)) {
      const first = month.days[0]?.day ?? 1;
      setSelectedDay(first);
    }
  }, [month, selectedDay, setSelectedDay]);

  if (!month) {
    return (
      <div className="w-full max-w-3xl mx-auto py-12">
        <EmptyState
          icon={BookOpen}
          title="No month selected"
          description="Load vocabulary first, then choose a day to practice."
          action={<JsonImporter />}
        />
      </div>
    );
  }

  const rawDay = month.days.find((d) => d.day === selectedDay);
  // Presentation of a fixed set, so the preference applies. The seed is stable
  // for the day and deck, so the order does not move under a re-render.
  const day = rawDay && {
    ...rawDay,
    words: orderWords(
      rawDay.words,
      wordOrder,
      seedFor([keyOf(month), `day-${selectedDay}`, dayKey(new Date())]),
    ),
  };
  const dayIdx = month.days.findIndex((d) => d.day === selectedDay);

  // Keep the selected day in view in the rail. Arriving on day 25 of 30 with
  // the list scrolled to the top means hunting for where you are, and the day
  // can change from the arrows or the calendar as well as from the rail.
  const currentDayRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    currentDayRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedDay, month.ordinal]);
  const totalMastered = day?.words.filter((w) => isMastered(w.id)).length ?? 0;
  const totalWords = day?.words.length ?? 0;
  const dayPct = totalWords > 0 ? (totalMastered / totalWords) * 100 : 0;

  function prevDay() {
    if (!month || dayIdx <= 0) return;
    setSelectedDay(month.days[dayIdx - 1]!.day);
  }
  function nextDay() {
    if (!month || dayIdx >= month.days.length - 1) return;
    setSelectedDay(month.days[dayIdx + 1]!.day);
  }

  return (
    <div className="w-full max-w-3xl lg:max-w-6xl mx-auto py-8">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-wrap items-end justify-between gap-4 mb-6"
      >
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            {month.title}
          </p>
          <h1 className="display-serif text-3xl font-semibold">
            Day {selectedDay}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={keyOf(month)}
            onValueChange={(v) => setActiveMonth(v)}
          >
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={keyOf(m)} value={keyOf(m)}>
                  {m.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="outline"
            aria-label="Open the calendar"
            onClick={() => navigate("calendar")}
          >
            <CalendarIcon className="w-4 h-4" />
          </Button>
        </div>
      </motion.div>

      <div className="rounded-lg border border-border bg-card/50 p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Button
              aria-label="Previous day"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={prevDay}
              disabled={dayIdx <= 0}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <p className="text-sm text-muted-foreground tabular">
              Day {dayIdx + 1} of {month.days.length}
            </p>
            <Button
              aria-label="Next day"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={nextDay}
              disabled={dayIdx >= month.days.length - 1}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={totalMastered === totalWords ? "success" : "outline"}
            >
              {totalMastered} / {totalWords} mastered
            </Badge>
          </div>
        </div>
        <Progress value={dayPct} />
      </div>

      {/*
        Two columns from `lg`, and the day list is **second in the DOM** while
        sitting first on screen. Thirty buttons ahead of the words would put a
        keyboard user thirty tab stops from the thing they came to read.
      */}
      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8 lg:items-start">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${keyOf(month)}-${selectedDay}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="space-y-4 lg:col-start-2"
          >
            {day?.words.map((word, i) => (
              <FlashCard
                key={word.id}
                word={word}
                index={i}
                mastered={isMastered(word.id)}
                onToggleMastered={() => toggleMastered(word.id, keyOf(month))}
                onReveal={() => markReviewed(word.id, keyOf(month))}
              />
            ))}
          </motion.div>
        </AnimatePresence>

        <nav
          aria-label="Days in this month"
          className="hidden lg:block lg:col-start-1 lg:row-start-1 lg:sticky lg:top-4 max-h-[calc(100dvh-8rem)] overflow-y-auto no-scrollbar pr-1"
        >
          <ul className="space-y-0.5">
            {month.days.map((d) => {
              const total = d.words.length;
              const done = d.words.filter((w) => isMastered(w.id)).length;
              const current = d.day === selectedDay;
              return (
                <li key={d.day}>
                  <button
                    type="button"
                    ref={current ? currentDayRef : undefined}
                    onClick={() => setSelectedDay(d.day)}
                    aria-current={current ? "true" : undefined}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      current
                        ? "bg-secondary text-foreground font-medium"
                        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                    )}
                  >
                    <span>Day {d.day}</span>
                    <span
                      className={cn(
                        "tabular text-[11px]",
                        done === total ? "text-success" : "opacity-70",
                      )}
                    >
                      {done}/{total}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <div className="flex items-center justify-between mt-8 pt-6 border-t border-border/60">
        <Button
          aria-label="Previous day"
          variant="ghost"
          size="sm"
          onClick={prevDay}
          disabled={dayIdx <= 0}
        >
          <ChevronLeft className="w-4 h-4" />
          Previous day
        </Button>
        <Button
          aria-label="Next day"
          variant="ghost"
          size="sm"
          onClick={nextDay}
          disabled={dayIdx >= month.days.length - 1}
        >
          Next day
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

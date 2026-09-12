import { useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Calendar as CalendarIcon } from "lucide-react";
import { CalendarPicker } from "@/components/CalendarPicker";
import { EmptyState } from "@/components/EmptyState";
import { JsonImporter } from "@/components/JsonImporter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useVocabStore } from "@/store/useVocabStore";
import { useProgressStore } from "@/store/useProgressStore";
import { useAppStore } from "@/store/useAppStore";
import { keyOf } from "@/lib/track";

export function Calendar() {
  const { months, setActiveMonth, setSelectedDay, hasDayInMonth } =
    useVocabStore();
  // A date no longer names a month on its own — the schedule says which of the
  // track's months falls in the calendar month that date is in.
  const monthKeyForDate = useVocabStore((s) => s.monthKeyForDate);
  const isMastered = useProgressStore((s) => s.isMastered);
  const navigate = useAppStore((s) => s.navigate);
  const [pickedDate, setPickedDate] = useState<Date | null>(null);

  const availableMonthKeys = Object.keys(months);

  if (availableMonthKeys.length === 0) {
    return (
      <div className="w-full lg:max-w-3xl lg:mx-auto py-12">
        <EmptyState
          icon={CalendarIcon}
          title="No months loaded"
          description="Load vocabulary to browse it by date."
          action={<JsonImporter />}
        />
      </div>
    );
  }

  function isDateAvailable(date: Date): boolean {
    const key = monthKeyForDate(date);
    return key !== null && hasDayInMonth(key, date.getDate());
  }

  const pickedWords = (() => {
    if (!pickedDate) return null;
    const key = monthKeyForDate(pickedDate);
    const month = key ? months[key] : null;
    if (!month) return null;
    const day = month.days.find((d) => d.day === pickedDate.getDate());
    if (!day) return null;
    return { month, day };
  })();

  function goToPractice() {
    if (!pickedDate || !pickedWords) return;
    setActiveMonth(keyOf(pickedWords.month));
    setSelectedDay(pickedDate.getDate());
    navigate("practice");
  }

  return (
    <div className="w-full lg:max-w-4xl lg:mx-auto py-8">
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
          Calendar
        </p>
        <h1 className="display-serif text-3xl font-semibold">
          Browse by date.
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Only days with loaded vocabulary are selectable. Others are dimmed.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 items-start">
        <CalendarPicker
          value={pickedDate}
          onChange={setPickedDate}
          isDateAvailable={isDateAvailable}
          availableMonthKeys={availableMonthKeys}
        />

        <motion.div
          key={pickedDate?.toISOString() ?? "none"}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          {!pickedDate && (
            <div className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
              Pick a date to preview its words.
            </div>
          )}
          {pickedDate && !pickedWords && (
            <div className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
              No vocabulary loaded for this date.
            </div>
          )}
          {pickedDate && pickedWords && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-baseline justify-between mb-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5">
                      {pickedWords.month.title}
                    </p>
                    <p className="display-serif text-2xl font-semibold">
                      Day {pickedDate.getDate()}
                    </p>
                  </div>
                  <Badge variant="outline" className="tabular">
                    {pickedWords.day.words.length} words
                  </Badge>
                </div>

                <div className="space-y-2 mb-5">
                  {pickedWords.day.words.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between rounded-md border border-border/60 bg-secondary/30 p-3"
                    >
                      <div className="min-w-0">
                        <p className="display-serif text-lg font-semibold truncate">
                          {w.word}
                        </p>
                        <p className="text-xs text-muted-foreground italic">
                          {w.partOfSpeech}
                        </p>
                      </div>
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${isMastered(w.id) ? "bg-success" : "bg-muted-foreground/30"}`}
                      />
                    </div>
                  ))}
                </div>

                <Button className="w-full" onClick={goToPractice}>
                  <BookOpen className="w-4 h-4" />
                  Practice this day
                </Button>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </div>
    </div>
  );
}

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Archive as ArchiveIcon, BookOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { JsonImporter } from "@/components/JsonImporter";
import { VocabGenerator } from "@/components/VocabGenerator";
import { VocabLibrary } from "@/components/VocabLibrary";
import { ImportDeckButton, ShareDeckButton } from "@/components/DeckShare";
import { AddWordsButton } from "@/components/AddWordsButton";
import { useVocabStore } from "@/store/useVocabStore";
import { useProgressStore } from "@/store/useProgressStore";
import { useAppStore } from "@/store/useAppStore";
import { allWordsInMonth } from "@/lib/vocabulary";
import { dayKey, orderWords, seedFor } from "@/lib/order";
import { useSettingsStore } from "@/store/useSettingsStore";
import { formatMonthKey, toMonthKey } from "@/lib/date-utils";

export function Archive() {
  const { months, setActiveMonth, setSelectedDay, removeMonth } =
    useVocabStore();
  const isMastered = useProgressStore((s) => s.isMastered);
  const wordOrder = useSettingsStore((s) => s.wordOrder);
  const navigate = useAppStore((s) => s.navigate);
  const showToast = useAppStore((s) => s.showToast);

  const sorted = useMemo(
    () =>
      Object.values(months).sort((a, b) => b.month.localeCompare(a.month)),
    [months],
  );
  const currentMonthKey = toMonthKey(new Date());

  if (sorted.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <EmptyState
          icon={ArchiveIcon}
          title="Archive is empty"
          description="Every month you load will appear here for revisiting, or generate one with Claude."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <JsonImporter />
              <VocabGenerator />
              <ImportDeckButton />
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Archive
          </p>
          <h1 className="display-serif text-3xl font-semibold">
            All months.
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <JsonImporter />
          <VocabGenerator />
          <ImportDeckButton />
        </div>
      </div>

      <section className="mb-8">
        <h2 className="text-sm font-medium mb-3">Bundled vocabulary</h2>
        <VocabLibrary />
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        {sorted.map((month, i) => {
          // Browsing a month, so the preference applies. Seeded per month so
          // a shuffled archive is stable for the day rather than reshuffling
          // under the cursor on every render.
          const allWords = orderWords(
            allWordsInMonth(month),
            wordOrder,
            seedFor([month.month, "archive", dayKey(new Date())]),
          );
          const total = allWords.length;
          const mastered = allWords.filter((w) => isMastered(w.id)).length;
          const pct = total > 0 ? (mastered / total) * 100 : 0;
          const isCurrent = month.month === currentMonthKey;

          return (
            <motion.div
              key={month.month}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card className={isCurrent ? "border-accent/40" : undefined}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5">
                        {isCurrent ? "Current" : "Archived"}
                      </p>
                      <h3 className="display-serif text-xl font-semibold">
                        {formatMonthKey(month.month)}
                      </h3>
                    </div>
                    <Badge variant="outline" className="tabular">
                      {month.days.length} days
                    </Badge>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-baseline justify-between mb-2">
                      <p className="text-xs text-muted-foreground">
                        {mastered} of {total} mastered
                      </p>
                      <p className="text-xs tabular font-medium">
                        {Math.round(pct)}%
                      </p>
                    </div>
                    <Progress value={pct} />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setActiveMonth(month.month);
                        setSelectedDay(month.days[0]?.day ?? 1);
                        navigate("practice");
                      }}
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      Open
                    </Button>
                    <AddWordsButton month={month} />
                    <ShareDeckButton month={month} />
                    <Button
                      aria-label="Remove this month"
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (
                          confirm(
                            `Remove ${formatMonthKey(month.month)} from the archive? Your progress is preserved.`,
                          )
                        ) {
                          removeMonth(month.month);
                          showToast({
                            title: "Month removed",
                            description: `${formatMonthKey(month.month)} is no longer loaded`,
                          });
                        }
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

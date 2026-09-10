import { motion } from "framer-motion";
import {
  BookOpen,
  CalendarClock,
  Flame,
  GraduationCap,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/EmptyState";
import { JsonImporter } from "@/components/JsonImporter";
import { useVocabStore } from "@/store/useVocabStore";
import { useProgressStore } from "@/store/useProgressStore";
import { useAppStore } from "@/store/useAppStore";
import { calculateStreaks } from "@/lib/streak";
import { toMonthKey, formatMonthKey } from "@/lib/date-utils";
import { countDue } from "@/lib/sm2";
import { cn } from "@/lib/utils";

export function Dashboard() {
  const months = useVocabStore((s) => s.months);
  const setActiveMonth = useVocabStore((s) => s.setActiveMonth);
  const setSelectedDay = useVocabStore((s) => s.setSelectedDay);
  const navigate = useAppStore((s) => s.navigate);
  const wordsProgress = useProgressStore((s) => s.words);
  const activity = useProgressStore((s) => s.activity);

  const monthKeys = Object.keys(months).sort();
  const todayMonthKey = toMonthKey(new Date());
  const currentMonth = months[todayMonthKey] ?? months[monthKeys[monthKeys.length - 1] ?? ""];
  const today = new Date();
  const todayDay = today.getDate();
  const todaysWords = currentMonth?.days.find((d) => d.day === todayDay)?.words ?? [];

  const streaks = useMemo(() => calculateStreaks(activity), [activity]);

  // Aggregate stats
  const totalWords = Object.values(months).reduce(
    (sum, m) => sum + m.days.reduce((s, d) => s + d.words.length, 0),
    0,
  );
  const mastered = Object.values(wordsProgress).filter((w) => w.mastered).length;
  const quizAttempts = Object.values(wordsProgress).reduce(
    (s, w) => s + w.quizAttempts,
    0,
  );
  const quizCorrect = Object.values(wordsProgress).reduce(
    (s, w) => s + w.quizCorrect,
    0,
  );
  const accuracy = quizAttempts > 0 ? quizCorrect / quizAttempts : 0;

  // Words the SM-2 scheduler has queued for today or earlier. Counted across
  // every loaded month, not just the current one — a review is a review.
  const allWordIds = useMemo(
    () =>
      Object.values(months).flatMap((m) =>
        m.days.flatMap((d) => d.words.map((w) => w.id)),
      ),
    [months],
  );
  const dueCount = useMemo(
    () => countDue(allWordIds, wordsProgress),
    [allWordIds, wordsProgress],
  );

  if (monthKeys.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Welcome
          </p>
          <h1 className="display-serif text-4xl font-semibold">
            Let's build your vocabulary.
          </h1>
          <p className="mt-2 text-muted-foreground">
            Load a month of words to start practicing three every day.
          </p>
        </div>
        <EmptyState
          icon={BookOpen}
          title="No vocabulary loaded yet"
          description="Drop a JSON file or point to a folder. Each file contains a month's worth of words — 3 per day."
          action={<JsonImporter />}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-1">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
        <h1 className="display-serif text-4xl font-semibold">
          Good {greeting()}.
        </h1>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-8">
        <StatCard
          icon={Flame}
          label="Current streak"
          value={streaks.current}
          suffix={streaks.current === 1 ? "day" : "days"}
          highlight={streaks.current > 0}
          delay={0}
        />
        <StatCard
          icon={Sparkles}
          label="Words mastered"
          value={mastered}
          suffix={`of ${totalWords}`}
          delay={0.05}
        />
        <StatCard
          icon={GraduationCap}
          label="Quiz accuracy"
          value={quizAttempts > 0 ? Math.round(accuracy * 100) : 0}
          suffix={quizAttempts > 0 ? "%" : "— take a quiz"}
          delay={0.1}
        />
        <StatCard
          icon={TrendingUp}
          label="Longest streak"
          value={streaks.longest}
          suffix={streaks.longest === 1 ? "day" : "days"}
          delay={0.15}
        />
      </div>

      {dueCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.18 }}
          className="mt-6"
        >
          <Card className="border-accent/40 bg-accent/[0.03]">
            <CardContent className="p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <CalendarClock className="w-5 h-5 text-accent shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    <span className="tabular">{dueCount}</span>{" "}
                    {dueCount === 1 ? "word is" : "words are"} due for review
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Spaced repetition schedules these before they fade.
                  </p>
                </div>
              </div>
              <Button onClick={() => navigate("flashcards")}>
                <CalendarClock className="w-4 h-4" />
                Review now
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="mt-10"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Today's practice</h2>
          <p className="text-xs text-muted-foreground">
            {todaysWords.length > 0
              ? `${todaysWords.length} words • ${currentMonth?.displayName}`
              : "No words scheduled for today"}
          </p>
        </div>
        {todaysWords.length > 0 && currentMonth ? (
          <Card>
            <CardContent className="p-5">
              <div className="grid gap-3 md:grid-cols-3">
                {todaysWords.map((w, i) => (
                  <motion.div
                    key={w.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.1 + i * 0.06 }}
                    className="rounded-lg border border-border/60 bg-secondary/40 p-4"
                  >
                    <p className="display-serif text-xl font-semibold truncate">
                      {w.word}
                    </p>
                    <p className="text-xs text-muted-foreground italic mt-0.5">
                      {w.partOfSpeech}
                    </p>
                    <div className="mt-3">
                      <MasteredDot mastered={wordsProgress[w.id]?.mastered ?? false} />
                    </div>
                  </motion.div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    setActiveMonth(currentMonth.month);
                    setSelectedDay(todayDay);
                    navigate("practice");
                  }}
                >
                  <BookOpen className="w-4 h-4" />
                  Start today's practice
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate("flashcards")}
                >
                  Study flashcards
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => navigate("sentences")}
                >
                  Write sentences
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <EmptyState
            icon={BookOpen}
            title={`No words for ${today.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
            description={
              currentMonth
                ? `${currentMonth.displayName} doesn't have a day ${todayDay} entry. Browse other days from the calendar or archive.`
                : `Load ${formatMonthKey(todayMonthKey)} vocabulary to see today's words.`
            }
            action={
              <Button variant="outline" onClick={() => navigate("calendar")}>
                Open calendar
              </Button>
            }
          />
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.35 }}
        className="mt-10"
      >
        <h2 className="text-lg font-semibold mb-4">Overall progress</h2>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-sm text-muted-foreground">
                Mastered {mastered} of {totalWords} loaded words
              </p>
              <p className="tabular text-sm font-medium">
                {totalWords > 0 ? Math.round((mastered / totalWords) * 100) : 0}%
              </p>
            </div>
            <Progress
              value={totalWords > 0 ? (mastered / totalWords) * 100 : 0}
            />
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  highlight,
  delay = 0,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  suffix?: string;
  highlight?: boolean;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <Card
        className={cn(
          "transition-colors",
          highlight && "border-accent/40 bg-accent/[0.03]",
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Icon
              className={cn(
                "w-3.5 h-3.5",
                highlight && "text-accent",
              )}
            />
            <p className="text-[11px] uppercase tracking-wider font-medium">
              {label}
            </p>
          </div>
          <div className="flex items-baseline gap-1.5">
            <p className="display-serif text-3xl font-semibold tabular">
              {value}
            </p>
            {suffix && (
              <p className="text-xs text-muted-foreground">{suffix}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function MasteredDot({ mastered }: { mastered: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          mastered ? "bg-success" : "bg-muted-foreground/30",
        )}
      />
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {mastered ? "Mastered" : "In progress"}
      </p>
    </div>
  );
}

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartLine,
  Flame,
  Sparkles,
  Trophy,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { buildHeatmap, calculateStreaksWithFreezes } from "@/lib/streak";
import { allWordsInMonth } from "@/lib/vocabulary";
import { daysInMonth, format, toDateKey } from "@/lib/date-utils";
import { keyOf } from "@/lib/track";
import { cn } from "@/lib/utils";

type Range = "month" | "quarter" | "year";

export function ProgressPage() {
  const months = useVocabStore((s) => s.months);
  const getAllMonths = useVocabStore((s) => s.getAllMonths);
  const words = useProgressStore((s) => s.words);
  const activity = useProgressStore((s) => s.activity);

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [range, setRange] = useState<Range>("month");

  // One missed day a week does not end a run. ADR 0006.
  const exams = useProgressStore((s) => s.exams);
  const streaks = useMemo(
    () => calculateStreaksWithFreezes(activity),
    [activity],
  );
  const heatmap = useMemo(() => buildHeatmap(activity, year), [activity, year]);

  const allWords = useMemo(
    () => Object.values(months).flatMap(allWordsInMonth),
    [months],
  );
  const mastered = Object.values(words).filter((w) => w.mastered);
  const quizAttempts = Object.values(words).reduce(
    (s, w) => s + w.quizAttempts,
    0,
  );
  const quizCorrect = Object.values(words).reduce(
    (s, w) => s + w.quizCorrect,
    0,
  );
  const accuracy = quizAttempts > 0 ? quizCorrect / quizAttempts : 0;

  // Chart data based on range
  const chartData = useMemo(() => {
    if (range === "month") {
      const monthKey = `${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
      return daysInMonth(monthKey).map((d) => {
        const key = toDateKey(d);
        const a = activity[key];
        return {
          label: format(d, "d"),
          mastered: a?.wordsMastered ?? 0,
          reviewed: a?.wordsReviewed ?? 0,
        };
      });
    }
    if (range === "quarter") {
      const currentQ = Math.floor(new Date().getMonth() / 3);
      const startMonth = currentQ * 3;
      const monthKeys: string[] = [];
      for (let i = 0; i < 3; i++) {
        monthKeys.push(
          `${year}-${String(startMonth + i + 1).padStart(2, "0")}`,
        );
      }
      return monthKeys.map((mk) => {
        let m = 0;
        let r = 0;
        for (const [date, a] of Object.entries(activity)) {
          if (date.startsWith(mk)) {
            m += a.wordsMastered;
            r += a.wordsReviewed;
          }
        }
        return {
          label: format(new Date(`${mk}-01`), "MMM"),
          mastered: m,
          reviewed: r,
        };
      });
    }
    // year
    return Array.from({ length: 12 }).map((_, i) => {
      const mk = `${year}-${String(i + 1).padStart(2, "0")}`;
      let m = 0;
      let r = 0;
      for (const [date, a] of Object.entries(activity)) {
        if (date.startsWith(mk)) {
          m += a.wordsMastered;
          r += a.wordsReviewed;
        }
      }
      return {
        label: format(new Date(`${mk}-01`), "MMM"),
        mastered: m,
        reviewed: r,
      };
    });
  }, [range, activity, year]);

  const monthlyBreakdown = useMemo(() => {
    // Teaching order, from the schedule — the order the user actually meets
    // them in, which after a reorder is not ordinal order.
    return getAllMonths().map((m) => {
      const wordsInMonth = allWordsInMonth(m);
      const mCount = wordsInMonth.filter((w) => words[w.id]?.mastered).length;
      return {
        key: keyOf(m),
        name: m.title,
        total: wordsInMonth.length,
        mastered: mCount,
      };
    });
  }, [getAllMonths, months, words]);

  if (allWords.length === 0) {
    return (
      <div className="w-full lg:max-w-3xl lg:mx-auto py-12">
        <EmptyState
          icon={ChartLine}
          title="No progress to show yet"
          description="Load vocabulary and start practicing to see your growth."
          action={<JsonImporter />}
        />
      </div>
    );
  }

  return (
    <div className="w-full lg:max-w-5xl lg:mx-auto py-8 space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Progress
          </p>
          <h1 className="display-serif text-3xl font-semibold">Your growth.</h1>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat
          icon={Flame}
          label="Current streak"
          value={streaks.current}
          suffix="days"
        />
        <MiniStat
          icon={Trophy}
          label="Longest streak"
          value={streaks.longest}
          suffix="days"
        />
        <MiniStat
          icon={Sparkles}
          label="Words mastered"
          value={mastered.length}
          suffix={`of ${allWords.length}`}
        />
        <MiniStat
          icon={ChartLine}
          label="Quiz accuracy"
          value={quizAttempts > 0 ? Math.round(accuracy * 100) : 0}
          suffix={quizAttempts > 0 ? "%" : "no attempts"}
        />
      </div>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Activity heatmap</h2>
          <Select
            value={String(year)}
            onValueChange={(v) => setYear(Number(v))}
          >
            <SelectTrigger className="w-[110px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 5 }).map((_, i) => {
                const y = currentYear - 2 + i;
                return (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        <Card>
          <CardContent className="p-5">
            <Heatmap year={year} heatmap={heatmap} />
          </CardContent>
        </Card>
      </section>

      {exams.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Exam history</h2>
          <Card>
            <CardContent className="p-5 space-y-3">
              {/* The point of testing on a schedule is seeing the line move. */}
              <div className="flex items-end gap-1 h-20">
                {exams
                  .slice(0, 20)
                  .reverse()
                  .map((exam) => {
                    const percent = exam.percent;
                    return (
                      <div
                        key={exam.id}
                        className="flex-1 bg-accent/70 rounded-t min-h-[2px]"
                        style={{ height: `${Math.max(percent, 2)}%` }}
                        title={`${percent}%`}
                      />
                    );
                  })}
              </div>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-muted-foreground">
                  {exams.length} exam{exams.length === 1 ? "" : "s"} taken
                </span>
                <span className="tabular">
                  Best {Math.max(...exams.map((e) => e.percent))}%
                  <span className="text-muted-foreground">
                    {" "}
                    · latest {exams[0].percent}%
                  </span>
                </span>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Activity trend</h2>
          <Select value={range} onValueChange={(v) => setRange(v as Range)}>
            <SelectTrigger className="w-[140px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="quarter">This quarter</SelectItem>
              <SelectItem value="year">This year</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Card>
          <CardContent className="p-4">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--secondary))" }}
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Bar
                    dataKey="mastered"
                    fill="hsl(var(--accent))"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">By month</h2>
        <div className="space-y-2">
          {monthlyBreakdown.map((m, i) => (
            <motion.div
              key={m.key}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-sm">{m.name}</p>
                <Badge variant="outline" className="tabular">
                  {m.mastered} / {m.total}
                </Badge>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: `${m.total > 0 ? (m.mastered / m.total) * 100 : 0}%`,
                  }}
                  transition={{ duration: 0.6, delay: 0.1 + i * 0.03 }}
                  className="h-full bg-accent"
                />
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  suffix,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <Icon className="w-3.5 h-3.5" />
          <p className="text-[11px] uppercase tracking-wider font-medium">
            {label}
          </p>
        </div>
        <div className="flex items-baseline gap-1.5">
          <p className="display-serif text-3xl font-semibold tabular">
            {value}
          </p>
          {suffix && <p className="text-xs text-muted-foreground">{suffix}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function Heatmap({
  year,
  heatmap,
}: {
  year: number;
  heatmap: Map<string, number>;
}) {
  // Build all days of year
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const days: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }

  // Pad to start of week (Sunday)
  const startPad = start.getDay();
  const cells: Array<{ date: Date | null; intensity: number }> = [];
  for (let i = 0; i < startPad; i++) cells.push({ date: null, intensity: 0 });
  for (const d of days) {
    cells.push({
      date: d,
      intensity: heatmap.get(toDateKey(d)) ?? 0,
    });
  }

  // Group into weeks
  const weeks: Array<Array<{ date: Date | null; intensity: number }>> = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return (
    <div>
      <div className="flex gap-[3px] overflow-x-auto no-scrollbar pb-2">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((cell, di) => (
              <div
                key={di}
                className={cn(
                  "w-[11px] h-[11px] rounded-sm transition-colors",
                  !cell.date && "bg-transparent",
                  cell.date && intensityClass(cell.intensity),
                )}
                title={
                  cell.date
                    ? `${format(cell.date, "MMM d, yyyy")} — activity: ${cell.intensity}/4`
                    : ""
                }
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 mt-3 text-[10px] text-muted-foreground">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn("w-[11px] h-[11px] rounded-sm", intensityClass(i))}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

function intensityClass(i: number): string {
  return [
    "bg-secondary",
    "bg-accent/20",
    "bg-accent/40",
    "bg-accent/70",
    "bg-accent",
  ][i] ?? "bg-secondary";
}

// Referenced but unused warning fix
void Cell;

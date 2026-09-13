/**
 * Building and running a generation plan.
 *
 * The point of a plan being data is that it can be looked at before it is
 * spent. Everything above the Generate button is local — no provider is
 * contacted to draw a preview — which makes it the cheapest possible way to
 * avoid burning a year of generation on the wrong settings.
 *
 * Progress is kept as a checkpoint rather than a spinner, so a run that dies at
 * month 9 offers to resume at month 9 instead of starting over.
 *
 * See docs/VOCAB-GENERATION.md and src/lib/generation-plan.ts.
 */

import { describeMonthKey } from "@/lib/track";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVocabStore } from "@/store/useVocabStore";
import { useAppStore } from "@/store/useAppStore";
import { selectProvider } from "@/lib/ai/client";
import { AiError } from "@/lib/ai/errors";
import {
  defaultPlan,
  HORIZON_MONTHS,
  planErrors,
  planMonths,
  previewPlan,
  splitWordList,
  totalWords,
  type Difficulty,
  type GenerationPlan,
  type Horizon,
} from "@/lib/generation-plan";
import {
  newCheckpoint,
  remainingMonths,
  runPlan,
  summarize,
  type RunCheckpoint,
} from "@/lib/generation-run";
import { cn } from "@/lib/utils";

const HORIZONS: Array<{ value: Horizon; label: string }> = [
  { value: "month", label: "A month" },
  { value: "quarter", label: "A quarter" },
  { value: "half-year", label: "Six months" },
  { value: "year", label: "A year" },
];

const DIFFICULTIES: Array<{ value: Difficulty; label: string; hint: string }> = [
  { value: "gentle", label: "Gentle", hint: "Stays approachable" },
  { value: "steady", label: "Steady", hint: "Builds across the plan" },
  { value: "aggressive", label: "Hard", hint: "Difficult from day one" },
];

export function PlanBuilder({ onDone }: { onDone: () => void }) {
  const months = useVocabStore((s) => s.months);
  const activeTrack = useVocabStore((s) => s.activeTrack);
  const nextOrdinal = useVocabStore((s) => s.nextOrdinal);
  const loadMonth = useVocabStore((s) => s.loadMonth);
  const getVocabIndex = useVocabStore((s) => s.getVocabIndex);
  const showToast = useAppStore((s) => s.showToast);

  const [plan, setPlan] = useState<GenerationPlan>(() =>
    defaultPlan(nextOrdinal(activeTrack), activeTrack),
  );
  const [mustIncludeText, setMustIncludeText] = useState("");
  const [checkpoint, setCheckpoint] = useState<RunCheckpoint | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const effectivePlan = useMemo<GenerationPlan>(
    () => ({ ...plan, mustInclude: splitWordList(mustIncludeText) }),
    [plan, mustIncludeText],
  );

  const preview = useMemo(
    () => previewPlan(effectivePlan, getVocabIndex()),
    [effectivePlan, getVocabIndex],
  );

  const errors = planErrors(effectivePlan);

  /**
   * Months the plan covers that are already loaded.
   *
   * These are skipped rather than overwritten: committing over a loaded month
   * would throw away words the user may have been studying for weeks.
   */
  const occupied = useMemo(
    () => planMonths(effectivePlan).filter((key) => key in months),
    [effectivePlan, months],
  );

  const done = new Set(checkpoint?.completed ?? []);
  // A month that failed and was then generated on resume is no longer a
  // failure. Judging by the outcome log alone leaves a stale X on it forever.
  const failedMonth = checkpoint?.outcomes.find(
    (o) => !o.month && !done.has(o.monthKey),
  );
  const canResume =
    checkpoint !== null && !busy && remainingMonths(checkpoint).length > 0;

  function update(patch: Partial<GenerationPlan>) {
    setPlan((current) => ({ ...current, ...patch }));
    setCheckpoint(null);
  }

  async function run(resume: boolean) {
    setError(null);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;

    // Occupied months count as already done, so the run skips them.
    const starting: RunCheckpoint = resume
      ? checkpoint!
      : {
          ...newCheckpoint(effectivePlan),
          completed: [...occupied],
        };

    try {
      const provider = await selectProvider();
      const finished = await runPlan({
        plan: effectivePlan,
        provider,
        index: getVocabIndex(),
        commit: (month) => {
          const result = loadMonth(month);
          if (!result.ok) throw new Error(result.error);
        },
        checkpoint: starting,
        onProgress: setCheckpoint,
        signal: controller.signal,
      });

      setCheckpoint(finished);
      const summary = summarize(finished);
      const generated = summary.months - occupied.length;
      // What matters is whether anything is still outstanding, not whether
      // anything ever failed: a month retried successfully is done.
      const outstanding = remainingMonths(finished);

      if (outstanding.length > 0) {
        setError(
          `Stopped at ${describeMonthKey(outstanding[0])}. What was generated is saved — you can resume.`,
        );
      } else if (generated > 0) {
        showToast({
          title: `Generated ${generated} month${generated === 1 ? "" : "s"}`,
          description: [
            `${summary.words} words`,
            summary.duplicates > 0
              ? `${summary.duplicates} duplicate${summary.duplicates === 1 ? "" : "s"} filtered out`
              : "",
            summary.short.length > 0
              ? `${summary.short.length} month${summary.short.length === 1 ? " came" : "s came"} up short`
              : "",
          ]
            .filter(Boolean)
            .join(" · "),
          variant: "success",
        });
        onDone();
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      if (e instanceof AiError && e.kind === "cancelled") return;
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Field label="How far ahead">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {HORIZONS.map((h) => (
            <Choice
              key={h.value}
              active={plan.horizon === h.value}
              disabled={busy}
              onClick={() => update({ horizon: h.value })}
            >
              {h.label}
              <span className="block text-[10px] text-muted-foreground">
                {HORIZON_MONTHS[h.value] * plan.wordsPerDay * 30} words
              </span>
            </Choice>
          ))}
        </div>
      </Field>

      <div className="flex gap-3">
        <Field label="Starting at month" className="flex-1">
          {/* A teaching position, not a date. When these months fall on the
              calendar is the schedule's business, not the plan's. */}
          <Input
            type="number"
            min={1}
            value={plan.startOrdinal}
            onChange={(e) =>
              update({ startOrdinal: Math.max(1, Number(e.target.value) || 1) })
            }
            className="tabular"
            disabled={busy}
          />
        </Field>
        <Field label="Words a day" className="w-28">
          <Input
            type="number"
            min={1}
            max={10}
            value={plan.wordsPerDay}
            onChange={(e) => update({ wordsPerDay: Number(e.target.value) || 1 })}
            className="tabular"
            disabled={busy}
          />
        </Field>
      </div>

      <Field label="Difficulty">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {DIFFICULTIES.map((d) => (
            <Choice
              key={d.value}
              active={plan.difficulty === d.value}
              disabled={busy}
              onClick={() => update({ difficulty: d.value })}
            >
              {d.label}
              <span className="block text-[10px] text-muted-foreground">
                {d.hint}
              </span>
            </Choice>
          ))}
        </div>
      </Field>

      <Field label="What kind of vocabulary">
        <Input
          value={plan.register}
          onChange={(e) => update({ register: e.target.value })}
          placeholder="GRE high-frequency"
          disabled={busy}
        />
      </Field>

      <Field label="Words you want included (optional)">
        <textarea
          value={mustIncludeText}
          onChange={(e) => {
            setMustIncludeText(e.target.value);
            setCheckpoint(null);
          }}
          placeholder="perspicacious, obdurate&#10;or one per line"
          rows={2}
          disabled={busy}
          className="w-full rounded-md border border-input bg-background p-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          Placed in the earliest months, and never dropped.
        </p>
      </Field>

      {/* Everything below here is computed locally. Nothing has been spent. */}
      <div className="rounded-md border border-border/60 p-3 space-y-2">
        <p className="text-xs">
          <span className="font-medium">{preview.months.length}</span> month
          {preview.months.length === 1 ? "" : "s"} ·{" "}
          <span className="font-medium tabular">
            {totalWords(effectivePlan)}
          </span>{" "}
          words
          {occupied.length > 0 && (
            <span className="text-muted-foreground">
              {" "}
              · {occupied.length} already loaded and will be skipped
            </span>
          )}
        </p>

        <div className="flex flex-wrap gap-1">
          {preview.months.map((m) => {
            const skipped = occupied.includes(m.key);
            const complete = done.has(m.key) && !skipped;
            const failed = failedMonth?.monthKey === m.key;
            return (
              <span
                key={m.key}
                className={cn(
                  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] border",
                  complete && "border-success/50 bg-success/10 text-foreground",
                  failed && "border-destructive/50 bg-destructive/10",
                  skipped && "border-border/40 text-muted-foreground line-through",
                  !complete && !failed && !skipped && "border-border/60 text-muted-foreground",
                )}
              >
                {complete && <Check className="w-2.5 h-2.5" />}
                {failed && <X className="w-2.5 h-2.5" />}
                {busy && !complete && !skipped && !failed && (
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                )}
                {m.label}
              </span>
            );
          })}
        </div>

        {preview.warnings.map((warning) => (
          <p
            key={warning}
            className="text-[11px] text-warning flex items-start gap-1.5 leading-relaxed"
          >
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            {warning}
          </p>
        ))}

        {preview.alreadyHave.length > 0 && (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {preview.alreadyHave
              .map(
                (h) =>
                  `${h.word} (${h.retired ? "removed" : describeMonthKey(h.monthKey)})`,
              )
              .join(", ")}
          </p>
        )}
      </div>

      {errors.map((message) => (
        <p key={message} className="text-xs text-destructive" role="alert">
          {message}
        </p>
      ))}

      {error && (
        <p className="text-xs text-destructive leading-relaxed" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => void run(canResume)}
          disabled={busy || errors.length > 0}
        >
          <Wand2 className="w-4 h-4" />
          {busy
            ? `Generating ${done.size + 1} of ${preview.months.length}…`
            : canResume
              ? "Resume"
              : "Generate"}
        </Button>
        {busy && (
          <Button
            variant="ghost"
            onClick={() => {
              abortRef.current?.abort();
              setBusy(false);
            }}
          >
            Stop
          </Button>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Each month is saved as it finishes, so stopping — or a failure partway —
        keeps everything generated so far. Words you already have, including
        from months you removed, are never generated again.
      </p>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-xs text-muted-foreground mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

function Choice({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md border p-2 text-xs text-left transition-colors",
        active
          ? "border-accent bg-accent/10 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

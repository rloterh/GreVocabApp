/**
 * Executing a generation plan, month by month, resumably.
 *
 * Three things make this more than a loop over `generateMonth`:
 *
 * 1. **Overage.** Ask for 25% more than needed and enforce uniqueness locally.
 *    The avoid-list in the prompt is an optimisation; this is the enforcement.
 * 2. **Checkpointing.** A year-long plan that fails at month 9 resumes at month
 *    9, not month 1. Each committed month is a checkpoint.
 * 3. **Accepting a short month.** Two rounds maximum, then keep what came back
 *    and say so. A user who asked for a year should not be blocked by one
 *    stubborn batch.
 *
 * Every committed month updates the index immediately, so month 4's request
 * already knows about months 1–3 within the same run.
 *
 * See docs/VOCAB-GENERATION.md.
 */

import type { VocabMonth } from "@/types";
import type { Provider } from "@/lib/ai/types";
import { generateCards, generateMonth } from "@/lib/generate";
import { checkWord, partitionByQuality } from "@/lib/word-quality";
import { VocabIndex } from "@/lib/vocab-index";
import {
  difficultyAt,
  difficultyLabel,
  distributeMustInclude,
  planMonths,
  requestCount,
  wordsPerMonth,
  type GenerationPlan,
} from "@/lib/generation-plan";

/** How many words of the index to spend context on. */
const AVOID_SAMPLE = 300;

/** Rounds per month: the first request, then one top-up. */
const MAX_ROUNDS = 2;

/** What happened to one month. */
export interface MonthOutcome {
  monthKey: string;
  /** Absent when the month failed outright. */
  month?: VocabMonth;
  requested: number;
  produced: number;
  /** Rejected as duplicates of something already known. */
  duplicates: number;
  /** Cards that failed a local quality check and were regenerated once. */
  repaired: number;
  /** Set when the month came back short of what was asked for. */
  shortfall?: number;
  error?: string;
}

/** Resumable state. Persist this and hand it back to continue. */
export interface RunCheckpoint {
  plan: GenerationPlan;
  /** Month keys already committed, in order. */
  completed: string[];
  outcomes: MonthOutcome[];
  startedAt: string;
}

export interface RunOptions {
  plan: GenerationPlan;
  provider: Provider;
  /** Built from what the user already has. Updated as months commit. */
  index: VocabIndex;
  /** Commit a finished month. Throwing here aborts the run. */
  commit: (month: VocabMonth) => void | Promise<void>;
  /** Resume from here rather than starting over. */
  checkpoint?: RunCheckpoint;
  /** Called after every month, committed or not, so the UI can persist it. */
  onProgress?: (checkpoint: RunCheckpoint) => void;
  signal?: AbortSignal;
}

export function newCheckpoint(plan: GenerationPlan): RunCheckpoint {
  return { plan, completed: [], outcomes: [], startedAt: new Date().toISOString() };
}

/** Months of the plan that still need generating. */
export function remainingMonths(checkpoint: RunCheckpoint): string[] {
  const done = new Set(checkpoint.completed);
  return planMonths(checkpoint.plan).filter((key) => !done.has(key));
}

/**
 * Run the plan.
 *
 * Returns the checkpoint, whether it finished or stopped early. A caller that
 * gets back a checkpoint with months remaining can pass it straight back in.
 */
export async function runPlan(options: RunOptions): Promise<RunCheckpoint> {
  const { plan, provider, index, commit, onProgress, signal } = options;
  const checkpoint: RunCheckpoint = options.checkpoint
    ? { ...options.checkpoint, outcomes: [...options.checkpoint.outcomes] }
    : newCheckpoint(plan);

  const allMonths = planMonths(plan);
  const required = distributeMustInclude(plan);
  const needed = wordsPerMonth(plan);

  for (const monthKey of remainingMonths(checkpoint)) {
    if (signal?.aborted) break;

    const monthIndex = allMonths.indexOf(monthKey);
    const outcome = await generateOneMonth({
      plan,
      provider,
      index,
      monthKey,
      monthIndex,
      needed,
      mustInclude: required.get(monthKey) ?? [],
      signal,
    });

    checkpoint.outcomes.push(outcome);

    if (outcome.month) {
      await commit(outcome.month);
      // Immediately, so the next month's request already knows about this one.
      index.addMonth(outcome.month, "generated");
      checkpoint.completed.push(monthKey);
    }

    onProgress?.({ ...checkpoint, outcomes: [...checkpoint.outcomes] });

    // A month that failed outright stops the run. Resuming picks up here, and
    // pressing on would usually just fail eleven more times.
    if (!outcome.month) break;
  }

  return checkpoint;
}

interface MonthRequest {
  plan: GenerationPlan;
  provider: Provider;
  index: VocabIndex;
  monthKey: string;
  monthIndex: number;
  needed: number;
  mustInclude: string[];
  signal?: AbortSignal;
}

async function generateOneMonth(request: MonthRequest): Promise<MonthOutcome> {
  const { plan, provider, index, monthKey, monthIndex, needed, mustInclude, signal } =
    request;

  const kept: VocabMonth["days"][number]["words"] = [];
  let duplicates = 0;
  let requested = 0;

  // Words the user insisted on are placed first and never dropped, so they do
  // not have to survive a filter they would fail against their own entry.
  const reserved = mustInclude.length;

  for (let round = 0; round < MAX_ROUNDS && kept.length < needed; round++) {
    const shortfall = needed - kept.length - (round === 0 ? reserved : 0);
    if (shortfall <= 0) break;

    const count = Math.min(90, requestCount(shortfall));
    requested += count;

    let month: VocabMonth;
    try {
      month = await generateMonth({
        provider,
        topic: topicFor(plan, monthIndex, round === 0 ? mustInclude : []),
        wordCount: count,
        monthKey,
        existingWords: index.sample(AVOID_SAMPLE, [
          ...mustInclude,
          ...kept.map((w) => w.word),
        ]),
        signal,
      });
    } catch (error) {
      // A first-round failure is a failed month. A top-up failure is not — we
      // already have words, and a short month beats no month.
      if (round === 0) {
        return {
          monthKey,
          requested,
          produced: 0,
          duplicates,
          repaired: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      break;
    }

    const candidates = month.days.flatMap((day) => day.words);
    const { kept: fresh, rejected } = index.filter(
      candidates,
      (word) => word.word,
    );
    duplicates += rejected.length;

    for (const word of fresh) {
      if (kept.length >= needed) break;
      // Guard against the same word arriving twice across rounds: `filter`
      // does not know what earlier rounds kept.
      if (kept.some((existing) => existing.word === word.word)) continue;
      kept.push(word);
    }
  }

  if (kept.length === 0) {
    return {
      monthKey,
      requested,
      produced: 0,
      duplicates,
      repaired: 0,
      error: "Everything generated for this month was a word you already have.",
    };
  }

  const { words: checked, repaired } = await repairPoorCards(
    kept,
    provider,
    monthKey,
    signal,
  );

  const month = layOut(checked, monthKey, plan, monthIndex);
  return {
    monthKey,
    month,
    requested,
    produced: checked.length,
    duplicates,
    repaired,
    shortfall: checked.length < needed ? needed - checked.length : undefined,
  };
}

/**
 * One targeted regeneration for cards that failed a local check.
 *
 * A card is never dropped for failing: a definition that is slightly too long
 * still teaches the word, and silently shrinking the month would be a worse
 * outcome than an imperfect card. So the repair is kept only when it is
 * actually better, measured the same way the original was judged.
 *
 * One round, and failures here are swallowed: the words are already good
 * enough to commit, and losing a month to a flaky repair request would be
 * absurd.
 */
async function repairPoorCards(
  words: VocabMonth["days"][number]["words"],
  provider: Provider,
  monthKey: string,
  signal?: AbortSignal,
): Promise<{ words: VocabMonth["days"][number]["words"]; repaired: number }> {
  const { bad } = partitionByQuality(words);
  if (bad.length === 0) return { words, repaired: 0 };

  let replacements: VocabMonth["days"][number]["words"] = [];
  try {
    replacements = await generateCards({
      provider,
      words: bad.map((entry) => entry.word.word),
      monthKey,
      notes: bad.flatMap((entry) => entry.issues.map((issue) => issue.message)),
      signal,
    });
  } catch {
    return { words, repaired: 0 };
  }

  const byWord = new Map(
    replacements.map((word) => [word.word.toLowerCase(), word]),
  );

  let repaired = 0;
  const result = words.map((original) => {
    const candidate = byWord.get(original.word.toLowerCase());
    if (!candidate) return original;
    // Better, or not at all. A repair that introduces new problems is not one.
    if (checkWord(candidate).length >= checkWord(original).length) return original;
    repaired++;
    return { ...candidate, id: original.id };
  });

  return { words: result, repaired };
}

/** The theme and difficulty for one month, as a prompt topic. */
export function topicFor(
  plan: GenerationPlan,
  monthIndex: number,
  mustInclude: readonly string[] = [],
): string {
  const theme = plan.themes?.[monthIndex];
  const level = difficultyLabel(difficultyAt(plan, monthIndex));

  const parts = [
    plan.register.trim(),
    theme ? `on the theme of ${theme}` : "",
    `at the level of ${level}`,
  ].filter(Boolean);

  if (mustInclude.length > 0) {
    parts.push(
      `You must include all of these words: ${mustInclude.join(", ")}. Include them in addition to the rest, not instead of them.`,
    );
  }
  return parts.join(", ");
}

/** Lay words across days. Bookkeeping, so it is done here, not by a model. */
function layOut(
  words: VocabMonth["days"][number]["words"],
  monthKey: string,
  plan: GenerationPlan,
  monthIndex: number,
): VocabMonth {
  const days: VocabMonth["days"] = [];
  for (let i = 0; i < words.length; i += plan.wordsPerDay) {
    const day = days.length + 1;
    if (day > 31) break;
    days.push({ day, words: words.slice(i, i + plan.wordsPerDay) });
  }

  const theme = plan.themes?.[monthIndex];
  return {
    month: monthKey,
    displayName: monthKey,
    days,
    description: `Generated: ${plan.register}${theme ? ` — ${theme}` : ""}`,
    createdAt: new Date().toISOString(),
  };
}

/** A short summary of a finished run, for telling the user what happened. */
export function summarize(checkpoint: RunCheckpoint): {
  months: number;
  words: number;
  duplicates: number;
  repaired: number;
  short: string[];
  failed: string[];
} {
  let words = 0;
  let duplicates = 0;
  let repaired = 0;
  const short: string[] = [];
  const failed: string[] = [];

  for (const outcome of checkpoint.outcomes) {
    words += outcome.produced;
    duplicates += outcome.duplicates;
    repaired += outcome.repaired;
    if (outcome.shortfall) short.push(outcome.monthKey);
    if (!outcome.month) failed.push(outcome.monthKey);
  }

  return {
    months: checkpoint.completed.length,
    words,
    duplicates,
    repaired,
    short,
    failed,
  };
}

/**
 * A generation plan, as data rather than a sequence of calls.
 *
 * A year is not twelve independent requests. Difficulty should build, themes
 * should not collide, and the user should be able to look at the whole thing
 * before a single token is spent — which is the cheapest possible way to avoid
 * burning a year's worth of generation on the wrong plan.
 *
 * Making it a value object is what buys that: it can be previewed, edited,
 * saved, re-run after a failure, and resumed from the month it died on.
 *
 * This module is pure. Execution lives in `generation-run.ts`.
 *
 * See docs/VOCAB-GENERATION.md.
 */

import { formatMonthKey } from "@/lib/date-utils";
import { normalizeWord } from "@/lib/stem";
import type { VocabIndex } from "@/lib/vocab-index";

export type Horizon = "month" | "quarter" | "half-year" | "year";

/**
 * How hard the words get, across the horizon rather than at a constant.
 *
 * For a year this is the difference between a usable plan and 365 days of
 * undifferentiated obscurity.
 */
export type Difficulty = "gentle" | "steady" | "aggressive";

export interface GenerationPlan {
  horizon: Horizon;
  /** "YYYY-MM" */
  startMonth: string;
  wordsPerDay: number;
  /** Per-month themes. Generated once for the whole horizon when absent. */
  themes?: string[];
  difficulty: Difficulty;
  /** Words the user requires. Placed first, never dropped. */
  mustInclude: string[];
  /** Register to prefer, e.g. "GRE high-frequency", "academic verbs". */
  register: string;
}

export const HORIZON_MONTHS: Record<Horizon, number> = {
  month: 1,
  quarter: 3,
  "half-year": 6,
  year: 12,
};

/** Days of vocabulary per month. Not calendar days — a steady load. */
export const DAYS_PER_MONTH = 30;

/** Ask for this much more than needed, and enforce uniqueness locally. */
export const OVERAGE = 1.25;

export function defaultPlan(startMonth: string): GenerationPlan {
  return {
    horizon: "quarter",
    startMonth,
    wordsPerDay: 3,
    difficulty: "steady",
    mustInclude: [],
    register: "GRE high-frequency",
  };
}

/** Every month key the plan covers, in order. */
export function planMonths(plan: GenerationPlan): string[] {
  const count = HORIZON_MONTHS[plan.horizon];
  const [year, month] = plan.startMonth.split("-").map(Number);
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    const date = new Date(Date.UTC(year, month - 1 + i, 1));
    keys.push(
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
    );
  }
  return keys;
}

/** Words in one month of this plan. */
export function wordsPerMonth(plan: GenerationPlan): number {
  return plan.wordsPerDay * DAYS_PER_MONTH;
}

/** Words in the whole plan. */
export function totalWords(plan: GenerationPlan): number {
  return wordsPerMonth(plan) * HORIZON_MONTHS[plan.horizon];
}

/**
 * How many to request for a month, given the overage.
 *
 * The core trick of the whole design: rather than trusting a model to respect a
 * thousand-word avoid-list, ask for more than needed and enforce uniqueness
 * locally afterwards.
 */
export function requestCount(needed: number): number {
  return Math.ceil(needed * OVERAGE);
}

/**
 * Where in the difficulty curve a given month sits, 0 to 1.
 *
 * `gentle` stays flat at the bottom, `aggressive` starts high and stays there,
 * `steady` climbs across the horizon. A single-month plan has no curve to
 * speak of and sits at the midpoint of its band.
 */
export function difficultyAt(plan: GenerationPlan, monthIndex: number): number {
  const months = HORIZON_MONTHS[plan.horizon];
  const progress = months <= 1 ? 0.5 : monthIndex / (months - 1);
  switch (plan.difficulty) {
    case "gentle":
      return 0.15 + progress * 0.25;
    case "aggressive":
      return 0.75 + progress * 0.25;
    case "steady":
    default:
      return 0.2 + progress * 0.7;
  }
}

/** The curve, in words a prompt can use. */
export function difficultyLabel(level: number): string {
  if (level < 0.3) return "approachable academic vocabulary";
  if (level < 0.5) return "solid mid-range GRE vocabulary";
  if (level < 0.75) return "demanding GRE vocabulary";
  return "the hardest tier of GRE vocabulary, including low-frequency words";
}

/**
 * Spread the user's required words across the plan's early months.
 *
 * Early on purpose: a word the user asked for should not land in month 11 of a
 * year they may never finish.
 */
export function distributeMustInclude(
  plan: GenerationPlan,
): Map<string, string[]> {
  const months = planMonths(plan);
  const perMonth = wordsPerMonth(plan);
  const spread = new Map<string, string[]>(months.map((m) => [m, []]));

  const words = dedupeRequested(plan.mustInclude);
  words.forEach((word, i) => {
    const target = months[Math.floor(i / perMonth)] ?? months[months.length - 1];
    spread.get(target)!.push(word);
  });
  return spread;
}

/** Requested words, normalised and de-duplicated against each other. */
export function dedupeRequested(words: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of words) {
    const word = normalizeWord(raw);
    if (!word || seen.has(word)) continue;
    seen.add(word);
    kept.push(raw.trim());
  }
  return kept;
}

export interface PlanPreview {
  months: Array<{ key: string; label: string; words: number; theme?: string }>;
  totalWords: number;
  /** Requested words that are already in the index, with where they are. */
  alreadyHave: Array<{ word: string; monthKey: string; retired: boolean }>;
  /** Things worth saying before spending anything. */
  warnings: string[];
}

/**
 * What the plan will do, before it does it.
 *
 * Everything here is local. No provider is contacted to build a preview — that
 * is the point of it.
 */
export function previewPlan(
  plan: GenerationPlan,
  index?: VocabIndex,
): PlanPreview {
  const months = planMonths(plan);
  const perMonth = wordsPerMonth(plan);
  const requested = dedupeRequested(plan.mustInclude);
  const warnings: string[] = [];

  if (requested.length < plan.mustInclude.length) {
    warnings.push(
      `${plan.mustInclude.length - requested.length} repeated word${
        plan.mustInclude.length - requested.length === 1 ? "" : "s"
      } in your list ${
        plan.mustInclude.length - requested.length === 1 ? "was" : "were"
      } ignored.`,
    );
  }

  const capacity = perMonth * months.length;
  if (requested.length > capacity) {
    // Said before generating rather than silently truncating.
    warnings.push(
      `You asked for ${requested.length} specific words but this plan only holds ${capacity}. The last ${requested.length - capacity} will not fit.`,
    );
  }

  const alreadyHave: PlanPreview["alreadyHave"] = [];
  if (index) {
    for (const word of requested) {
      const existing = index.lookup(word);
      if (existing) {
        alreadyHave.push({
          word,
          monthKey: existing.monthKey,
          retired: Boolean(existing.retiredAt),
        });
      }
    }
    if (alreadyHave.length > 0) {
      warnings.push(
        `${alreadyHave.length} of your words ${
          alreadyHave.length === 1 ? "is" : "are"
        } already in your vocabulary. They will be used anyway, where you asked for them.`,
      );
    }
  }

  if (plan.wordsPerDay < 1 || plan.wordsPerDay > 10) {
    warnings.push("Words per day should be between 1 and 10.");
  }

  return {
    months: months.map((key, i) => ({
      key,
      label: formatMonthKey(key),
      words: perMonth,
      theme: plan.themes?.[i],
    })),
    totalWords: capacity,
    alreadyHave,
    warnings,
  };
}

/** Is this plan runnable at all? */
export function planErrors(plan: GenerationPlan): string[] {
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}$/.test(plan.startMonth)) {
    errors.push("Start month must look like 2026-07.");
  }
  if (!Number.isInteger(plan.wordsPerDay) || plan.wordsPerDay < 1) {
    errors.push("Words per day must be a whole number of at least 1.");
  }
  if (plan.wordsPerDay > 10) {
    errors.push("Words per day cannot exceed 10.");
  }
  if (!plan.register.trim()) {
    errors.push("Register must say what kind of vocabulary you want.");
  }
  return errors;
}

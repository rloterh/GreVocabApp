import type { Schedule, Track, VocabMonth } from "@/types";
import { slugify } from "@/lib/date-utils";
import { monthKey as buildMonthKey, wordId as buildWordId } from "@/lib/track";
import { CALENDAR_MONTH_RE } from "@/lib/schedule";

/**
 * The tracks migration.
 *
 * Existing installs have months keyed by calendar month (`"2026-04"`) and word
 * ids with that month baked into them (`"2026-04-abstemious"`). Tracks make a
 * word's identity `"gre-abstemious"` and its month `"gre/01"`, which means
 * every progress record, sentence, quiz, exam and study event that names a
 * word has to be rewritten in step. This is where months of somebody's work
 * is either kept or silently thrown away.
 *
 * Three properties it is built around:
 *
 * 1. **It runs before any store hydrates.** The id map is derived from the
 *    vocabulary and needed by progress; zustand migrates stores independently
 *    and in no defined order, so this cannot be two `migrate` callbacks.
 * 2. **It is idempotent.** Running it on already-migrated data is a no-op, so
 *    a half-finished run — a browser closed mid-write — is recoverable.
 * 3. **It fails closed.** Any error leaves every blob exactly as it was. A
 *    user with un-migrated data has a broken-looking app; a user with
 *    half-migrated data has lost progress, and only one of those is fixable.
 *
 * See docs/adr/0011-tracks.md and docs/SCHEDULE.md.
 */

export const VOCAB_KEY = "lexicon.vocab.v1";
export const PROGRESS_KEY = "lexicon.progress.v1";
export const TRACKS_SCHEMA_VERSION = 2;

/** The track everything that existed before tracks existed belongs to. */
const LEGACY_TRACK: Track = "gre";

export interface MigrationResult {
  ran: boolean;
  reason: string;
  monthsMigrated: number;
  wordsRenamed: number;
  progressRecordsRewritten: number;
  /** Ids in progress that name no word in the migrated corpus. */
  orphans: string[];
}

const NOOP = (reason: string): MigrationResult => ({
  ran: false,
  reason,
  monthsMigrated: 0,
  wordsRenamed: 0,
  progressRecordsRewritten: 0,
  orphans: [],
});

/** The subset of the Storage API this needs, so tests can pass a plain object. */
export interface MigrationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// --- Entry point -------------------------------------------------------------

export function runTracksMigration(storage: MigrationStorage): MigrationResult {
  let vocabRaw: string | null;
  try {
    vocabRaw = storage.getItem(VOCAB_KEY);
  } catch {
    // A browser with site data blocked. Nothing to migrate and nothing to lose.
    return NOOP("storage unavailable");
  }
  if (!vocabRaw) return NOOP("nothing stored");

  let vocabBlob: PersistBlob;
  let progressBlob: PersistBlob | null = null;
  try {
    vocabBlob = JSON.parse(vocabRaw) as PersistBlob;
    const progressRaw = storage.getItem(PROGRESS_KEY);
    if (progressRaw) progressBlob = JSON.parse(progressRaw) as PersistBlob;
  } catch {
    return NOOP("stored state is not JSON");
  }

  const vocabState = vocabBlob?.state;
  if (!vocabState || typeof vocabState !== "object") {
    return NOOP("no vocabulary state");
  }

  const months = (vocabState as Record<string, unknown>).months;
  if (!months || typeof months !== "object") return NOOP("no months");

  const legacyKeys = Object.keys(months as Record<string, unknown>).filter((k) =>
    CALENDAR_MONTH_RE.test(k),
  );
  if (legacyKeys.length === 0) return NOOP("already on tracks");

  // Everything below builds the new state in full before a single write, so a
  // throw anywhere leaves storage untouched.
  const plan = planMigration(
    months as Record<string, LegacyMonth>,
    legacyKeys,
  );

  const nextVocabState = {
    ...(vocabState as Record<string, unknown>),
    months: plan.months,
    schedules: withSchedule(
      (vocabState as Record<string, unknown>).schedules,
      plan.schedule,
    ),
    activeTrack: LEGACY_TRACK,
    activeMonthKey: remapKey(
      (vocabState as Record<string, unknown>).activeMonthKey,
      plan.monthKeys,
    ),
    retiredWords: remapRetired(
      (vocabState as Record<string, unknown>).retiredWords,
      plan.monthKeys,
    ),
  };

  let progressRewritten = 0;
  let nextProgressState: unknown = progressBlob?.state ?? null;
  if (nextProgressState && typeof nextProgressState === "object") {
    nextProgressState = rewriteIds(
      nextProgressState,
      plan.wordIds,
      plan.monthKeys,
    );
    progressRewritten = Object.keys(
      (nextProgressState as Record<string, unknown>).words ?? {},
    ).length;
  }

  storage.setItem(
    VOCAB_KEY,
    JSON.stringify({ ...vocabBlob, state: nextVocabState, version: TRACKS_SCHEMA_VERSION }),
  );
  if (progressBlob && nextProgressState) {
    storage.setItem(
      PROGRESS_KEY,
      JSON.stringify({
        ...progressBlob,
        state: nextProgressState,
        version: TRACKS_SCHEMA_VERSION,
      }),
    );
  }

  return {
    ran: true,
    reason: "migrated",
    monthsMigrated: legacyKeys.length,
    wordsRenamed: Object.keys(plan.wordIds).length,
    progressRecordsRewritten: progressRewritten,
    orphans: findOrphans(nextProgressState, plan.months),
  };
}

// --- Planning ----------------------------------------------------------------

interface LegacyWord {
  id?: unknown;
  word?: unknown;
  [key: string]: unknown;
}
interface LegacyDay {
  day?: unknown;
  words?: unknown;
}
interface LegacyMonth {
  month?: unknown;
  displayName?: unknown;
  days?: unknown;
  [key: string]: unknown;
}
interface PersistBlob {
  state?: unknown;
  version?: unknown;
}

interface Plan {
  months: Record<string, VocabMonth>;
  schedule: Schedule;
  /** Old word id → new word id. */
  wordIds: Record<string, string>;
  /** Old month key → new month key. */
  monthKeys: Record<string, string>;
}

export function planMigration(
  months: Record<string, LegacyMonth>,
  legacyKeys: string[],
): Plan {
  // Chronological, which for "YYYY-MM" is lexicographic. The order decides
  // ordinals, and ordinals decide what the schedule has to reproduce.
  const ordered = [...legacyKeys].sort();

  const nextMonths: Record<string, VocabMonth> = {};
  const wordIds: Record<string, string> = {};
  const monthKeys: Record<string, string> = {};

  // Ids used to be unique for free — each began with its own month, so two
  // months could both hold *abate*. Track-scoped ids give that up, and the
  // collision has to be resolved here, once, in a way progress can follow.
  const takenIds = new Set<string>();

  ordered.forEach((legacyKey, index) => {
    const ordinal = index + 1;
    const legacy = months[legacyKey];
    const newKey = buildMonthKey(LEGACY_TRACK, ordinal);
    monthKeys[legacyKey] = newKey;

    const daysRaw = Array.isArray(legacy?.days) ? (legacy.days as LegacyDay[]) : [];
    const days = daysRaw.map((day) => {
      const wordsRaw = Array.isArray(day?.words) ? (day.words as LegacyWord[]) : [];
      return {
        day: typeof day?.day === "number" ? day.day : 1,
        words: wordsRaw.map((word) => {
          const oldId = typeof word.id === "string" ? word.id : "";
          const text = typeof word.word === "string" ? word.word : "";
          const newId = claim(
            buildWordId(LEGACY_TRACK, slugOf(oldId, legacyKey, text)),
            takenIds,
          );
          if (oldId) wordIds[oldId] = newId;
          return { ...(word as object), id: newId } as VocabMonth["days"][number]["words"][number];
        }),
      };
    });

    nextMonths[newKey] = {
      track: LEGACY_TRACK,
      ordinal,
      // The month's name was its date. Keeping the date as the *title* is what
      // makes the migrated app look unchanged — the label is still "April
      // 2026", it is simply no longer load-bearing.
      title:
        typeof legacy?.displayName === "string" && legacy.displayName.trim()
          ? legacy.displayName
          : legacyKey,
      days,
      author: typeof legacy?.author === "string" ? legacy.author : undefined,
      description:
        typeof legacy?.description === "string" ? legacy.description : undefined,
      createdAt:
        typeof legacy?.createdAt === "string" ? legacy.createdAt : undefined,
    };
  });

  return {
    months: nextMonths,
    schedule: scheduleFor(ordered),
    wordIds,
    monthKeys,
  };
}

/**
 * A schedule that puts every migrated month back on the calendar month it was
 * already on.
 *
 * The subtlety is gaps. A user with April and September and nothing between
 * cannot be described by a dense run of positions from a start month, so a
 * position with no month studied in it holds `0` — a value no ordinal ever
 * takes. Without this, a gap would silently slide every later month forward
 * and the migration would move somebody's work without saying so.
 */
export function scheduleFor(orderedLegacyKeys: string[]): Schedule {
  const startMonth = orderedLegacyKeys[0] ?? "";
  const order: number[] = [];
  orderedLegacyKeys.forEach((key, index) => {
    const position = monthsBetween(startMonth, key);
    while (order.length < position) order.push(0);
    order[position] = index + 1;
  });
  return { track: LEGACY_TRACK, startMonth, order, shuffleSeed: null };
}

function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

/** The part of a legacy id that identifies the word, not its month. */
function slugOf(oldId: string, legacyKey: string, text: string): string {
  if (oldId.startsWith(`${legacyKey}-`)) {
    return oldId.slice(legacyKey.length + 1);
  }
  // An id from somewhere else, or none at all. The word itself is the only
  // thing left to derive identity from, and it is what the parser would use.
  return oldId ? slugify(oldId) : slugify(text);
}

function claim(candidate: string, taken: Set<string>): string {
  let id = candidate;
  let n = 2;
  while (taken.has(id)) id = `${candidate}-${n++}`;
  taken.add(id);
  return id;
}

// --- Rewriting ---------------------------------------------------------------

/**
 * Rewrite every reference to a renamed word or month, anywhere in a blob.
 *
 * Structural rather than field-by-field, and that is the point: progress
 * state names word ids in object keys (`words`), in composite keys
 * (`sentences`, `"<id>:<date>"`), in fields (`wordId`), and in bare arrays
 * (an exam's `missed`). A hand-written walk over the shapes known today would
 * be correct today and quietly wrong the first time one of them gains a field.
 *
 * Only exact matches are rewritten, so a definition or an example that merely
 * contains an id-shaped substring is untouched.
 */
export function rewriteIds(
  value: unknown,
  wordIds: Record<string, string>,
  monthKeys: Record<string, string>,
): unknown {
  if (typeof value === "string") {
    return wordIds[value] ?? monthKeys[value] ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => rewriteIds(item, wordIds, monthKeys));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[rewriteKey(key, wordIds, monthKeys)] = rewriteIds(
        child,
        wordIds,
        monthKeys,
      );
    }
    return out;
  }
  return value;
}

/** Object keys, including the `"<wordId>:<date>"` shape sentences are keyed by. */
function rewriteKey(
  key: string,
  wordIds: Record<string, string>,
  monthKeys: Record<string, string>,
): string {
  const direct = wordIds[key] ?? monthKeys[key];
  if (direct) return direct;
  const colon = key.indexOf(":");
  if (colon > 0) {
    const head = key.slice(0, colon);
    const mapped = wordIds[head] ?? monthKeys[head];
    if (mapped) return mapped + key.slice(colon);
  }
  return key;
}

function remapKey(
  value: unknown,
  monthKeys: Record<string, string>,
): string | null {
  if (typeof value !== "string") return null;
  return monthKeys[value] ?? null;
}

function remapRetired(
  value: unknown,
  monthKeys: Record<string, string>,
): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const e = entry as Record<string, unknown>;
    const key = typeof e.monthKey === "string" ? e.monthKey : "";
    // A retired word whose month predates the ones still loaded has no new
    // key. It keeps blocking regeneration — which is its whole job — under a
    // key that names the track rather than a month that no longer exists.
    return { ...e, monthKey: monthKeys[key] ?? `${LEGACY_TRACK}/retired` };
  });
}

function withSchedule(existing: unknown, schedule: Schedule): unknown {
  const base =
    existing && typeof existing === "object"
      ? (existing as Record<string, unknown>)
      : {};
  return { ...base, [LEGACY_TRACK]: schedule };
}

/**
 * Progress records naming a word the corpus no longer has.
 *
 * Reported rather than repaired. An orphan means the rewrite missed a
 * reference, and quietly dropping the record would destroy the evidence along
 * with the progress.
 */
export function findOrphans(
  progressState: unknown,
  months: Record<string, VocabMonth>,
): string[] {
  if (!progressState || typeof progressState !== "object") return [];
  const words = (progressState as Record<string, unknown>).words;
  if (!words || typeof words !== "object") return [];

  const known = new Set<string>();
  for (const month of Object.values(months)) {
    for (const day of month.days) {
      for (const word of day.words) known.add(word.id);
    }
  }
  return Object.keys(words as Record<string, unknown>).filter(
    (id) => !known.has(id),
  );
}

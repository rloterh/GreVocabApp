import type { Track, VocabMonth, VocabWord } from "@/types";
import { slugify } from "./date-utils";
import { DEFAULT_TRACK, isTrack, wordId } from "./track";

/**
 * The domain contract's parser.
 *
 * Reads both shapes: the ordinal one the app writes today
 * (`{ track, ordinal, title, days }`) and the calendar one every file written
 * before tracks existed used (`{ month: "2026-04", displayName, days }`).
 * The second is not deprecated so much as *foreign* — an exported deck, a
 * share link, someone else's file — and refusing it would break imports that
 * have nothing to do with this change.
 */

export interface ParseOptions {
  /** Track to file the month under when the file does not name one. */
  track?: Track;
  /** Teaching position to use when the file does not carry one. */
  ordinal?: number;
}

/**
 * The first teaching position in a track with nothing in it.
 *
 * Used wherever new vocabulary needs somewhere to land. Replaces the old
 * `firstFreeMonthKey`, which answered the same question in calendar months
 * and therefore could not answer it at all once content stopped having dates.
 */
export function firstFreeOrdinal(taken: Iterable<number>): number {
  const used = new Set(taken);
  let ordinal = 1;
  while (used.has(ordinal)) ordinal++;
  return ordinal;
}

/** Validate and normalize a raw month object into a VocabMonth */
export function parseVocabMonth(
  raw: unknown,
  options: ParseOptions = {},
): VocabMonth {
  if (!raw || typeof raw !== "object") {
    throw new Error("Vocab file must be a JSON object");
  }
  const r = raw as Record<string, unknown>;

  const track: Track = isTrack(r.track)
    ? r.track
    : (options.track ?? DEFAULT_TRACK);

  const ordinal = readOrdinal(r, options);

  // A month's name used to be its date. Now it has to carry its own identity,
  // so a file that offers neither a title nor a legacy display name gets one
  // that is at least unambiguous.
  const title =
    firstNonEmpty(r.title, r.displayName, r.month) ?? `Month ${ordinal}`;

  const daysRaw = r.days;
  if (!Array.isArray(daysRaw) || daysRaw.length === 0) {
    throw new Error("Vocab file must contain a non-empty `days` array");
  }

  // Ids are the key progress records hang off, so two words sharing one would
  // mean mastering either marks both. "well-being" and "well being" slugify
  // identically, which is not a hypothetical.
  const seenIds = new Set<string>();
  const seenDays = new Set<number>();

  const days = daysRaw.map((d, idx) => {
    if (!d || typeof d !== "object") {
      throw new Error(`Day at index ${idx} is not an object`);
    }
    const day = (d as Record<string, unknown>).day;
    // Integer, not merely a number: a day of 1.5 parses, is never equal to
    // any day the UI asks for, and its words silently become unreachable.
    if (
      typeof day !== "number" ||
      !Number.isInteger(day) ||
      day < 1 ||
      day > 31
    ) {
      throw new Error(`Day at index ${idx} has invalid day number`);
    }
    if (seenDays.has(day)) {
      // Silently keeping both would show one and count both: the progress bar
      // would read "0 of 2" beside a single word.
      throw new Error(
        `Day ${day} appears more than once. Each day may only be listed once.`,
      );
    }
    seenDays.add(day);

    const wordsRaw = (d as Record<string, unknown>).words;
    if (!Array.isArray(wordsRaw) || wordsRaw.length === 0) {
      throw new Error(`Day ${day} has no words`);
    }
    const words: VocabWord[] = wordsRaw.map((w, wIdx) => {
      const wo = w as Record<string, unknown>;
      const word = wo.word;
      const partOfSpeech = wo.partOfSpeech;
      const definition = wo.definition;
      const example = wo.example;
      const mnemonic = wo.mnemonic;
      if (typeof word !== "string" || !word.trim()) {
        throw new Error(`Day ${day} word ${wIdx} missing 'word'`);
      }
      if (typeof partOfSpeech !== "string" || !partOfSpeech.trim()) {
        throw new Error(`${word} is missing 'partOfSpeech'`);
      }
      if (typeof definition !== "string" || !definition.trim()) {
        throw new Error(`${word} is missing 'definition'`);
      }
      if (typeof example !== "string" || !example.trim()) {
        throw new Error(`${word} is missing 'example'`);
      }
      if (typeof mnemonic !== "string" || !mnemonic.trim()) {
        throw new Error(`${word} is missing 'mnemonic'`);
      }
      return {
        // An id carried by the file is honoured only when it belongs to this
        // track. A legacy `2026-04-abate` would otherwise survive the parse
        // and reintroduce a calendar into the one field that must not have one.
        id: uniqueId(
          usableId(wo.id, track) ?? wordId(track, slugify(word)),
          seenIds,
        ),
        word,
        partOfSpeech,
        definition,
        example,
        mnemonic,
        synonyms: Array.isArray(wo.synonyms)
          ? (wo.synonyms.filter((s) => typeof s === "string") as string[])
          : undefined,
        antonyms: Array.isArray(wo.antonyms)
          ? (wo.antonyms.filter((s) => typeof s === "string") as string[])
          : undefined,
      };
    });
    return { day, words };
  });

  // Sort days chronologically to be safe
  days.sort((a, b) => a.day - b.day);

  return {
    track,
    ordinal,
    title,
    days,
    author: typeof r.author === "string" ? r.author : undefined,
    description: typeof r.description === "string" ? r.description : undefined,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : undefined,
  };
}

function readOrdinal(
  r: Record<string, unknown>,
  options: ParseOptions,
): number {
  const raw = r.ordinal;
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1) return raw;
  if (raw !== undefined) {
    throw new Error("`ordinal` must be a whole number of 1 or more");
  }
  if (options.ordinal !== undefined) return options.ordinal;
  throw new Error(
    "Missing `ordinal` — this file does not say where in the track it belongs",
  );
}

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

/** An id from a file, if it is one this track can own. */
function usableId(value: unknown, track: Track): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.startsWith(`${track}-`) ? value : null;
}

/**
 * A word id nothing else in this month is using.
 *
 * Deterministic: the same file parsed twice produces the same ids, which it
 * must, because progress records are keyed by them and survive a reload.
 * Suffixing rather than rejecting, because both words are legitimate — it is
 * only the derived id that collides.
 */
function uniqueId(candidate: string, taken: Set<string>): string {
  let id = candidate;
  let n = 2;
  while (taken.has(id)) id = `${candidate}-${n++}`;
  taken.add(id);
  return id;
}

/**
 * Resolve ids that collide with words already in the track.
 *
 * Uniqueness used to come free: an id began with the month it was in, so two
 * months could both contain *abate* and never collide. Track-scoped ids give
 * that up deliberately, and it has to be paid for here — at load, against
 * everything the track already holds, rather than inside a parser that can
 * only see one month.
 *
 * Returns the month unchanged when nothing collides, so the common case
 * allocates nothing.
 */
export function disambiguate(
  month: VocabMonth,
  takenIds: ReadonlySet<string>,
): VocabMonth {
  if (!month.days.some((d) => d.words.some((w) => takenIds.has(w.id)))) {
    return month;
  }
  const taken = new Set(takenIds);
  return {
    ...month,
    days: month.days.map((day) => ({
      ...day,
      words: day.words.map((word) => {
        if (!taken.has(word.id)) {
          taken.add(word.id);
          return word;
        }
        return { ...word, id: uniqueId(word.id, taken) };
      }),
    })),
  };
}

/** Flatten all words from a month */
export function allWordsInMonth(month: VocabMonth): VocabWord[] {
  return month.days.flatMap((d) => d.words);
}

/** Find words for a specific day */
export function wordsForDay(month: VocabMonth, day: number): VocabWord[] {
  return month.days.find((d) => d.day === day)?.words ?? [];
}

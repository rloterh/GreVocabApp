import type { VocabMonth, VocabWord } from "@/types";
import { slugify, toMonthKey } from "./date-utils";

/**
 * First month key from today with nothing loaded in it.
 *
 * Used wherever new vocabulary needs somewhere to land — generated months and
 * Anki imports both carry no month of their own, and dropping them onto a
 * month that already has words would overwrite it.
 */
export function firstFreeMonthKey(loaded: Record<string, unknown>): string {
  const cursor = new Date();
  cursor.setDate(1);
  for (let i = 0; i < 24; i++) {
    const key = toMonthKey(cursor);
    if (!(key in loaded)) return key;
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return toMonthKey(new Date());
}

/** Validate and normalize a raw month object into a VocabMonth */
export function parseVocabMonth(raw: unknown): VocabMonth {
  if (!raw || typeof raw !== "object") {
    throw new Error("Vocab file must be a JSON object");
  }
  const r = raw as Record<string, unknown>;

  const month = r.month;
  if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Missing or invalid `month` field (expected 'YYYY-MM')");
  }

  const displayName =
    typeof r.displayName === "string" && r.displayName.trim()
      ? r.displayName
      : month;

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
        id: uniqueId(
          typeof wo.id === "string" && wo.id.trim()
            ? wo.id
            : `${month}-${slugify(word)}`,
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
    month,
    displayName,
    days,
    author: typeof r.author === "string" ? r.author : undefined,
    description:
      typeof r.description === "string" ? r.description : undefined,
    createdAt:
      typeof r.createdAt === "string" ? r.createdAt : undefined,
  };
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

/** Flatten all words from a month */
export function allWordsInMonth(month: VocabMonth): VocabWord[] {
  return month.days.flatMap((d) => d.words);
}

/** Find words for a specific day */
export function wordsForDay(
  month: VocabMonth,
  day: number,
): VocabWord[] {
  return month.days.find((d) => d.day === day)?.words ?? [];
}

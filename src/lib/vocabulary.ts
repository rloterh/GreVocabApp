import type { VocabMonth, VocabWord } from "@/types";
import { slugify } from "./date-utils";

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

  const days = daysRaw.map((d, idx) => {
    if (!d || typeof d !== "object") {
      throw new Error(`Day at index ${idx} is not an object`);
    }
    const day = (d as Record<string, unknown>).day;
    if (typeof day !== "number" || day < 1 || day > 31) {
      throw new Error(`Day at index ${idx} has invalid day number`);
    }
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
        id:
          typeof wo.id === "string" && wo.id.trim()
            ? wo.id
            : `${month}-${slugify(word)}`,
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

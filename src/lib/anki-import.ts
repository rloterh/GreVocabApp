/**
 * Anki `.apkg` import.
 *
 * The other half of `anki-export.ts`. Phase 3's definition of done is that
 * someone with an existing Anki deck can be studying in Lexicon in minutes,
 * and until now the arrow only pointed outwards.
 *
 * Anki decks are not a fixed schema — a note type can have any fields in any
 * order — so this maps by field *name* where it can and falls back to position
 * only as a last resort. The result goes through `parseVocabMonth` like every
 * other import.
 *
 * See ROADMAP.md, Phase 3.
 */

import type { SqlJsStatic } from "sql.js";
import type { VocabMonth, VocabWord } from "@/types";
import { formatMonthKey, slugify } from "@/lib/date-utils";

/** Words per day, matching the seed data and the generator. */
export const WORDS_PER_DAY = 3;

/** Anki joins note fields with the unit separator, 0x1f. */
const FIELD_SEP = String.fromCharCode(31);

/**
 * Field-name hints, most specific first. Anki decks in the wild use all of
 * these, and a shared deck's "Front" is usually the word.
 */
const FIELD_HINTS = {
  word: ["word", "term", "vocab", "vocabulary", "front", "expression"],
  definition: ["definition", "meaning", "back", "translation", "gloss", "sense"],
  example: ["example", "sentence", "examplesentence", "usage", "context"],
  mnemonic: ["mnemonic", "memoryaid", "hint", "note", "notes", "mnemonics"],
  partOfSpeech: ["partofspeech", "pos", "type", "wordtype", "grammar"],
} as const;

/** Shown when the source deck simply has nothing to put here. */
const MISSING = "—";

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Strip the HTML, media references and entities Anki fields routinely carry,
 * leaving plain text.
 */
export function stripAnkiHtml(raw: string): string {
  return raw
    .replace(/\[sound:[^\]]*\]/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(?:div|p|li|tr)>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Which note-type field index holds which piece of a vocabulary word. */
export interface FieldMap {
  word: number;
  definition: number;
  example: number | null;
  mnemonic: number | null;
  partOfSpeech: number | null;
}

/**
 * Choose field indices for one Anki note type.
 *
 * Name matching first; if that cannot even identify the word and definition,
 * fall back to "first field is the word, second is the definition", which is
 * the near-universal convention for a two-field note.
 */
export function mapFields(fieldNames: string[]): FieldMap {
  const normalized = fieldNames.map(normalize);
  const find = (hints: readonly string[], exclude: number[]): number | null => {
    for (const hint of hints) {
      const exact = normalized.indexOf(hint);
      if (exact !== -1 && !exclude.includes(exact)) return exact;
    }
    for (const hint of hints) {
      const partial = normalized.findIndex(
        (n, i) => !exclude.includes(i) && n.includes(hint),
      );
      if (partial !== -1) return partial;
    }
    return null;
  };

  const used: number[] = [];
  const take = (hints: readonly string[]): number | null => {
    const idx = find(hints, used);
    if (idx !== null) used.push(idx);
    return idx;
  };

  const word = take(FIELD_HINTS.word) ?? 0;
  if (!used.includes(word)) used.push(word);
  const definition = take(FIELD_HINTS.definition) ?? (word === 0 ? 1 : 0);
  if (!used.includes(definition)) used.push(definition);

  return {
    word,
    definition,
    example: take(FIELD_HINTS.example),
    mnemonic: take(FIELD_HINTS.mnemonic),
    partOfSpeech: take(FIELD_HINTS.partOfSpeech),
  };
}

export interface AnkiImportOptions {
  /** The .apkg file's bytes. */
  bytes: Uint8Array;
  /** Month key the imported words belong to, "YYYY-MM". */
  monthKey: string;
  /** Cap on how many notes to take, so a 20k-card deck cannot hang the tab. */
  limit?: number;
}

export interface AnkiImportResult {
  month: VocabMonth;
  /** Notes read from the file. */
  noteCount: number;
  /** Notes skipped because they had no usable word or definition. */
  skipped: number;
}

/** The `media` entry is always present; the database name varies by version. */
function pickCollection(files: Record<string, Uint8Array>): Uint8Array {
  // Anki 2.1.50+ writes collection.anki21b (zstd) alongside a stub .anki2.
  // We cannot read zstd without another dependency, so say so plainly.
  if (files["collection.anki21"]) return files["collection.anki21"];
  if (files["collection.anki2"]) return files["collection.anki2"];
  if (files["collection.anki21b"]) {
    throw new Error(
      "This .apkg uses Anki's newer compressed format. Re-export it from Anki with \"Support older Anki versions\" ticked.",
    );
  }
  throw new Error("No Anki collection found inside this .apkg.");
}

/**
 * Read vocabulary out of an .apkg.
 *
 * Scheduling is deliberately not imported: Lexicon's progress is keyed by its
 * own word ids, and silently inventing review history for words the user has
 * never seen here would be worse than starting them fresh.
 */
export async function importApkg(
  SQL: SqlJsStatic,
  options: AnkiImportOptions,
): Promise<AnkiImportResult> {
  const { bytes, monthKey, limit = 500 } = options;

  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error("Month must look like 2026-07.");
  }

  const { unzipSync } = await import("fflate");
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("That file is not a readable .apkg (it is not a zip).");
  }

  const db = new SQL.Database(pickCollection(files));
  try {
    const colRows = db.exec("SELECT models FROM col");
    if (colRows.length === 0) {
      throw new Error("This .apkg has no collection metadata.");
    }
    const models = JSON.parse(colRows[0].values[0][0] as string) as Record<
      string,
      { flds: Array<{ name: string; ord: number }> }
    >;

    // One field map per note type, computed once rather than per note.
    const mapForModel = new Map<string, FieldMap>();
    for (const [id, model] of Object.entries(models)) {
      const names = [...model.flds]
        .sort((a, b) => a.ord - b.ord)
        .map((f) => f.name);
      mapForModel.set(id, mapFields(names));
    }

    const noteRows = db.exec(
      `SELECT mid, flds FROM notes ORDER BY id LIMIT ${limit}`,
    );
    const rows = noteRows.length ? noteRows[0].values : [];

    const words: VocabWord[] = [];
    let skipped = 0;
    const seen = new Set<string>();

    for (const [mid, flds] of rows as Array<[number, string]>) {
      const map = mapForModel.get(String(mid));
      if (!map) {
        skipped++;
        continue;
      }
      const fields = String(flds).split(FIELD_SEP).map(stripAnkiHtml);
      const at = (i: number | null) =>
        i === null ? "" : (fields[i] ?? "").trim();

      const word = at(map.word);
      const definition = at(map.definition);
      // A card with no word or no meaning is not vocabulary.
      if (!word || !definition) {
        skipped++;
        continue;
      }
      const id = `${monthKey}-${slugify(word)}`;
      if (seen.has(id)) {
        skipped++;
        continue;
      }
      seen.add(id);

      words.push({
        id,
        word,
        partOfSpeech: at(map.partOfSpeech) || MISSING,
        definition,
        example: at(map.example) || MISSING,
        mnemonic: at(map.mnemonic) || MISSING,
      });
    }

    if (words.length === 0) {
      throw new Error(
        "No usable vocabulary in this deck — every note was missing a word or a meaning.",
      );
    }

    return {
      month: toMonth(words, monthKey),
      noteCount: rows.length,
      skipped,
    };
  } finally {
    db.close();
  }
}

/** Lay imported words across days, three to a day, capped at a real month. */
export function toMonth(words: VocabWord[], monthKey: string): VocabMonth {
  const days: VocabMonth["days"] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_DAY) {
    const day = days.length + 1;
    if (day > 31) break;
    days.push({ day, words: words.slice(i, i + WORDS_PER_DAY) });
  }
  return {
    month: monthKey,
    displayName: formatMonthKey(monthKey),
    days,
    description: "Imported from Anki",
    createdAt: new Date().toISOString(),
  };
}

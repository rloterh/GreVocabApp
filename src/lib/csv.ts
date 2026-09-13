/**
 * CSV vocabulary import.
 *
 * Hand-rolled rather than pulling in a parser: the grammar we need is small
 * and well specified (RFC 4180), the whole thing is under a hundred lines, and
 * a dependency here would ship in every bundle to serve one import button.
 *
 * The output is a plain month-shaped object handed to `parseVocabMonth`, so
 * CSV imports go through exactly the same validation as JSON ones and there is
 * only ever one definition of what a valid month is.
 *
 * See ROADMAP.md, Phase 3.
 */

import { formatMonthKey, toMonthKey } from "@/lib/date-utils";

/**
 * Split CSV text into rows of fields.
 *
 * Handles quoted fields, embedded commas and newlines, and doubled quotes as
 * an escape (`""` inside a quoted field is a literal `"`). Accepts CRLF, LF or
 * CR line endings, and ignores a UTF-8 BOM.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // Drop rows that are entirely empty — trailing newlines are normal.
    if (row.some((f) => f.trim() !== "")) rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const c = src[i];

    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      endField();
      i++;
      continue;
    }
    if (c === "\r") {
      // Treat CRLF and a bare CR alike.
      endRow();
      i += src[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (c === "\n") {
      endRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }

  // Whatever is left is the final row (file may not end with a newline).
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

/** Canonical column names we understand, keyed by their normalized form. */
const COLUMN_ALIASES: Record<string, string> = {
  word: "word",
  term: "word",
  partofspeech: "partOfSpeech",
  pos: "partOfSpeech",
  definition: "definition",
  meaning: "definition",
  example: "example",
  examplesentence: "example",
  mnemonic: "mnemonic",
  memoryaid: "mnemonic",
  day: "day",
  month: "month",
  id: "id",
  synonyms: "synonyms",
  antonyms: "antonyms",
};

/** Lowercase and strip anything that is not a letter or digit. */
function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Pull a "YYYY-MM" out of a filename like `2026-07.csv` or `july-2026-07.csv`. */
export function monthFromFilename(name: string): string | null {
  const m = /(\d{4}-\d{2})/.exec(name);
  if (!m) return null;
  const mm = Number(m[1].slice(5));
  if (mm < 1 || mm > 12) return null;
  return m[1];
}

export interface CsvImportOptions {
  /**
   * Month to use for rows that carry no `month` column. Defaults to the
   * current month; callers should pass one derived from the filename first.
   */
  fallbackMonth?: string;
}

/**
 * Convert CSV text into a month-shaped object suitable for `parseVocabMonth`.
 *
 * Required columns: word, partOfSpeech, definition, example, mnemonic, day.
 * Optional: month, id, synonyms, antonyms (the last two semicolon-separated).
 *
 * Throws with a message naming the problem — callers surface it directly.
 */
export function csvToMonthObjects(
  text: string,
  options: CsvImportOptions = {},
): unknown[] {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error("CSV is empty");
  if (rows.length === 1) throw new Error("CSV has a header row but no data");

  const headers = rows[0].map((h) => COLUMN_ALIASES[normalizeHeader(h)]);
  const required = [
    "word",
    "partOfSpeech",
    "definition",
    "example",
    "mnemonic",
    "day",
  ];
  const missing = required.filter((r) => !headers.includes(r));
  if (missing.length > 0) {
    throw new Error(`CSV is missing column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`);
  }

  const fallbackMonth = options.fallbackMonth ?? toMonthKey(new Date());
  const col = (row: string[], name: string): string => {
    const idx = headers.indexOf(name);
    return idx === -1 ? "" : (row[idx] ?? "").trim();
  };
  const list = (raw: string): string[] | undefined => {
    const parts = raw
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : undefined;
  };

  // Group rows by month, then by day. A single CSV may legitimately span
  // months, and a month is the unit of loading everywhere else in the app.
  const byMonth = new Map<string, Map<number, unknown[]>>();

  rows.slice(1).forEach((row, idx) => {
    const lineNo = idx + 2; // 1-based, and the header is line 1
    const dayRaw = col(row, "day");
    const day = Number(dayRaw);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      throw new Error(`Line ${lineNo}: 'day' must be a whole number 1-31, got "${dayRaw}"`);
    }
    const monthRaw = col(row, "month");
    if (monthRaw && !/^\d{4}-\d{2}$/.test(monthRaw)) {
      throw new Error(`Line ${lineNo}: 'month' must look like 2026-07, got "${monthRaw}"`);
    }
    const monthKey = monthRaw || fallbackMonth;

    const word = {
      id: col(row, "id") || undefined,
      word: col(row, "word"),
      partOfSpeech: col(row, "partOfSpeech"),
      definition: col(row, "definition"),
      example: col(row, "example"),
      mnemonic: col(row, "mnemonic"),
      synonyms: list(col(row, "synonyms")),
      antonyms: list(col(row, "antonyms")),
    };

    if (!byMonth.has(monthKey)) byMonth.set(monthKey, new Map());
    const days = byMonth.get(monthKey)!;
    if (!days.has(day)) days.set(day, []);
    days.get(day)!.push(word);
  });

  return [...byMonth.entries()].map(([month, days]) => ({
    // A `month` column is how a user says "these rows are a different month",
    // so it still groups. It does not become a key: where these land in a
    // track is the store's decision, and the date survives as the title.
    title: formatMonthKey(month),
    days: [...days.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([day, words]) => ({ day, words })),
    createdAt: new Date().toISOString(),
    description: "Imported from CSV",
  }));
}

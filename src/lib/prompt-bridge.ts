/**
 * Generate vocabulary with no credential of any kind.
 *
 * The app writes the prompt, the user runs it in whatever AI they already have
 * open, and pastes the reply back. Nothing here talks to a network.
 *
 * This is the recommended path for anyone without a key — not a fallback for
 * the desperate. It works with every AI including ones that do not exist yet,
 * it is unambiguously legitimate because the user operates their own chat
 * client, and it needs no infrastructure.
 *
 * See docs/adr/0008-prompt-bridge.md.
 */

import { csvToMonthObjects, parseCsv } from "@/lib/csv";

/** The columns the CSV importer expects, in order. */
export const BRIDGE_COLUMNS = [
  "word",
  "partOfSpeech",
  "definition",
  "example",
  "mnemonic",
  "day",
] as const;

const HEADER = BRIDGE_COLUMNS.join(",");

/** How many existing words to list. A chat context is not a token budget. */
const MAX_AVOID = 200;

export interface BridgePromptOptions {
  topic: string;
  wordCount: number;
  /** Words the user already has, so the model does not repeat them. */
  existingWords?: string[];
  /** Words the user insists on. Placed first. */
  mustInclude?: string[];
}

/**
 * Build the prompt the user will paste elsewhere.
 *
 * CSV rather than JSON, deliberately: chat models truncate and malform long
 * JSON far more often, a missing brace kills the whole batch where a bad CSV
 * line kills one word, and CSV survives copy-paste without brace matching.
 *
 * The quality rules here are the same ones the API path enforces in code. They
 * live in one function so the two cannot drift apart.
 */
export function buildBridgePrompt(options: BridgePromptOptions): string {
  const { topic, wordCount, existingWords = [], mustInclude = [] } = options;
  const avoid = existingWords.slice(0, MAX_AVOID);

  return [
    `You are helping build a vocabulary study deck.`,
    ``,
    `Produce exactly ${wordCount} vocabulary words on this theme: ${topic}.`,
    ``,
    `Rules:`,
    `- Words should be genuinely useful to learn, not obscure trivia.`,
    `- Vary difficulty across the set; do not give ${wordCount} near-synonyms.`,
    `- The definition must be one clear sentence in plain English, and must not`,
    `  contain the word itself or an obvious inflection of it.`,
    `- The example must use the word and make its meaning inferable from`,
    `  context. It must not simply restate the definition.`,
    `- The mnemonic must be a real memory hook: a sound-alike, a root`,
    `  breakdown, or a vivid image. Never a paraphrase of the definition.`,
    `- Every word must be distinct. No repeats.`,
    `- "day" numbers the words 3 per day, starting at 1. So words 1-3 are day`,
    `  1, words 4-6 are day 2, and so on.`,
    mustInclude.length > 0
      ? `\nInclude these words first, in this order:\n${mustInclude.join(", ")}`
      : "",
    avoid.length > 0
      ? `\nDo not use any of these, which the learner already has:\n${avoid.join(", ")}`
      : "",
    ``,
    `Output format — this matters:`,
    `Reply with CSV and nothing else. No preamble, no explanation, no code`,
    `fences. The first line must be exactly this header:`,
    ``,
    HEADER,
    ``,
    `Then one line per word. Wrap any field containing a comma in double`,
    `quotes. For example:`,
    ``,
    `abate,verb,To lessen in intensity.,The storm abated by dawn.,"a-BATE, like bait shrinking",1`,
    ``,
    `Begin the reply with "${BRIDGE_COLUMNS[0]}" and end with the last word.`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * Pull the CSV out of whatever the user pasted.
 *
 * Chat models add commentary and code fences however firmly they are told not
 * to, so this is forgiving by design. The user cannot see what went wrong on
 * the other side of the clipboard, which makes being strict here unhelpful.
 */
export function extractCsv(pasted: string): string {
  const text = pasted.replace(/\r\n?/g, "\n").trim();
  if (!text) throw new Error("Nothing was pasted.");

  // Prefer a fenced block if there is one — models reach for them reflexively.
  const fenced = /```(?:csv|text)?\s*\n([\s\S]*?)```/i.exec(text);
  const body = fenced?.[1] ?? text;

  const lines = body.split("\n");
  const headerIndex = lines.findIndex(isHeaderLine);
  if (headerIndex === -1) {
    throw new Error(
      `Could not find the CSV header. The reply should start with "${HEADER}".`,
    );
  }

  const rows = parseCsv(lines.slice(headerIndex).join("\n"));
  const header = rows[0];
  // Drop trailing commentary: a prose line parses as one short row, and a
  // model's closing "Let me know if you'd like more!" would otherwise become
  // a word with no definition.
  const kept = rows.filter((row, i) => i === 0 || row.length >= header.length);

  if (kept.length < 2) {
    throw new Error("The header was found but no word rows followed it.");
  }
  return kept.map(toCsvLine).join("\n");
}

/** How many rows `extractCsv` discarded as commentary, for reporting. */
export function countDiscardedRows(pasted: string): number {
  try {
    const text = pasted.replace(/\r\n?/g, "\n").trim();
    const fenced = /```(?:csv|text)?\s*\n([\s\S]*?)```/i.exec(text);
    const body = fenced?.[1] ?? text;
    const lines = body.split("\n");
    const headerIndex = lines.findIndex(isHeaderLine);
    if (headerIndex === -1) return 0;
    const rows = parseCsv(lines.slice(headerIndex).join("\n"));
    const header = rows[0];
    return rows.filter((row, i) => i > 0 && row.length < header.length).length;
  } catch {
    return 0;
  }
}

/**
 * Turn a pasted reply into month-shaped objects.
 *
 * The result goes to `loadMonth` like any import: a blob from a stranger's
 * model is the least trustworthy input this app takes, and gets exactly the
 * same validation as a file from disk.
 */
export function parsePastedVocab(
  pasted: string,
  fallbackMonth: string,
): unknown[] {
  // A calendar month, not a store key. It is the default for the CSV's own
  // `month` column, which is how a pasted reply groups rows — it says nothing
  // about where the result lands in a track.
  if (!/^\d{4}-\d{2}$/.test(fallbackMonth)) {
    throw new Error("Month must look like 2026-07.");
  }
  return csvToMonthObjects(extractCsv(pasted), { fallbackMonth });
}

/** Does this line look like the header we asked for? */
function isHeaderLine(line: string): boolean {
  const normalized = line.toLowerCase().replace(/[^a-z,]/g, "");
  return (
    normalized.includes("word") &&
    normalized.includes("definition") &&
    normalized.includes(",")
  );
}

/** Re-emit a parsed row as CSV, quoting only what needs it. */
function toCsvLine(fields: string[]): string {
  return fields
    .map((field) =>
      /[",\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field,
    )
    .join(",");
}

/**
 * Fill in missing synonyms and antonyms across the corpus.
 *
 * Most months were generated with them. GRE 1 and 2 were not — they predate
 * the enrichment, and they are the two months every new user meets first, so
 * they were the worst possible pair to be missing it.
 *
 * Uses the `claude` CLI already on PATH, the same route as
 * `generate-corpus.ts`. Safe to re-run: it only asks about words that have
 * nothing, so an interrupted run resumes where it stopped and a finished one
 * is a no-op.
 *
 *   npx tsx scripts/enrich-relations.ts                 # every month missing them
 *   npx tsx scripts/enrich-relations.ts --track gre     # one track
 *   npx tsx scripts/enrich-relations.ts --dry-run       # report, ask nothing
 *
 * Nothing is written until a month's whole batch has been validated, so a bad
 * reply cannot leave a half-enriched file behind.
 */

import { spawn } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  statSync,
} from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const VOCAB = path.join(ROOT, "public", "vocab");

/** How many words to ask about at once. */
const BATCH = 15;

interface Word {
  id: string;
  word: string;
  partOfSpeech: string;
  definition: string;
  example: string;
  mnemonic: string;
  synonyms?: string[];
  antonyms?: string[];
}
interface Month {
  track: string;
  ordinal: number;
  title: string;
  days: { day: number; words: Word[] }[];
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const trackArg = args.includes("--track")
  ? args[args.indexOf("--track") + 1]
  : null;

/** Run the CLI and return its stdout. */
function ask(prompt: string, timeoutMs = 300_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p"], {
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(err.slice(0, 400) || `exited ${code}`));
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/** Pull the first JSON array or object out of a reply. */
function extractJson<T>(text: string): T {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[[{]/);
  if (start < 0) throw new Error(`no JSON in reply: ${text.slice(0, 200)}`);
  const open = body[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return JSON.parse(body.slice(start, i + 1)) as T;
    }
  }
  throw new Error(`unterminated JSON in reply: ${text.slice(0, 200)}`);
}

/** Crude stem, enough to catch "abate"/"abated"/"abating" self-references. */
function stem(w: string): string {
  return w
    .toLowerCase()
    .trim()
    .replace(/(ing|edly|ed|es|s|ly|ness|ity)$/, "");
}

/**
 * Keep only entries that are plausible, single-concept and not the word
 * itself. The model is good at this and occasionally returns the headword,
 * a definition-length phrase, or a duplicate; all three look careless on a
 * card, so they are dropped rather than shown.
 */
function clean(list: unknown, headword: string): string[] {
  if (!Array.isArray(list)) return [];
  const head = stem(headword);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (!value) continue;
    // A synonym is a word, occasionally two. Anything longer is a gloss.
    if (value.split(/\s+/).length > 2) continue;
    if (!/^[a-zA-Z][a-zA-Z '-]*$/.test(value)) continue;
    const key = stem(value);
    if (key === head) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value.toLowerCase());
    if (out.length === 3) break;
  }
  return out;
}

function prompt(words: Word[]): string {
  return [
    "For each entry below, give synonyms and antonyms suitable for a",
    "vocabulary flashcard.",
    "",
    "Rules:",
    "- Two or three synonyms. Single words, matching the part of speech.",
    "- Two or three antonyms, or an empty array where a word genuinely has",
    "  none — many nouns and most technical terms do not. Do not invent one.",
    "- Never repeat the headword or an inflection of it.",
    "- Prefer words a strong test-taker would know, not rarer ones.",
    "",
    "Reply with JSON only: an array of",
    '  { "id": string, "synonyms": string[], "antonyms": string[] }',
    "in the same order, one object per entry, no prose.",
    "",
    JSON.stringify(
      words.map((w) => ({
        id: w.id,
        word: w.word,
        partOfSpeech: w.partOfSpeech,
        definition: w.definition,
      })),
      null,
      1,
    ),
  ].join("\n");
}

function monthFiles(): string[] {
  const out: string[] = [];
  for (const track of readdirSync(VOCAB)) {
    if (trackArg && track !== trackArg) continue;
    const dir = path.join(VOCAB, track);
    // `index.json` lives alongside the track directories.
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir)) {
      if (file.endsWith(".json")) out.push(path.join(dir, file));
    }
  }
  return out.sort();
}

let filesTouched = 0;
let wordsFilled = 0;
let wordsSkipped = 0;

for (const file of monthFiles()) {
  const month = JSON.parse(readFileSync(file, "utf-8")) as Month;
  if (!month.days) continue;

  const all = month.days.flatMap((d) => d.words);
  // Only what is genuinely missing. A word with synonyms but no antonyms is
  // left alone: plenty of words have no true opposite, and asking again would
  // pressure the model into inventing one.
  const missing = all.filter((w) => !w.synonyms?.length);
  if (missing.length === 0) continue;

  const rel = path.relative(ROOT, file);
  console.log(`${rel}: ${missing.length}/${all.length} words need relations`);
  if (dryRun) {
    wordsSkipped += missing.length;
    continue;
  }

  const byId = new Map(all.map((w) => [w.id, w]));
  const filled = new Map<string, { synonyms: string[]; antonyms: string[] }>();

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    const label = `  ${i + 1}-${Math.min(i + BATCH, missing.length)}`;
    let reply: string;
    try {
      reply = await ask(prompt(batch));
    } catch (error) {
      console.log(`${label} FAILED: ${String(error).slice(0, 120)}`);
      continue;
    }
    let rows: { id: string; synonyms?: unknown; antonyms?: unknown }[];
    try {
      rows = extractJson(reply);
    } catch (error) {
      console.log(`${label} unparseable: ${String(error).slice(0, 120)}`);
      continue;
    }
    let ok = 0;
    for (const row of rows) {
      const word = byId.get(row.id);
      if (!word) continue;
      const synonyms = clean(row.synonyms, word.word);
      const antonyms = clean(row.antonyms, word.word);
      // Synonyms are the point; a row that yields none is not worth writing.
      if (synonyms.length === 0) continue;
      filled.set(row.id, { synonyms, antonyms });
      ok += 1;
    }
    console.log(`${label}: ${ok}/${batch.length} usable`);
  }

  if (filled.size === 0) {
    console.log(`  nothing usable — ${rel} left untouched`);
    continue;
  }

  for (const day of month.days) {
    for (const word of day.words) {
      const got = filled.get(word.id);
      if (!got) continue;
      word.synonyms = got.synonyms;
      if (got.antonyms.length) word.antonyms = got.antonyms;
    }
  }
  writeFileSync(file, `${JSON.stringify(month, null, 2)}\n`);
  filesTouched += 1;
  wordsFilled += filled.size;
  console.log(`  wrote ${rel} — ${filled.size} words enriched`);
}

console.log(
  dryRun
    ? `\nDry run: ${wordsSkipped} words across the corpus are missing relations.`
    : `\nDone: ${wordsFilled} words enriched across ${filesTouched} file(s).`,
);

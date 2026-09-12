/**
 * Repair a corpus that has duplicates or short months.
 *
 * Two passes, in this order because the second depends on the first:
 *
 * 1. **Dedupe.** Walk the months in order and drop any word whose stem has
 *    already been seen, keeping the earliest. Earliest rather than best,
 *    because month order is the teaching order and moving a word later would
 *    change what a learner meets when.
 * 2. **Top up.** Any month now under its quota gets the shortfall generated,
 *    excluding everything in the corpus and everything the app bundles.
 *
 * Why this was needed: two generator processes ran at once, each with its own
 * in-memory dedup set and neither aware of the other's writes. The logic was
 * right; running it twice was not. `generate-corpus.ts` now takes a lock.
 *
 *   npx tsx scripts/repair-corpus.ts
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { stem } from "../src/lib/stem";
import { checkWord } from "../src/lib/word-quality";
import type { VocabMonth, VocabWord } from "../src/types";

const DIR = process.argv[2] ?? "public/vocab";
const SEED = "src/data";
const PER_MONTH = 90;
const WORDS_PER_DAY = 3;
const CARD_BATCH = 15;

function ask(prompt: string, timeoutMs = 600_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p"], { shell: true, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("timed out"));
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(err.slice(0, 300) || `exited ${code}`));
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function extractJson<T>(text: string): T {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[[{]/);
  if (start < 0) throw new Error("no JSON in reply");
  const open = body[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close && --depth === 0) {
      return JSON.parse(body.slice(start, i + 1)) as T;
    }
  }
  throw new Error("unterminated JSON");
}

const files = readdirSync(DIR).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort();
const months = files.map(
  (f) => JSON.parse(readFileSync(join(DIR, f), "utf-8")) as VocabMonth,
);

// Everything the app already ships is off limits too.
const seen = new Map<string, string>();
for (const f of readdirSync(SEED).filter((f) => f.endsWith(".json"))) {
  const m = JSON.parse(readFileSync(join(SEED, f), "utf-8")) as VocabMonth;
  for (const d of m.days) for (const w of d.words) seen.set(stem(w.word), w.word);
}
console.log(`${seen.size} words bundled with the app are excluded`);

// --- Pass 1: dedupe -----------------------------------------------------------
let removed = 0;
for (const month of months) {
  const kept: VocabWord[] = [];
  for (const day of month.days) {
    for (const word of day.words) {
      const key = stem(word.word);
      if (!key || seen.has(key)) {
        removed++;
        continue;
      }
      seen.set(key, word.word);
      kept.push(word);
    }
  }
  month.days = layOut(kept);
}
console.log(`removed ${removed} duplicate words`);

// --- Pass 2: top up -----------------------------------------------------------
const short = months.filter((m) => countWords(m) < PER_MONTH);
const shortfall = short.reduce((n, m) => n + (PER_MONTH - countWords(m)), 0);
console.log(`${short.length} months short, ${shortfall} words to generate\n`);

for (const month of months) {
  const need = PER_MONTH - countWords(month);
  if (need <= 0) continue;
  console.log(`${month.month}  needs ${need}`);

  const words = await selectWords(need, month.description ?? "GRE vocabulary");
  if (words.length === 0) {
    console.log(`  nothing usable came back; leaving it short`);
    continue;
  }

  const cards: VocabWord[] = [];
  for (let i = 0; i < words.length; i += CARD_BATCH) {
    try {
      const raw = await writeCards(words.slice(i, i + CARD_BATCH));
      cards.push(...raw.map((c) => toWord(c, month.month)));
    } catch (error) {
      console.log(`  batch failed: ${String(error).slice(0, 100)}`);
    }
  }

  const good = cards.filter((c) => checkWord(c).length === 0);
  const existing = month.days.flatMap((d) => d.words);
  month.days = layOut([...existing, ...good].slice(0, PER_MONTH));
  console.log(`  added ${good.length}, now ${countWords(month)}`);
}

for (const [i, month] of months.entries()) {
  writeFileSync(
    join(DIR, files[i]),
    JSON.stringify(month, null, 2) + "\n",
    "utf-8",
  );
}
console.log(`\nrewrote ${months.length} months, ${seen.size} distinct words`);

// --- helpers ------------------------------------------------------------------

function countWords(month: VocabMonth): number {
  return month.days.reduce((n, d) => n + d.words.length, 0);
}

function layOut(words: VocabWord[]): VocabMonth["days"] {
  const days: VocabMonth["days"] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_DAY) {
    if (days.length >= 31) break;
    days.push({ day: days.length + 1, words: words.slice(i, i + WORDS_PER_DAY) });
  }
  return days;
}

async function selectWords(need: number, context: string): Promise<string[]> {
  const kept: string[] = [];
  for (let round = 0; round < 3 && kept.length < need; round++) {
    const avoid = [...seen.values()].slice(-500);
    const prompt = [
      `List ${Math.ceil((need - kept.length) * 1.8)} single English vocabulary words for GRE preparation.`,
      `Context for this set: ${context}.`,
      "",
      "Rules:",
      "- Single words only. No phrases, no hyphenated compounds, no proper nouns.",
      "- Genuinely useful GRE vocabulary, not archaisms.",
      "- Vary the part of speech.",
      `\nDo NOT include any of these:\n${avoid.join(", ")}`,
      "",
      "Reply with ONLY a JSON array of lowercase strings.",
    ].join("\n");

    let candidates: string[];
    try {
      candidates = extractJson<string[]>(await ask(prompt));
    } catch {
      continue;
    }
    for (const raw of candidates) {
      if (kept.length >= need) break;
      const word = String(raw).trim().toLowerCase();
      if (!word || /[^a-z]/.test(word)) continue;
      const key = stem(word);
      if (!key || seen.has(key)) continue;
      seen.set(key, word);
      kept.push(word);
    }
  }
  return kept;
}

interface RawCard {
  word: string;
  partOfSpeech: string;
  definition: string;
  example: string;
  mnemonic: string;
  synonyms?: string[];
  antonyms?: string[];
}

async function writeCards(words: string[]): Promise<RawCard[]> {
  const prompt = [
    `Write a vocabulary study card for each of these ${words.length} words:`,
    words.map((w) => `- ${w}`).join("\n"),
    "",
    "Use exactly these words. Do not substitute, add or omit any.",
    "For each: word, partOfSpeech, definition, example, mnemonic, synonyms, antonyms.",
    "",
    "- definition: ONE sentence, at most 20 words, and it must NEVER contain the",
    "  word being defined or any form of it.",
    "- example: a natural sentence that CONTAINS the word and makes the meaning",
    "  inferable from the situation, without restating the definition.",
    "- mnemonic: a sound-alike, a root breakdown, or a vivid image. Never a",
    "  paraphrase of the definition.",
    "",
    "Reply with ONLY a JSON array of objects.",
  ].join("\n");
  return extractJson<RawCard[]>(await ask(prompt));
}

function toWord(card: RawCard, monthKey: string): VocabWord {
  const slug = String(card.word).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    id: `${monthKey}-${slug}`,
    word: String(card.word ?? "").trim(),
    partOfSpeech: String(card.partOfSpeech ?? "").trim(),
    definition: String(card.definition ?? "").trim(),
    example: String(card.example ?? "").trim(),
    mnemonic: String(card.mnemonic ?? "").trim(),
    synonyms: Array.isArray(card.synonyms) ? card.synonyms.slice(0, 3) : undefined,
    antonyms: Array.isArray(card.antonyms) ? card.antonyms.slice(0, 3) : undefined,
  };
}

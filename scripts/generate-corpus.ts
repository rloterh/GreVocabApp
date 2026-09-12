/**
 * Build a multi-year GRE vocabulary corpus.
 *
 * Two stages, deliberately separated:
 *
 * 1. **Selection.** Ask for the *words* only — cheap, fast, and the part that
 *    decides whether the corpus is any good. Everything is deduplicated
 *    against everything else using the app's own stemmer before a single card
 *    is written, so no effort is spent on a word that will be thrown away.
 * 2. **Cards.** Definitions, examples and mnemonics for the words that
 *    survived, in small batches, each checked by the app's own quality rules
 *    and repaired once where they fail.
 *
 * Running selection first is what makes the result worth having: a duplicate
 * discovered after its card was written has cost a card's worth of generation,
 * and at this scale that is most of the run.
 *
 * Uses the `claude` CLI already on PATH — the installed-CLI route from
 * ADR 0009. No API key, and nothing leaves the machine that the user's own
 * tool would not already send.
 *
 * Usage:
 *   npx tsx scripts/generate-corpus.ts --months 36 --start 2026-10 --out public/vocab
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stem } from "../src/lib/stem";
import { checkWord } from "../src/lib/word-quality";
import type { VocabMonth, VocabWord } from "../src/types";

const WORDS_PER_DAY = 3;
const DAYS_PER_MONTH = 30;
const PER_MONTH = WORDS_PER_DAY * DAYS_PER_MONTH;

/** Cards per request. Small enough to stay reliable, large enough to be quick. */
const CARD_BATCH = 15;

/**
 * The shape of the corpus.
 *
 * Three years is long enough that "GRE words" stops being a single category.
 * Bands keep month 30 from being 90 more of month 3, and give the difficulty
 * curve something real to climb.
 */
const BANDS = [
  {
    name: "core high-frequency",
    through: 12,
    brief:
      "the highest-frequency GRE words — the ones that appear on real tests again and again. Common enough that an educated reader has met them, hard enough that most test-takers cannot define them precisely.",
  },
  {
    name: "mid-frequency and academic register",
    through: 24,
    brief:
      "solid mid-frequency GRE vocabulary: the academic register of serious journalism, criticism and scholarly writing. Less common than the core list but not obscure.",
  },
  {
    name: "advanced and low-frequency",
    through: 36,
    brief:
      "advanced, lower-frequency GRE vocabulary — genuinely difficult words that still earn their place: they appear in demanding prose and have no plain-English equivalent. Not archaic curiosities, not words nobody has written since 1890.",
  },
];

/** Themes, so a month reads as a unit rather than an alphabetical slice. */
const THEMES = [
  "criticism and praise", "certainty and doubt", "speech and silence",
  "change and permanence", "abundance and scarcity", "concealment and disclosure",
  "temperament and disposition", "conflict and reconciliation", "judgement and discernment",
  "deception and candour", "power and submission", "order and disorder",
  "argument and persuasion", "emotion and restraint", "time and duration",
  "knowledge and ignorance", "beginnings and endings", "movement and stillness",
  "generosity and stinginess", "clarity and obscurity", "wealth and poverty",
  "courage and cowardice", "harmony and discord", "growth and decay",
  "law and transgression", "ritual and custom", "art and artifice",
  "nature and cultivation", "reason and unreason", "memory and forgetting",
  "sincerity and pretence", "excess and moderation", "solitude and society",
  "fortune and misfortune", "labour and idleness", "vision and blindness",
];

interface Options {
  months: number;
  start: string;
  out: string;
  only?: number;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback: string) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  return {
    months: Number(get("--months", "36")),
    start: get("--start", "2026-10"),
    out: get("--out", "public/vocab"),
    only: args.includes("--only") ? Number(get("--only", "1")) : undefined,
  };
}

/** Run the CLI and return its stdout. */
function ask(prompt: string, timeoutMs = 600_000): Promise<string> {
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
  // Walk to the matching close, so trailing prose does not break the parse.
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
    else if (ch === close) {
      depth--;
      if (depth === 0) return JSON.parse(body.slice(start, i + 1)) as T;
    }
  }
  throw new Error(`unterminated JSON in reply: ${text.slice(0, 200)}`);
}

function monthKeys(start: string, count: number): string[] {
  const [year, month] = start.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

function bandFor(monthIndex: number) {
  return BANDS.find((b) => monthIndex < b.through) ?? BANDS[BANDS.length - 1];
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function displayName(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** Stage 1: the word list for one month, filtered against everything so far. */
async function selectWords(
  monthIndex: number,
  seen: Map<string, string>,
): Promise<string[]> {
  const band = bandFor(monthIndex);
  const theme = THEMES[monthIndex % THEMES.length];
  const kept: string[] = [];

  // Ask for a generous overage: the dedup filter is local and unforgiving.
  for (let round = 0; round < 3 && kept.length < PER_MONTH; round++) {
    const need = PER_MONTH - kept.length;
    const avoid = [...seen.values()].slice(-400);

    const prompt = [
      `List ${Math.ceil(need * 1.4)} single English vocabulary words for GRE preparation.`,
      "",
      `Band: ${band.brief}`,
      `Loose theme for this set: ${theme}. Treat it as a tendency, not a cage —`,
      `include words that fit the band even when they do not fit the theme.`,
      "",
      "Rules:",
      "- Single words only. No phrases, no hyphenated compounds.",
      "- No proper nouns, no archaisms nobody writes any more.",
      "- Every word must be one a well-read adult could plausibly meet in print.",
      "- Vary the part of speech: include verbs and adjectives, not only nouns.",
      avoid.length
        ? `\nDo NOT include any of these, which are already used:\n${avoid.join(", ")}`
        : "",
      "",
      'Reply with ONLY a JSON array of lowercase strings. No prose, no code fence.',
    ]
      .filter(Boolean)
      .join("\n");

    let candidates: string[];
    try {
      candidates = extractJson<string[]>(await ask(prompt));
    } catch (error) {
      console.error(`  selection round ${round + 1} failed: ${String(error).slice(0, 120)}`);
      continue;
    }

    for (const raw of candidates) {
      if (kept.length >= PER_MONTH) break;
      const word = String(raw).trim().toLowerCase();
      if (!word || /[^a-z]/.test(word)) continue;
      const key = stem(word);
      if (!key || seen.has(key)) continue;
      seen.set(key, word);
      kept.push(word);
    }
    console.log(`  round ${round + 1}: ${kept.length}/${PER_MONTH}`);
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

/** Stage 2: cards for a batch of already-chosen words. */
async function writeCards(words: string[], notes: string[] = []): Promise<RawCard[]> {
  const prompt = [
    `Write a vocabulary study card for each of these ${words.length} words:`,
    words.map((w) => `- ${w}`).join("\n"),
    "",
    "Use exactly these words. Do not substitute, add or omit any.",
    "",
    "For each word give:",
    '  word, partOfSpeech, definition, example, mnemonic, synonyms, antonyms',
    "",
    "Requirements, all of which matter:",
    "- definition: ONE clear sentence, at most 20 words, plain English. It must",
    "  NEVER contain the word being defined or any form of it.",
    "- example: a natural sentence that CONTAINS the word and makes its meaning",
    "  inferable from the situation. It must not restate the definition.",
    "- mnemonic: a real memory hook — a sound-alike, a root breakdown, or a",
    "  vivid image. Never a paraphrase of the definition.",
    "- synonyms/antonyms: two or three each, or an empty array.",
    notes.length ? `\nFix these problems from the last attempt:\n${notes.join("\n")}` : "",
    "",
    "Reply with ONLY a JSON array of objects. No prose, no code fence.",
  ]
    .filter(Boolean)
    .join("\n");

  return extractJson<RawCard[]>(await ask(prompt));
}

function toVocabWord(card: RawCard, monthKey: string): VocabWord {
  const slug = String(card.word).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    id: `${monthKey}-${slug}`,
    word: String(card.word).trim(),
    partOfSpeech: String(card.partOfSpeech ?? "").trim(),
    definition: String(card.definition ?? "").trim(),
    example: String(card.example ?? "").trim(),
    mnemonic: String(card.mnemonic ?? "").trim(),
    synonyms: Array.isArray(card.synonyms) ? card.synonyms.slice(0, 3) : undefined,
    antonyms: Array.isArray(card.antonyms) ? card.antonyms.slice(0, 3) : undefined,
  };
}

async function main() {
  const options = parseArgs();
  mkdirSync(options.out, { recursive: true });
  const keys = monthKeys(options.start, options.months);

  // Resume: anything already written counts, and its words are already taken.
  const seen = new Map<string, string>();
  for (const key of keys) {
    const path = join(options.out, `${key}.json`);
    if (!existsSync(path)) continue;
    const month = JSON.parse(readFileSync(path, "utf-8")) as VocabMonth;
    for (const day of month.days) {
      for (const word of day.words) seen.set(stem(word.word), word.word);
    }
  }
  if (seen.size > 0) console.log(`resuming: ${seen.size} words already written\n`);

  for (const [index, key] of keys.entries()) {
    if (options.only && index + 1 !== options.only) continue;
    const path = join(options.out, `${key}.json`);
    if (existsSync(path)) {
      console.log(`${key}  already done`);
      continue;
    }

    const band = bandFor(index);
    console.log(`\n${key}  (${band.name}, ${THEMES[index % THEMES.length]})`);

    const words = await selectWords(index, seen);
    if (words.length === 0) {
      console.error(`  no words selected; stopping`);
      break;
    }

    const cards: VocabWord[] = [];
    for (let i = 0; i < words.length; i += CARD_BATCH) {
      const batch = words.slice(i, i + CARD_BATCH);
      let raw: RawCard[];
      try {
        raw = await writeCards(batch);
      } catch (error) {
        console.error(`  cards ${i}-${i + batch.length} failed: ${String(error).slice(0, 120)}`);
        continue;
      }

      // The app's own quality rules, then one targeted repair.
      const made = raw.map((card) => toVocabWord(card, key));
      const bad = made.filter((word) => checkWord(word).length > 0);
      if (bad.length > 0) {
        const notes = bad.flatMap((word) => checkWord(word).map((i) => `- ${i.message}`));
        try {
          const fixed = (await writeCards(bad.map((w) => w.word), notes))
            .map((card) => toVocabWord(card, key));
          for (const candidate of fixed) {
            const target = made.findIndex(
              (w) => w.word.toLowerCase() === candidate.word.toLowerCase(),
            );
            // Keep the repair only when it is actually better.
            if (target >= 0 && checkWord(candidate).length < checkWord(made[target]).length) {
              made[target] = { ...candidate, id: made[target].id };
            }
          }
        } catch {
          // A failed repair is not worth losing the batch over.
        }
      }

      cards.push(...made);
      console.log(`  cards ${cards.length}/${words.length}${bad.length ? ` (${bad.length} repaired)` : ""}`);
    }

    if (cards.length === 0) {
      console.error(`  no cards written for ${key}; stopping`);
      break;
    }

    const days: VocabMonth["days"] = [];
    for (let i = 0; i < cards.length; i += WORDS_PER_DAY) {
      days.push({ day: days.length + 1, words: cards.slice(i, i + WORDS_PER_DAY) });
      if (days.length >= 31) break;
    }

    const month: VocabMonth = {
      month: key,
      displayName: displayName(key),
      days,
      description: `${band.name} — ${THEMES[index % THEMES.length]}`,
      createdAt: new Date().toISOString(),
    };

    writeFileSync(path, JSON.stringify(month, null, 2) + "\n", "utf-8");
    console.log(`  wrote ${path} (${cards.length} words, ${days.length} days)`);
  }

  console.log(`\ndone — ${seen.size} distinct words across the corpus`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

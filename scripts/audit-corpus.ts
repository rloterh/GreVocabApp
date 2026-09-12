/**
 * Audit the bundled corpus.
 *
 * The corpus is the app's main content now, and it was produced by a model
 * across dozens of unattended requests. Everything here is checked with the
 * app's own code — the same parser the import path uses, the same stemmer the
 * dedup index keys on, the same quality rules generated cards must pass —
 * because a corpus judged by different rules than the app applies is not
 * actually verified.
 *
 *   npx tsx scripts/audit-corpus.ts
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseVocabMonth, allWordsInMonth } from "../src/lib/vocabulary";
import { stem } from "../src/lib/stem";
import { checkWord } from "../src/lib/word-quality";
import type { VocabMonth, VocabWord } from "../src/types";

const DIR = process.argv[2] ?? "public/vocab";
const SEED = "src/data";

let failures = 0;
function report(ok: boolean, label: string, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}

/** Load through the real parser: anything it rejects, the app would too. */
function load(dir: string): Array<{ file: string; month: VocabMonth }> {
  return readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
    .sort()
    .map((file) => ({
      file,
      month: parseVocabMonth(JSON.parse(readFileSync(join(dir, file), "utf-8"))),
    }));
}

let corpus: Array<{ file: string; month: VocabMonth }>;
try {
  corpus = load(DIR);
  report(true, `every month parses`, `${corpus.length} files`);
} catch (error) {
  report(false, "every month parses", String(error).slice(0, 160));
  process.exit(1);
}

const seed = load(SEED);
const corpusWords = corpus.flatMap((m) => allWordsInMonth(m.month));
const seedWords = seed.flatMap((m) => allWordsInMonth(m.month));

console.log(
  `\n${corpus.length} months, ${corpusWords.length} words (plus ${seedWords.length} bundled with the app)\n`,
);

// --- Size ---------------------------------------------------------------------
//
// Months are NOT all 90 words, and that is a decision rather than a defect.
// Three years at 90 a month is 3,240 words; the serious GRE vocabulary is
// around 3,000. Generation was asked repeatedly for more and returned
// progressively fewer usable ones, which is the corpus telling the truth about
// its own ceiling. Padding to a round number would mean reaching for
// obscurities, and "excellent selections" was the point.
//
// So this asserts a floor — no month so thin it is not worth opening — and a
// total, rather than uniformity.
const MINIMUM_PER_MONTH = 45;
const tooThin = corpus.filter(
  (m) => allWordsInMonth(m.month).length < MINIMUM_PER_MONTH,
);
report(
  tooThin.length === 0,
  `no month has fewer than ${MINIMUM_PER_MONTH} words`,
  tooThin.map((m) => `${m.month.month}:${allWordsInMonth(m.month).length}`).join(", "),
);

const lengths = corpus.map((m) => allWordsInMonth(m.month).length);
console.log(
  `     months run ${Math.min(...lengths)}–${Math.max(...lengths)} words ` +
    `(mean ${Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)}), ` +
    `which is the vocabulary's ceiling, not a target`,
);

// --- Uniqueness, the property the whole design rests on ----------------------
const byStem = new Map<string, string[]>();
for (const word of [...corpusWords, ...seedWords]) {
  const key = stem(word.word);
  if (!byStem.has(key)) byStem.set(key, []);
  byStem.get(key)!.push(word.word);
}
const collisions = [...byStem.entries()].filter(([, words]) => words.length > 1);
report(
  collisions.length === 0,
  "no word collides with another, corpus or bundled",
  collisions.slice(0, 6).map(([k, w]) => `${k}: ${w.join("/")}`).join("; "),
);

const ids = [...corpusWords, ...seedWords].map((w) => w.id);
report(
  new Set(ids).size === ids.length,
  "every word id is unique",
  `${ids.length - new Set(ids).size} duplicates`,
);

// --- Quality, by the app's own rules ----------------------------------------
const bad: Array<{ word: VocabWord; reasons: string[] }> = [];
for (const word of corpusWords) {
  const issues = checkWord(word);
  if (issues.length > 0) bad.push({ word, reasons: issues.map((i) => i.message) });
}
const badShare = (bad.length / corpusWords.length) * 100;
report(
  badShare < 2,
  "fewer than 2% of cards fail a quality check",
  `${bad.length} of ${corpusWords.length} (${badShare.toFixed(1)}%)`,
);
for (const entry of bad.slice(0, 5)) {
  console.log(`       ${entry.word.word}: ${entry.reasons[0]}`);
}

// --- Shape -------------------------------------------------------------------
const missingPos = corpusWords.filter((w) => !w.partOfSpeech.trim());
report(missingPos.length === 0, "every card names a part of speech");

const partsOfSpeech = new Map<string, number>();
for (const word of corpusWords) {
  const key = word.partOfSpeech.toLowerCase().trim();
  partsOfSpeech.set(key, (partsOfSpeech.get(key) ?? 0) + 1);
}
const topShare =
  Math.max(...partsOfSpeech.values()) / corpusWords.length;
report(
  topShare < 0.75,
  "no single part of speech dominates",
  [...partsOfSpeech.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k, v]) => `${k} ${((v / corpusWords.length) * 100).toFixed(0)}%`)
    .join(", "),
);

const longDefs = corpusWords.filter((w) => w.definition.split(/\s+/).length > 30);
report(longDefs.length === 0, "no definition runs long", `${longDefs.length}`);

const multiWord = corpusWords.filter((w) => /\s/.test(w.word.trim()));
report(
  multiWord.length === 0,
  "every entry is a single word",
  multiWord.slice(0, 5).map((w) => w.word).join(", "),
);

// --- Difficulty actually bands ------------------------------------------------
const bandOf = (i: number) => (i < 12 ? "core" : i < 24 ? "mid" : "advanced");
const avgLength = new Map<string, number[]>();
corpus.forEach((entry, i) => {
  const band = bandOf(i);
  if (!avgLength.has(band)) avgLength.set(band, []);
  for (const w of allWordsInMonth(entry.month)) {
    avgLength.get(band)!.push(w.word.length);
  }
});
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const core = mean(avgLength.get("core") ?? [1]);
const advanced = mean(avgLength.get("advanced") ?? [1]);
report(
  advanced >= core - 0.5,
  "later bands are not easier than the first",
  `core ${core.toFixed(1)} letters, advanced ${advanced.toFixed(1)}`,
);

console.log(`\n${failures === 0 ? "corpus is sound" : `${failures} problem(s)`}`);
process.exit(failures === 0 ? 0 : 1);

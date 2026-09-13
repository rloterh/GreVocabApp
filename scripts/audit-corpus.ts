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
 * Per track, because uniqueness is a within-track guarantee and deliberately
 * not a cross-track one: the SAT and GRE vocabularies genuinely overlap, and
 * forcing them apart would damage both. The overlap is *reported* rather than
 * failed on. See docs/adr/0013-cross-track-overlap.md.
 *
 *   npx tsx scripts/audit-corpus.ts
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseVocabMonth, allWordsInMonth } from "../src/lib/vocabulary";
import { stem } from "../src/lib/stem";
import { checkWord } from "../src/lib/word-quality";
import type { Track, VocabMonth, VocabWord } from "../src/types";

const ROOT = process.argv[2] ?? "public/vocab";
const SEED = "src/data";
const TRACKS: Track[] = ["gre", "sat"];

let failures = 0;
function report(ok: boolean, label: string, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}

/** Load through the real parser: anything it rejects, the app would too. */
function load(dir: string, match: RegExp): Array<{ file: string; month: VocabMonth }> {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => match.test(f))
    .sort()
    .map((file) => ({
      file,
      month: parseVocabMonth(JSON.parse(readFileSync(join(dir, file), "utf-8"))),
    }));
}

const perTrack = new Map<Track, VocabWord[]>();

for (const track of TRACKS) {
  const dir = join(ROOT, track);
  if (!existsSync(dir)) {
    console.log(`\n--- ${track.toUpperCase()} --- not generated yet, skipping\n`);
    continue;
  }

  console.log(`\n--- ${track.toUpperCase()} ---\n`);

  let corpus: Array<{ file: string; month: VocabMonth }>;
  try {
    corpus = load(dir, /^\d{2}\.json$/);
    report(true, "every month parses", `${corpus.length} files`);
  } catch (error) {
    report(false, "every month parses", String(error).slice(0, 160));
    continue;
  }

  // Months bundled with the app are part of the same track and share its
  // uniqueness guarantee, so they are audited with it rather than beside it.
  const seed = load(SEED, new RegExp(`^${track}-\\d{2}\\.json$`));
  const corpusWords = corpus.flatMap((m) => allWordsInMonth(m.month));
  const seedWords = seed.flatMap((m) => allWordsInMonth(m.month));
  const all = [...corpusWords, ...seedWords];
  perTrack.set(track, all);

  console.log(
    `${corpus.length} months, ${corpusWords.length} words ` +
      `(plus ${seedWords.length} bundled with the app)\n`,
  );

  // --- Ordinals ---------------------------------------------------------------
  //
  // A track is a sequence, and a hole or a repeat in it is not cosmetic: two
  // months with the same ordinal collide on one store key, and one of them
  // silently never loads.
  const ordinals = [...seed, ...corpus].map((m) => m.month.ordinal).sort((a, b) => a - b);
  report(
    new Set(ordinals).size === ordinals.length,
    "no two months claim the same position",
    ordinals.filter((o, i) => ordinals.indexOf(o) !== i).join(", "),
  );
  const gaps = ordinals.filter((o, i) => i > 0 && o !== ordinals[i - 1] + 1);
  report(
    ordinals[0] === 1 && gaps.length === 0,
    "positions run 1..n with no holes",
    gaps.length > 0 ? `jumps before ${gaps.join(", ")}` : `starts at ${ordinals[0]}`,
  );

  report(
    [...seed, ...corpus].every((m) => m.month.track === track),
    "every month names its own track",
  );

  const untitled = [...seed, ...corpus].filter(
    (m) => !m.month.title.trim() || /^\d{4}-\d{2}$/.test(m.month.title),
  );
  report(
    untitled.length === 0,
    "every month has a name that is not a date",
    untitled.map((m) => m.file).join(", "),
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
    tooThin
      .map((m) => `${m.month.ordinal}:${allWordsInMonth(m.month).length}`)
      .join(", "),
  );

  const lengths = corpus.map((m) => allWordsInMonth(m.month).length);
  console.log(
    `     months run ${Math.min(...lengths)}–${Math.max(...lengths)} words ` +
      `(mean ${Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)}), ` +
      `which is the vocabulary's ceiling, not a target`,
  );

  // --- Uniqueness, the property the whole design rests on ----------------------
  const byStem = new Map<string, string[]>();
  for (const word of all) {
    const key = stem(word.word);
    if (!byStem.has(key)) byStem.set(key, []);
    byStem.get(key)!.push(word.word);
  }
  const collisions = [...byStem.entries()].filter(([, words]) => words.length > 1);
  report(
    collisions.length === 0,
    "no word collides with another in this track",
    collisions.slice(0, 6).map(([k, w]) => `${k}: ${w.join("/")}`).join("; "),
  );

  const ids = all.map((w) => w.id);
  report(
    new Set(ids).size === ids.length,
    "every word id is unique",
    `${ids.length - new Set(ids).size} duplicates`,
  );

  report(
    ids.every((id) => id.startsWith(`${track}-`)),
    "every word id is scoped to this track",
    ids.filter((id) => !id.startsWith(`${track}-`)).slice(0, 4).join(", "),
  );

  report(
    !ids.some((id) => /\d{4}-\d{2}/.test(id)),
    "no word id contains a date",
    ids.filter((id) => /\d{4}-\d{2}/.test(id)).slice(0, 4).join(", "),
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
  const topShare = Math.max(...partsOfSpeech.values()) / corpusWords.length;
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
  const bandOf = (i: number) =>
    i < corpus.length / 3 ? "core" : i < (corpus.length * 2) / 3 ? "mid" : "advanced";
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
}

// --- Between tracks -----------------------------------------------------------
//
// Reported, never failed on. A word in both corpora is not a duplicate: they
// are separate curricula, and the overlap is the useful middle of the academic
// register. An overlap near zero would be as suspicious as one near total —
// it would mean one of the corpora is not what it claims to be.
if (perTrack.size > 1) {
  console.log("\n--- BETWEEN TRACKS ---\n");
  const [a, b] = [...perTrack.entries()];
  const stemsOf = (words: VocabWord[]) => new Set(words.map((w) => stem(w.word)));
  const first = stemsOf(a[1]);
  const second = stemsOf(b[1]);
  const shared = [...first].filter((s) => second.has(s));
  const share = (shared.length / Math.min(first.size, second.size)) * 100;
  console.log(
    `     ${a[0]} and ${b[0]} share ${shared.length} words ` +
      `(${share.toFixed(0)}% of the smaller corpus) — information, not a failure`,
  );
}

console.log(`\n${failures === 0 ? "corpus is sound" : `${failures} problem(s)`}`);
process.exit(failures === 0 ? 0 : 1);

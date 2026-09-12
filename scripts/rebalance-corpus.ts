/**
 * Even out a track's months, within its difficulty bands.
 *
 * Generation writes months in order, and the dedup filter has more to exclude
 * with every month it writes — so a month late in a band comes out thin for a
 * reason that has nothing to do with its subject. The SAT corpus finished with
 * months of 90, 29, 34 and 32 words side by side in the same band.
 *
 * The obvious fix is to generate more, and it does not work: a track near the
 * end of its vocabulary returns almost nothing new. `repair-corpus.ts` asked
 * for 118 words and found 27. Reaching further means reaching for obscurities,
 * which is exactly what the audit's floor exists to discourage.
 *
 * So this moves words instead of inventing them. Within a band — never across
 * one — the fattest month gives its trailing words to the thinnest until no
 * month is under the floor. Banding is preserved because nothing crosses a
 * band; teaching order within a donor month is preserved because words are
 * taken from its end.
 *
 * Safe for exactly the reason reshuffling is safe: word ids do not name a
 * month (ADR 0011), so a word that moves keeps every progress record it has.
 *
 *   npx tsx scripts/rebalance-corpus.ts --track sat --floor 45
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isTrack } from "../src/lib/track";
import type { Track, VocabMonth, VocabWord } from "../src/types";

const argv = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const requested = flag("--track", "gre");
if (!isTrack(requested)) {
  console.error(`--track must be one of gre, sat (got "${requested}")`);
  process.exit(1);
}
const TRACK: Track = requested;
const DIR = join(flag("--out", "public/vocab"), TRACK);
const FLOOR = Number(flag("--floor", "45"));
const WORDS_PER_DAY = 3;
const DRY = argv.includes("--dry");

const files = readdirSync(DIR)
  .filter((f) => /^\d{2}\.json$/.test(f))
  .sort();
const months = files.map(
  (f) => JSON.parse(readFileSync(join(DIR, f), "utf-8")) as VocabMonth,
);

const wordsOf = (m: VocabMonth): VocabWord[] => m.days.flatMap((d) => d.words);
const countOf = (m: VocabMonth) => wordsOf(m).length;

/** Thirds, matching how `audit-corpus.ts` decides a band. */
function bandOf(index: number, total: number): number {
  if (index < total / 3) return 0;
  if (index < (total * 2) / 3) return 1;
  return 2;
}

function layOut(words: VocabWord[]): VocabMonth["days"] {
  const days: VocabMonth["days"] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_DAY) {
    days.push({ day: days.length + 1, words: words.slice(i, i + WORDS_PER_DAY) });
    if (days.length >= 31) break;
  }
  return days;
}

const before = months.map(countOf);
let moved = 0;

for (const band of [0, 1, 2]) {
  const inBand = months.filter((_, i) => bandOf(i, months.length) === band);
  if (inBand.length === 0) continue;

  const total = inBand.reduce((n, m) => n + countOf(m), 0);
  const mean = Math.floor(total / inBand.length);
  // Never pull a donor below what the band can support. If the band's mean is
  // itself under the floor, the floor is unreachable here and saying so is
  // better than shuffling words around to no effect.
  const target = Math.min(FLOOR, mean);
  if (target < FLOOR) {
    console.log(
      `band ${band + 1}: mean ${mean} is under the floor of ${FLOOR}; ` +
        `levelling to ${target} instead`,
    );
  }

  let guard = 0;
  for (;;) {
    if (guard++ > 500) {
      console.error(`band ${band + 1}: gave up after 500 moves`);
      break;
    }
    const thinnest = inBand.reduce((a, b) => (countOf(a) <= countOf(b) ? a : b));
    const fattest = inBand.reduce((a, b) => (countOf(a) >= countOf(b) ? a : b));
    const need = target - countOf(thinnest);
    if (need <= 0) break;
    // Taking from the fattest must not create a new deficit.
    const spare = countOf(fattest) - target;
    if (spare <= 0 || fattest === thinnest) break;

    const take = Math.min(need, spare);
    const donor = wordsOf(fattest);
    // From the end: the front of a month is what a learner meets first, and
    // moving that would change the month rather than trim it.
    const taken = donor.slice(donor.length - take);
    fattest.days = layOut(donor.slice(0, donor.length - take));
    thinnest.days = layOut([...wordsOf(thinnest), ...taken]);
    moved += take;
  }
}

console.log(`\nmoved ${moved} words within bands`);
for (const [i, month] of months.entries()) {
  const now = countOf(month);
  if (now !== before[i]) {
    console.log(`  ${files[i]}  ${before[i]} → ${now}`);
  }
}

const stillShort = months.filter((m) => countOf(m) < FLOOR);
if (stillShort.length > 0) {
  console.log(
    `\n${stillShort.length} month(s) still under ${FLOOR}: ` +
      stillShort.map((m) => `${m.ordinal}:${countOf(m)}`).join(", "),
  );
}

if (DRY) {
  console.log("\n(dry run — nothing written)");
} else {
  for (const [i, month] of months.entries()) {
    writeFileSync(join(DIR, files[i]), JSON.stringify(month, null, 2) + "\n", "utf-8");
  }
  console.log(`\nrewrote ${months.length} months`);
}

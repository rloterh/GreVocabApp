/**
 * Index the bundled vocabulary so the app can list it without downloading it.
 *
 * The corpus is three years of months per track, in `public/vocab/<track>/`.
 * Bundling them into the JS would add megabytes to first paint for material
 * most users will never open, so they are fetched on demand and this index is
 * what makes the library screen possible: names, counts and a sample, at a few
 * kilobytes.
 *
 * Run after generating or editing months:
 *   npx tsx scripts/build-vocab-index.ts
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Track, VocabMonth } from "../src/types";

const ROOT = process.argv[2] ?? "public/vocab";
const TRACKS: Track[] = ["gre", "sat"];

export interface VocabIndexEntry {
  track: Track;
  ordinal: number;
  title: string;
  description?: string;
  words: number;
  days: number;
  /** A handful of words, so the library shows what a month is actually like. */
  sample: string[];
}

const entries: VocabIndexEntry[] = [];

for (const track of TRACKS) {
  const dir = join(ROOT, track);
  // A track with no corpus yet is not an error — it is the state SAT is in
  // until its months are generated.
  if (!existsSync(dir)) continue;

  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".json")) continue;
    const month = JSON.parse(readFileSync(join(dir, file), "utf-8")) as VocabMonth;
    const words = month.days.flatMap((day) => day.words);
    entries.push({
      track: month.track,
      ordinal: month.ordinal,
      title: month.title,
      description: month.description,
      words: words.length,
      days: month.days.length,
      // Spread across the month rather than the first six, so the sample is
      // representative of the whole rather than of day one.
      sample: [0, 1, 2, 3, 4, 5]
        .map((i) => words[Math.floor((i * words.length) / 6)]?.word)
        .filter(Boolean),
    });
  }
}

writeFileSync(
  join(ROOT, "index.json"),
  JSON.stringify(
    { generatedAt: new Date().toISOString(), months: entries },
    null,
    2,
  ) + "\n",
  "utf-8",
);

const total = entries.reduce((n, e) => n + e.words, 0);
const perTrack = TRACKS.map(
  (t) => `${t} ${entries.filter((e) => e.track === t).length}`,
).join(", ");
console.log(`indexed ${entries.length} months (${perTrack}), ${total} words`);

/**
 * Convert the calendar-named corpus to ordinal, track-scoped files.
 *
 * One-shot, and kept because it is the record of what happened to the content:
 *
 *   src/data/2026-04.json      →  src/data/gre-01.json      (ordinal 1)
 *   src/data/2026-05.json      →  src/data/gre-02.json      (ordinal 2)
 *   public/vocab/2026-10.json  →  public/vocab/gre/03.json  (ordinal 3)
 *   …                          →  public/vocab/gre/38.json  (ordinal 38)
 *
 * The two bundled sample months keep the front of the track because they are
 * what a user meets on first launch. The generated corpus follows, in the
 * order it was written, which is the order its difficulty was banded in.
 *
 * Word ids lose the calendar and gain the track — `2026-04-abate` becomes
 * `gre-abate` — and uniqueness, which used to come free from the month being
 * in the id, is enforced here across the whole track at once.
 *
 *   npx tsx scripts/convert-to-tracks.ts [--dry]
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const DRY = process.argv.includes("--dry");
const SEED_DIR = "src/data";
const CORPUS_DIR = "public/vocab";
const TRACK = "gre";

interface LegacyWord {
  id?: string;
  word: string;
  [key: string]: unknown;
}
interface LegacyMonth {
  month: string;
  displayName: string;
  description?: string;
  author?: string;
  createdAt?: string;
  days: Array<{ day: number; words: LegacyWord[] }>;
}

function slugify(word: string): string {
  return word
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

function legacyFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
    .sort();
}

const seeds = legacyFiles(SEED_DIR);
const corpus = legacyFiles(CORPUS_DIR);

if (seeds.length === 0 && corpus.length === 0) {
  console.log("nothing to convert — already on tracks");
  process.exit(0);
}

const taken = new Set<string>();
let renamed = 0;
let collisions = 0;

function convert(
  raw: LegacyMonth,
  ordinal: number,
): Record<string, unknown> {
  return {
    track: TRACK,
    ordinal,
    // A month's name was its date; now it has to carry its own identity. The
    // generator already wrote a theme per month, and that is a better name
    // than "October 2026" ever was.
    title: raw.description?.trim() || raw.displayName || `Month ${ordinal}`,
    days: raw.days.map((day) => ({
      day: day.day,
      words: day.words.map((word) => {
        let id = `${TRACK}-${slugify(word.word)}`;
        if (taken.has(id)) {
          // Two months holding the same word used to be harmless. It is not
          // any more, and silently letting one win would mean mastering
          // either marked both.
          collisions++;
          let n = 2;
          const base = id;
          while (taken.has(id)) id = `${base}-${n++}`;
        }
        taken.add(id);
        renamed++;
        const { id: _old, ...rest } = word;
        return { id, ...rest };
      }),
    })),
    description: raw.description,
    author: raw.author,
    createdAt: raw.createdAt,
  };
}

const written: string[] = [];
let ordinal = 1;

for (const file of seeds) {
  const raw = JSON.parse(readFileSync(join(SEED_DIR, file), "utf-8")) as LegacyMonth;
  const out = convert(raw, ordinal);
  const path = join(SEED_DIR, `${TRACK}-${String(ordinal).padStart(2, "0")}.json`);
  if (!DRY) {
    writeFileSync(path, JSON.stringify(out, null, 2) + "\n", "utf-8");
    rmSync(join(SEED_DIR, file));
  }
  written.push(`${file} → ${path}`);
  ordinal++;
}

const trackDir = join(CORPUS_DIR, TRACK);
if (!DRY && !existsSync(trackDir)) mkdirSync(trackDir, { recursive: true });

for (const file of corpus) {
  const raw = JSON.parse(readFileSync(join(CORPUS_DIR, file), "utf-8")) as LegacyMonth;
  const out = convert(raw, ordinal);
  const path = join(trackDir, `${String(ordinal).padStart(2, "0")}.json`);
  if (!DRY) {
    writeFileSync(path, JSON.stringify(out, null, 2) + "\n", "utf-8");
    rmSync(join(CORPUS_DIR, file));
  }
  written.push(`${file} → ${path}`);
  ordinal++;
}

for (const line of written) console.log(line);
console.log(
  `\n${written.length} months, ${renamed} word ids rewritten, ` +
    `${collisions} collisions resolved by suffix` +
    (DRY ? "  (dry run — nothing written)" : ""),
);

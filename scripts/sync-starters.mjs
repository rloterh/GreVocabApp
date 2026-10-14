#!/usr/bin/env node
/**
 * Copy each track's starter months out of the corpus and into the bundle.
 *
 * `public/vocab/` is the corpus and the single source of truth. `src/data/` is
 * a *derived* copy of the two months each track opens with, and exists for one
 * reason: those months must be in the store at bootstrap, before the user can
 * touch the track switcher, and a `public/` file costs a fetch. Bundling them
 * makes switching instant.
 *
 * Derived, not hand-maintained, because the alternative was tried and failed
 * both ways. GRE 1 and 2 lived *only* in `src/data/` — so they were absent
 * from the library index and a user who unloaded them could never get them
 * back — while SAT 1 and 2 were hand-copied into `src/data/` and immediately
 * existed twice, free to drift.
 *
 *   node scripts/sync-starters.mjs           # regenerate
 *   node scripts/sync-starters.mjs --check   # fail if stale (for the audit)
 *
 * Run it after editing a starter month, or after a corpus regeneration.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VOCAB = path.join(ROOT, "public", "vocab");
const DATA = path.join(ROOT, "src", "data");

/** Which months each track opens with. Kept in step with `STARTERS` in main.tsx. */
const STARTERS = {
  gre: [1, 2],
  sat: [1, 2],
};

const check = process.argv.includes("--check");
const stale = [];
let written = 0;

mkdirSync(DATA, { recursive: true });

for (const [track, ordinals] of Object.entries(STARTERS)) {
  for (const ordinal of ordinals) {
    const from = path.join(VOCAB, track, `${String(ordinal).padStart(2, "0")}.json`);
    const to = path.join(DATA, `${track}-${String(ordinal).padStart(2, "0")}.json`);
    const rel = path.relative(ROOT, to);

    if (!existsSync(from)) {
      console.error(`Missing corpus month ${path.relative(ROOT, from)}.`);
      process.exit(1);
    }

    // Reformat through the parser so a whitespace-only difference between the
    // two files never counts as drift.
    const source = `${JSON.stringify(JSON.parse(readFileSync(from, "utf-8")), null, 2)}\n`;
    const current = existsSync(to) ? readFileSync(to, "utf-8") : null;

    if (current === source) continue;

    if (check) {
      console.log(`MISS ${rel} is out of date`);
      stale.push(rel);
      continue;
    }
    writeFileSync(to, source);
    console.log(`ok   ${rel}`);
    written += 1;
  }
}

if (check) {
  if (stale.length) {
    console.error(
      `\n${stale.length} starter file(s) out of date. ` +
        "Run `node scripts/sync-starters.mjs`.",
    );
    process.exit(1);
  }
  console.log("ok   starters match the corpus");
} else {
  console.log(
    written ? `\nSynced ${written} starter month(s).` : "Already up to date.",
  );
}

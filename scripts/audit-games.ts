/**
 * Can the shipped corpus carry the games, and are the questions honest?
 *
 *   npx tsx scripts/audit-games.ts [vocabDir] [outDir]
 *
 * Two outputs, because they answer different questions.
 *
 * **Counts** — per game, track and tier, how many words a game can ask about
 * and how many it actually builds a question for. A tier that cannot fill a
 * round is a defect the hub would have to apologise for.
 *
 * **A sample for a human.** The guard in src/lib/games/relations.ts is only as
 * good as the model-written synonym lists it reads, and no assertion can tell
 * whether "cinch" is a fair answer for "sinecure". So this prints 200 real
 * questions to a text file for a person to read. docs/GAMES.md §6.2: a game
 * does not ship until that read finds fewer than 2% defensible distractors or
 * wrong keys. Lines the script itself finds suspicious are marked `?` so the
 * reader starts there.
 *
 * Uses the app's own parser, stemmer and builders — the same code that runs
 * in the game — so a pass here is a pass there.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseVocabMonth, allWordsInMonth } from "../src/lib/vocabulary";
import { stem } from "../src/lib/stem";
import { keyOf } from "../src/lib/track";
import { GAMES, GAME_ORDER, TIER_LABEL } from "../src/lib/games/catalogue";
import { tierOrdinals } from "../src/lib/games/pool";
import { buildRelationIndex } from "../src/lib/games/relations";
import { parseRelationsFile } from "../src/lib/games/relations-file";
import { relationsFromCorpus } from "./lib/relations-file";
import { buildRound, eligibleCount } from "../src/lib/games/round";
import { seededShuffle } from "../src/lib/order";
import type { GameQuestion, Tier } from "../src/lib/games/types";
import type { Track, VocabMonth, VocabWord } from "../src/types";

const ROOT = process.argv[2] ?? "public/vocab";
const OUT = process.argv[3] ?? "audit-out";
/**
 * Which questions go in the sample. Change it to draw a fresh one: a guard
 * tuned against one sample has to be judged on another, or the read measures
 * only how well the last fixes memorised it.
 */
const SAMPLE_SEED = Number(process.argv[4] ?? 1);
const TRACKS: Track[] = ["gre", "sat"];
const TIERS: Exclude<Tier, "mine">[] = ["warmup", "standard", "hard", "fiendish"];
const SAMPLE_PER_TRACK_TIER = 25;

function loadTrack(track: Track): VocabMonth[] {
  const dir = join(ROOT, track);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => parseVocabMonth(JSON.parse(readFileSync(join(dir, f), "utf-8")), { track }));
}

/** A wrong option whose stem appears in the target's definition is probably defensible. */
function suspicious(q: GameQuestion, word: VocabWord): string | null {
  const definitionStems = new Set(
    word.definition.split(/[^A-Za-z'-]+/).filter(Boolean).map((t) => stem(t)),
  );
  for (const [i, option] of q.options.entries()) {
    if (i === q.answer) continue;
    if (definitionStems.has(stem(option))) return `"${option}" appears in the definition`;
  }
  return null;
}

let failures = 0;

// The guard reads the whole corpus's graph, exactly as the app does: from
// relations.json. A stale file would mean the app guards against yesterday's
// synonyms, so it is checked before anything else.
const relationsPath = join(ROOT, "relations.json");
const shipped = existsSync(relationsPath) ? readFileSync(relationsPath, "utf-8") : "";
if (shipped !== JSON.stringify(relationsFromCorpus(ROOT))) {
  console.log("FAIL relations.json is missing or stale — run: npx tsx scripts/build-relations.ts");
  process.exit(1);
}
const index = buildRelationIndex(parseRelationsFile(JSON.parse(shipped)));

const sample: string[] = [];
const report: string[] = [];

for (const game of GAME_ORDER) {
  report.push(`\n${GAMES[game].name}`);
  for (const track of TRACKS) {
    const months = loadTrack(track);
    if (months.length === 0) continue;
    const ordinals = months.map((m) => m.ordinal);
    for (const tier of TIERS) {
      const wanted = new Set(tierOrdinals(ordinals, tier));
      const tierMonths = months.filter((m) => wanted.has(m.ordinal));
      const words = tierMonths.flatMap(allWordsInMonth);
      const monthOf: Record<string, string> = {};
      for (const m of tierMonths) for (const w of allWordsInMonth(m)) monthOf[w.id] = keyOf(m);
      const byId = new Map(words.map((w) => [w.id, w]));

      const started = performance.now();
      const full = buildRound({
        game, track, tier, prompts: words, pool: words, monthOf, seed: 7 + TIERS.indexOf(tier) * 101,
        length: words.length, index,
      });
      const perQuestionMs = (performance.now() - started) / Math.max(1, full.questions.length);

      const t0 = performance.now();
      const ten = buildRound({ game, track, tier, prompts: words, pool: words, monthOf, seed: 11 });
      const roundMs = performance.now() - t0;

      const eligible = eligibleCount(game, words);
      const built = full.questions.length;
      const flagged = full.questions.filter((q) => suspicious(q, byId.get(q.wordId)!)).length;
      const ok = ten.shortfall === 0 && built >= 100;
      if (!ok) failures++;
      report.push(
        `  ${ok ? "ok  " : "FAIL"} ${track}/${TIER_LABEL[tier].padEnd(8)} months ${[...wanted][0]}–${[...wanted].at(-1)}` +
          `  words ${String(words.length).padStart(4)}  eligible ${String(eligible).padStart(4)}` +
          `  built ${String(built).padStart(4)} (${Math.round((100 * built) / Math.max(1, eligible))}%)` +
          `  flagged ${flagged}  round ${roundMs.toFixed(0)}ms  ~${perQuestionMs.toFixed(1)}ms/q`,
      );

      // A seeded draw from every built question, so it spans the tier and a
      // new seed gives questions no reader has seen.
      const picked = seededShuffle(full.questions, SAMPLE_SEED * 7919 + TIERS.indexOf(tier))
        .slice(0, SAMPLE_PER_TRACK_TIER);
      for (const q of picked) {
        const word = byId.get(q.wordId)!;
        const why = suspicious(q, word);
        sample.push(
          `${why ? "?" : " "} [${track}/${tier}] ${word.word} (${word.partOfSpeech}) — ${word.definition}`,
          ...q.options.map((o, j) => `      ${j === q.answer ? "✓" : " "} ${o}`),
          ...(why ? [`      ? ${why}`] : []),
          "",
        );
      }
    }
  }
}

mkdirSync(OUT, { recursive: true });
const samplePath = join(OUT, "games-sample.txt");
writeFileSync(
  samplePath,
  [
    "Lexicon games — human-read sample",
    "Mark each question: OK, DEFENSIBLE (a wrong option is arguably right), or WRONG KEY.",
    "Ship threshold: fewer than 2% of questions marked. Lines starting with ? were flagged by the script.",
    "",
    ...sample,
  ].join("\n"),
  "utf-8",
);

console.log(report.join("\n"));
console.log(`\nSample of ${sample.filter((l) => /^[ ?] \[/.test(l)).length} questions written to ${samplePath}`);
if (failures > 0) {
  console.log(`\n${failures} tier(s) cannot fill a round.`);
  process.exit(1);
}
console.log("\nEvery tier can fill a round.");

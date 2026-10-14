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
import { ambiguousKeys } from "../src/lib/games/builders/unscramble";
import { parseAnagramRisk } from "../src/lib/games/anagram-risk";
import { anagramRiskFromCorpus } from "./lib/anagram-risk";
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
  if (q.kind !== "choice" || q.ask) return null;
  const definitionStems = new Set(
    word.definition.split(/[^A-Za-z'-]+/).filter(Boolean).map((t) => stem(t)),
  );
  for (const [i, option] of q.options.entries()) {
    if (i === q.answer || i === q.trap) continue;
    if (definitionStems.has(stem(option))) return `"${option}" appears in the definition`;
  }
  return null;
}

/** One question as a reader sees it, in the shape its game asks it. */
function describe(q: GameQuestion, word: VocabWord, track: Track, tier: Tier): string[] {
  const why = suspicious(q, word);
  const head = `${why ? "?" : " "} [${track}/${tier}] ${word.word} (${word.partOfSpeech}) — ${word.definition}`;
  if (q.kind === "match") {
    return [
      `  [${track}/${tier}] board (${q.matchKind}s)`,
      ...q.pairs.map((p) => `      ${p.word.padEnd(18)} ⟷ ${p.match}`),
      "",
    ];
  }
  if (q.kind === "tiles") {
    return [
      `  [${track}/${tier}] (${q.partOfSpeech}) — ${q.definition}`,
      `      Tiles: ${q.tiles.join(" ").toUpperCase()}   Answer: ${q.word}`,
      "",
    ];
  }
  if (q.kind === "spell") {
    return [
      `  [${track}/${tier}] (${q.partOfSpeech}) — ${q.definition}`,
      `      Answer: ${q.word}  (${q.word.length} letters)`,
      "",
    ];
  }
  if (q.kind === "verdict") {
    return [
      head,
      `      Statement: ${q.statement}`,
      `      Intended:  ${q.answer === 0 ? "FACT" : "FICTION"}`,
      ...(q.explain.note ? [`      Note:      ${q.explain.note}`] : []),
      "",
    ];
  }
  return [
    head,
    ...(q.sentence ? [`      Sentence: ${q.sentence}`] : []),
    ...(q.ask ? [`      Ask: ${q.ask}  (✓ marks the outsider)`] : []),
    ...q.options.map(
      (o, j) => `      ${j === q.answer ? "✓" : " "} ${o}${j === q.trap ? "   (planted trap: a synonym)" : ""}`,
    ),
    ...(why ? [`      ? ${why}`] : []),
    ...(q.ask && q.explain.note ? [`      Note: ${q.explain.note}`] : []),
    "",
  ];
}

/** What a reader is asked to judge, per game. */
const RUBRIC: Record<string, string> = {
  closest: "The ✓ option should be the closest in meaning. Mark DEFENSIBLE if a wrong option is arguably as close, WRONG KEY if ✓ is not a fair synonym.",
  opposites: "The ✓ option should be the opposite. A planted trap is a synonym and is meant to be wrong. Mark DEFENSIBLE if a wrong option is arguably an opposite too, WRONG KEY if ✓ is not a fair antonym.",
  gap: "The ✓ word should be the one that fits the sentence. Mark DEFENSIBLE if a wrong option fits the sentence about as well, WRONG KEY if ✓ does not fit.",
  odd: "Three options should share a meaning and ✓ should clearly not. Mark DEFENSIBLE if ✓ arguably belongs with the others or another option arguably does not, WRONG if the three do not really share a meaning.",
  match: "Each word should pair with exactly one item on its board. Mark AMBIGUOUS if an item could fairly pair with a second word on the same board, WRONG if a pair is not a fair match.",
  unscramble: "The tiles must spell the answer and no other common English word, and the definition must identify it. Mark ANAGRAM if the tiles also spell another common word (name it), GIVEAWAY if the definition contains the answer, WRONG if the definition does not fit.",
  spell: "The definition should identify the word without giving it away. Mark GIVEAWAY if the definition contains the word or an obvious form of it, WRONG if the definition does not fit the answer.",
  fact: "The statement should be clearly FACT or clearly FICTION as marked. Mark WRONG if the intended verdict is wrong or arguable, or if the statement is ungrammatical or misleading.",
};

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
const relationEntries = parseRelationsFile(JSON.parse(shipped));
const index = buildRelationIndex(relationEntries);
// Unscramble's anagram exclusions, exactly as the app assembles them: the
// corpus's own, plus the build-time list of common-English collisions.
const riskPath = join(ROOT, "anagram-risk.json");
const riskShipped = existsSync(riskPath) ? readFileSync(riskPath, "utf-8") : "";
if (riskShipped !== JSON.stringify(anagramRiskFromCorpus(ROOT))) {
  console.log("FAIL anagram-risk.json is missing or stale — run: npx tsx scripts/build-anagrams.ts");
  process.exit(1);
}
const ambiguous = ambiguousKeys(relationEntries.map((r) => r.word));
for (const k of parseAnagramRisk(JSON.parse(riskShipped))) ambiguous.add(k);

const report: string[] = [];
const samples = new Map<string, string[]>();

for (const game of GAME_ORDER) {
  report.push(`\n${GAMES[game].name}`);
  const sample: string[] = [];
  samples.set(game, sample);
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
        game, track, tier, prompts: words, pool: words, monthOf, seed: 7 + TIERS.indexOf(tier) * 101, ambiguous,
        length: words.length, index,
      });
      const perQuestionMs = (performance.now() - started) / Math.max(1, full.questions.length);

      const t0 = performance.now();
      const ten = buildRound({ game, track, tier, prompts: words, pool: words, monthOf, seed: 11, ambiguous });
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
      for (const q of picked) sample.push(...describe(q, byId.get(q.wordId)!, track, tier));
    }
  }
}

mkdirSync(OUT, { recursive: true });
const written: string[] = [];
for (const [game, sample] of samples) {
  const path = join(OUT, `games-sample-${game}.txt`);
  writeFileSync(
    path,
    [
      `Lexicon games — ${GAMES[game].name}, a sample for a reader (seed ${SAMPLE_SEED})`,
      RUBRIC[game] ?? "",
      "Ship threshold: fewer than 2% of questions marked. Lines starting with ? were flagged by the script.",
      "",
      ...sample,
    ].join("\n"),
    "utf-8",
  );
  written.push(`${path} (${sample.filter((l) => /^[ ?] \[/.test(l)).length})`);
}

console.log(report.join("\n"));
console.log(`\nSamples written:\n  ${written.join("\n  ")}`);
if (failures > 0) {
  console.log(`\n${failures} tier(s) cannot fill a round.`);
  process.exit(1);
}
console.log("\nEvery tier can fill a round.");

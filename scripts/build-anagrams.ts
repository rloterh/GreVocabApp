/**
 * Write public/vocab/anagram-risk.json: the letter-sets of corpus words that
 * also spell some other common English word.
 *
 *   npx tsx scripts/build-anagrams.ts [vocabDir]
 *
 * Unscramble cannot ask *tacit* when its tiles also spell "attic": a player
 * who finds that has been right. The corpus catches its own anagrams
 * (*discreet* and *discrete*), but a blind read of the sample found 6% of
 * questions with an anagram among ordinary English words — "ridge" for
 * *dirge*, "plums" for *slump*. Those need a dictionary.
 *
 * The dictionary is SCOWL through `wordlist-english`, levels 10–50 of the
 * English, American and British lists: common words and their inflections,
 * not every obscure entry. Level 50 is the boundary SCOWL itself recommends
 * for spell-checking; above it, "gouts" and "actin" would exclude good
 * questions over words no player would think of.
 *
 * The dictionary is a dev dependency and never ships. Only this file of
 * colliding letter-sets does. Rerun after any corpus change;
 * scripts/audit-games.ts fails when the file is stale.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { anagramRiskFromCorpus } from "./lib/anagram-risk";

const ROOT = process.argv[2] ?? "public/vocab";
const file = anagramRiskFromCorpus(ROOT);
writeFileSync(join(ROOT, "anagram-risk.json"), JSON.stringify(file), "utf-8");
console.log(`anagram-risk.json: ${file.keys.length} letter-sets with a common-English anagram`);

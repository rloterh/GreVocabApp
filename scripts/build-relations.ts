/**
 * Write public/vocab/relations.json: every word's synonyms and antonyms, for
 * both tracks, and nothing else.
 *
 *   npx tsx scripts/build-relations.ts [vocabDir]
 *
 * The games' answer guard (src/lib/games/relations.ts) needs the whole
 * corpus's synonym graph, because the link that makes an option defensible is
 * often on a card in another month. Fetching every month to get it would be
 * 3.6 MB; this is about 400 KB, 130 KB compressed.
 *
 * Generated, never edited. Rerun after any change to the corpus;
 * scripts/audit-games.ts fails when this file is stale.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { relationsFromCorpus } from "./lib/relations-file";

const ROOT = process.argv[2] ?? "public/vocab";
const file = relationsFromCorpus(ROOT);
writeFileSync(join(ROOT, "relations.json"), JSON.stringify(file), "utf-8");
console.log(`relations.json: ${file.entries.length} words`);

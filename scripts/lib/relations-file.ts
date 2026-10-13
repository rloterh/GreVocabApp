import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseVocabMonth, allWordsInMonth } from "../../src/lib/vocabulary";
import { toRelationsFile, type RelationsFile } from "../../src/lib/games/relations-file";
import type { Track } from "../../src/types";

/** The relations file the corpus under `root` should produce. */
export function relationsFromCorpus(root: string): RelationsFile {
  const words = [];
  for (const track of ["gre", "sat"] as Track[]) {
    const dir = join(root, track);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
      const month = parseVocabMonth(JSON.parse(readFileSync(join(dir, f), "utf-8")), { track });
      words.push(...allWordsInMonth(month));
    }
  }
  return toRelationsFile(words);
}

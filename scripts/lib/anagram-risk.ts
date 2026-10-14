import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRelationsFile } from "../../src/lib/games/relations-file";
import { letterKey } from "../../src/lib/games/builders/unscramble";
import { ANAGRAM_RISK_VERSION, type AnagramRiskFile } from "../../src/lib/games/anagram-risk";

const require = createRequire(import.meta.url);

/** SCOWL levels that count as "common": 10–50, the spell-checker boundary. */
const LEVELS = [10, 20, 35, 40, 50];
const LISTS = ["english", "english/american", "english/british"];

function commonWords(): Set<string> {
  const lists = require("wordlist-english") as Record<string, string[]>;
  const out = new Set<string>();
  for (const list of LISTS) {
    for (const level of LEVELS) {
      for (const w of lists[`${list}/${level}`] ?? []) {
        const word = w.toLowerCase();
        if (/^[a-z]+$/.test(word)) out.add(word);
      }
    }
  }
  return out;
}

/** The anagram-risk file the corpus under `root` should produce. */
export function anagramRiskFromCorpus(root: string): AnagramRiskFile {
  const relations = parseRelationsFile(JSON.parse(readFileSync(join(root, "relations.json"), "utf-8")));
  const corpus = new Set(
    relations.map((r) => r.word.trim().toLowerCase()).filter((w) => /^[a-z]{5,10}$/.test(w)),
  );
  const byKey = new Map<string, Set<string>>();
  for (const word of commonWords()) {
    if (word.length < 5 || word.length > 10) continue;
    const key = letterKey(word);
    let set = byKey.get(key);
    if (!set) byKey.set(key, (set = new Set()));
    set.add(word);
  }
  const keys = new Set<string>();
  for (const word of corpus) {
    const others = [...(byKey.get(letterKey(word)) ?? [])].filter((w) => w !== word);
    if (others.length > 0) keys.add(letterKey(word));
  }
  return { version: ANAGRAM_RISK_VERSION, keys: [...keys].sort() };
}

/**
 * The shape of public/vocab/relations.json, written by
 * scripts/build-relations.ts and read by the games.
 *
 * Tuples rather than objects, because the file carries 5,000-odd entries and
 * the field names would be a third of it.
 */

import type { RelationSource } from "./relations";

export const RELATIONS_FILE_VERSION = 1;

export interface RelationsFile {
  version: number;
  /** `[word, synonyms, antonyms]`, sorted so the file diffs cleanly. */
  entries: Array<[string, string[], string[]]>;
}

export function toRelationsFile(words: Iterable<RelationSource>): RelationsFile {
  const entries: RelationsFile["entries"] = [];
  for (const w of words) {
    entries.push([w.word, [...(w.synonyms ?? [])], [...(w.antonyms ?? [])]]);
  }
  entries.sort((a, b) => a[0].localeCompare(b[0]) || JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { version: RELATIONS_FILE_VERSION, entries };
}

/** Read the file, or return nothing for anything that is not one — never throw. */
export function parseRelationsFile(raw: unknown): RelationSource[] {
  if (!raw || typeof raw !== "object") return [];
  const file = raw as Partial<RelationsFile>;
  if (file.version !== RELATIONS_FILE_VERSION || !Array.isArray(file.entries)) return [];
  const out: RelationSource[] = [];
  for (const entry of file.entries) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
    const strings = (v: unknown) =>
      Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
    out.push({ word: entry[0], synonyms: strings(entry[1]), antonyms: strings(entry[2]) });
  }
  return out;
}

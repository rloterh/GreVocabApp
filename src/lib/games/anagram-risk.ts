/**
 * The shape of public/vocab/anagram-risk.json, written by
 * scripts/build-anagrams.ts: sorted-letter keys of corpus words that also
 * spell a common English word. Unscramble never asks those (*tacit*, whose
 * tiles also spell "attic").
 */

export const ANAGRAM_RISK_VERSION = 1;

export interface AnagramRiskFile {
  version: number;
  keys: string[];
}

/** Read the file, or nothing for anything that is not one — never throw. */
export function parseAnagramRisk(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const file = raw as Partial<AnagramRiskFile>;
  if (file.version !== ANAGRAM_RISK_VERSION || !Array.isArray(file.keys)) return [];
  return file.keys.filter((k): k is string => typeof k === "string");
}

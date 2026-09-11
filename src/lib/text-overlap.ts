/**
 * How much of one piece of text is just the other one again.
 *
 * Used in two places that look unrelated but ask the same question:
 *
 * - `verify.ts` — is this "practice sentence" the example sentence copied?
 * - `word-quality.ts` — is this "mnemonic" the definition reworded?
 *
 * Extracted so there is one implementation rather than two that drift, and so
 * the threshold is a number someone can find and argue about.
 */

/** Punctuation-free, lowercase, single-spaced. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/["'.,!?;:—–-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The share of `candidate`'s words that also appear in `source`, 0 to 1.
 *
 * Asymmetric on purpose: the question is always "how much of this new text is
 * recycled", not "how similar are these two". A short mnemonic lifted wholesale
 * from a long definition should score 1, and it does.
 */
export function overlapRatio(candidate: string, source: string): number {
  const a = normalizeText(candidate);
  const b = normalizeText(source);
  if (!a || !b) return 0;

  const sourceWords = new Set(b.split(" "));
  const candidateWords = a.split(" ");
  const shared = candidateWords.filter((w) => sourceWords.has(w)).length;
  return shared / candidateWords.length;
}

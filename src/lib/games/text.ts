/**
 * How a word is written on a game screen.
 *
 * A few cards were authored with a capital (*Castigate*, *Kinetic*), which
 * reads as a proper noun in a list of options and in the middle of a
 * sentence. A word that is only capitalised at its first letter is shown in
 * lower case; anything else (an acronym, *iPad*) is left alone.
 */
export function displayWord(word: string): string {
  const w = word.trim();
  return /^[A-Z][a-z'-]+$/.test(w) ? w.toLowerCase() : w;
}

/**
 * "To lessen in intensity." → "to lessen in intensity", for use mid-sentence.
 *
 * Lowers the first letter unless the first word is an acronym — "A lack of"
 * must become "a lack of", which a two-lowercase-letters test misses.
 */
export function asClause(definition: string): string {
  const d = definition.trim().replace(/[.;:\s]+$/, "");
  const first = d.split(/\s/)[0] ?? "";
  const acronym = first.length > 1 && first === first.toUpperCase();
  return /^[A-Z]/.test(d) && !acronym ? d.charAt(0).toLowerCase() + d.slice(1) : d;
}

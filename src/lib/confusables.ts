import type { VocabWord } from "@/types";
import { normalizeWord } from "@/lib/stem";
import { seedFor, seededShuffle } from "@/lib/order";

/**
 * Words people reliably swap for each other, and a drill built from them.
 *
 * This is deliberately **not** a quiz mode. `quiz-build.ts` refuses to emit a
 * two-option question — "a question the user can guess by elimination is worse
 * than one question fewer" — and that rule is right for recall. A confusable
 * pair is the opposite exercise: the whole point is a forced choice between
 * two specific words, and there is nothing to eliminate. Keeping it separate
 * also keeps quiz accuracy meaning one thing, rather than mixing a coin-flip
 * baseline into a number the user reads as mastery.
 *
 * The questions need no authored content. Every card already carries an
 * example sentence that genuinely contains its word, so blanking the word out
 * and offering the pair produces a question that is correct by construction.
 */

export interface ConfusablePair {
  a: string;
  b: string;
  /** One line saying what actually separates them. Shown after answering. */
  note: string;
}

export const CONFUSABLE_PAIRS: ConfusablePair[] = [
  { a: "affect", b: "effect", note: "Affect is usually the verb, effect usually the noun: a change affects you, and the effect is what follows." },
  { a: "discreet", b: "discrete", note: "Discreet is tactful; discrete is separate. The second has the two e's kept apart." },
  { a: "elicit", b: "illicit", note: "To elicit is to draw out; illicit means unlawful." },
  { a: "flaunt", b: "flout", note: "You flaunt what you want seen and flout a rule you want ignored." },
  { a: "ingenious", b: "ingenuous", note: "Ingenious is clever; ingenuous is innocent, almost naive." },
  { a: "venal", b: "venial", note: "Venal is corruptible, open to bribery; a venial fault is minor and forgivable." },
  { a: "censure", b: "censor", note: "To censure is to condemn; to censor is to suppress." },
  { a: "appraise", b: "apprise", note: "To appraise is to value; to apprise is to inform." },
  { a: "imminent", b: "eminent", note: "Imminent means about to happen; eminent means distinguished." },
  { a: "credible", b: "credulous", note: "Credible means believable; credulous means too ready to believe." },
  { a: "perspicacious", b: "perspicuous", note: "Perspicacious is shrewd about things; perspicuous is clearly expressed." },
  { a: "turbid", b: "turgid", note: "Turbid is muddy or cloudy; turgid is swollen, and of prose, pompous." },
  { a: "emigrate", b: "immigrate", note: "You emigrate from a country and immigrate to one." },
  { a: "ambiguous", b: "ambivalent", note: "Ambiguous has more than one meaning; ambivalent has more than one feeling." },
  { a: "prodigal", b: "prodigious", note: "Prodigal is wastefully extravagant; prodigious is enormous or remarkable." },
  { a: "veracious", b: "voracious", note: "Veracious is truthful; voracious is ravenous." },
  { a: "complement", b: "compliment", note: "A complement completes; a compliment praises." },
  { a: "principal", b: "principle", note: "A principal is first in rank or amount; a principle is a rule." },
  { a: "allusion", b: "illusion", note: "An allusion is an indirect reference; an illusion is a false impression." },
  { a: "adverse", b: "averse", note: "Adverse describes conditions against you; averse describes your own reluctance." },
  { a: "prescribe", b: "proscribe", note: "To prescribe is to recommend; to proscribe is to forbid. Near opposites." },
  { a: "disinterested", b: "uninterested", note: "Disinterested is impartial; uninterested is bored." },
  { a: "militate", b: "mitigate", note: "To militate against is to weigh against; to mitigate is to soften." },
  { a: "tortuous", b: "torturous", note: "Tortuous is full of twists; torturous is full of pain." },
  { a: "deprecate", b: "depreciate", note: "To deprecate is to disapprove; to depreciate is to fall in value." },
  { a: "fortuitous", b: "fortunate", note: "Fortuitous means by chance — which may be good or bad; fortunate means lucky." },
  { a: "stationary", b: "stationery", note: "Stationary stands still; stationery is paper. The e is for envelopes." },
  { a: "continual", b: "continuous", note: "Continual repeats with gaps; continuous never stops." },
  { a: "economic", b: "economical", note: "Economic is about the economy; economical is thrifty." },
  { a: "simple", b: "simplistic", note: "Simple is a virtue; simplistic is an accusation — too simple to be true." },
  { a: "reluctant", b: "reticent", note: "Reluctant is unwilling to act; reticent is unwilling to speak." },
  { a: "tenant", b: "tenet", note: "A tenant rents; a tenet is a belief held." },
  { a: "judicial", b: "judicious", note: "Judicial relates to courts; judicious means showing good judgement." },
  { a: "sanguine", b: "sanguinary", note: "Sanguine is cheerfully optimistic; sanguinary is bloody." },
  { a: "epigram", b: "epigraph", note: "An epigram is a witty saying; an epigraph is a quotation at the head of a text." },
  { a: "defuse", b: "diffuse", note: "To defuse is to make safe; to diffuse is to spread out." },
];

export interface ConfusableQuestion {
  pair: ConfusablePair;
  /** The example sentence with the word replaced by a blank. */
  sentence: string;
  /** The word that belongs in the blank. */
  answer: string;
  /** Both words, in a stable but unpredictable order. */
  options: [string, string];
  /** The id of the card the sentence came from, so the UI can link to it. */
  wordId: string;
}

const BLANK = " ____ ";

/**
 * Build a drill from what the user has.
 *
 * A pair qualifies only when **both** words are loaded. Asking somebody to
 * choose between a word they have studied and one they have never been given
 * is not a discrimination exercise, it is a trick.
 */
export function buildConfusableDrill(
  words: readonly VocabWord[],
  seed: string,
): ConfusableQuestion[] {
  const byWord = new Map(words.map((w) => [normalizeWord(w.word), w]));
  const questions: ConfusableQuestion[] = [];

  for (const pair of CONFUSABLE_PAIRS) {
    const a = byWord.get(normalizeWord(pair.a));
    const b = byWord.get(normalizeWord(pair.b));
    if (!a || !b) continue;

    // One question per pair per round: two would put the same distinction
    // twice in a row and teach the position rather than the word.
    const pick = seedFor([seed, pair.a]) % 2 === 0 ? a : b;
    const other = pick === a ? b : a;

    const sentence = blankOut(pick.example, pick.word);
    if (!sentence) continue;
    // If the sibling also appears, the blank has two defensible answers.
    if (mentions(sentence, other.word)) continue;

    questions.push({
      pair,
      sentence,
      answer: pick.word,
      options: seedFor([seed, pair.a, "order"]) % 2 === 0
        ? [pick.word, other.word]
        : [other.word, pick.word],
      wordId: pick.id,
    });
  }

  return seededShuffle(questions, seedFor([seed, "drill"]));
}

/**
 * Replace the word — in whatever form it takes — with a blank.
 *
 * Returns null when the sentence does not visibly contain it, which happens
 * and is not worth a question: a blank the sentence never had is a puzzle
 * about the generator rather than about the word.
 */
export function blankOut(sentence: string, word: string): string | null {
  if (normalizeWord(word).length < 3) return null;

  const tokens = sentence.split(/(\s+)/);
  let replaced = false;

  const out = tokens.map((token) => {
    if (replaced || /^\s*$/.test(token)) return token;
    const bare = token.replace(/[^A-Za-z-]/g, "");
    if (!bare) return token;
    if (!isFormOf(bare, word)) return token;
    replaced = true;
    // Keep the punctuation that was attached to the word.
    return token.replace(bare, BLANK.trim());
  });

  return replaced ? out.join("") : null;
}

/**
 * Is this token a form of that word?
 *
 * Strict on purpose, and this is the one module where that matters most.
 * Elsewhere the app matches inflections by shared stem prefix, which is right
 * for `rebuff`/`rebuffed`. Here it is actively wrong: *discreet* and
 * *discrete* share the prefix `discre`, and differing only at the end is the
 * defining property of a confusable pair. A lenient match would blank the
 * sibling out of its own sentence and produce a question with the wrong
 * answer.
 *
 * So: the token must *be* the word, or begin with the whole of it.
 * `elicited` passes for `elicit`; `discrete` does not pass for `discreet`.
 * The cost is that `appraisal` is not recognised as `appraise`, which loses a
 * question rather than getting one wrong.
 */
function isFormOf(token: string, word: string): boolean {
  const a = normalizeWord(token);
  const b = normalizeWord(word);
  if (!a || b.length < 3) return false;
  return a === b || a.startsWith(b);
}

function mentions(sentence: string, word: string): boolean {
  return sentence
    .split(/\s+/)
    .some((token) => isFormOf(token.replace(/[^A-Za-z-]/g, ""), word));
}

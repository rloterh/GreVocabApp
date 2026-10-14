/**
 * The synonym and antonym graph, and the guard that keeps answers honest.
 *
 * The most important rule in the games: **a game that marks a defensible
 * answer wrong is worse than no game.** The reference app this section is
 * modelled on fails it (*leverage* → "power", over "flexibility"), and it is
 * the fastest way to lose a player's trust.
 *
 * Every comparison goes through `stem()`, so *abate*, *abated* and *abating*
 * are one node. Lists are read in both directions, because a synonym list is
 * only as good as whichever card was written more carefully.
 *
 * The corpus's synonym lists were model-written, so the guard is deliberately
 * over-cautious: it rejects a candidate on a one-sided second hop as well as a
 * direct link. Rejecting a good distractor costs one candidate from a pool of
 * hundreds; accepting a defensible one costs a player's trust.
 *
 * See docs/GAMES.md §6.2.
 */

import type { VocabWord } from "@/types";
import { stem } from "@/lib/stem";

/** The longest term worth showing as an option: longer ones wrap on a phone. */
export const MAX_TERM_LENGTH = 16;

export interface RelationIndex {
  /** Headword stem → its synonyms' stems. */
  synonyms: Map<string, Set<string>>;
  /** Headword stem → its antonyms' stems. */
  antonyms: Map<string, Set<string>>;
  /** Synonym stem → the headword stems that list it. */
  listedBy: Map<string, Set<string>>;
  /** Antonym stem → the headword stems that list it as an antonym. */
  opposedBy: Map<string, Set<string>>;
}

function add(map: Map<string, Set<string>>, key: string, value: string): void {
  if (!key || !value) return;
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(value);
}

const EMPTY: ReadonlySet<string> = new Set();

/**
 * The part of a word the graph needs. A `VocabWord` is one; so is an entry of
 * `public/vocab/relations.json`, which carries the whole corpus's graph
 * without its definitions and examples.
 */
export type RelationSource = Pick<VocabWord, "word" | "synonyms" | "antonyms">;

/**
 * Build the graph.
 *
 * Feed it the **whole corpus**, not just the words a round draws from. The
 * link that makes an option defensible is often on a card in another month:
 * *extol* was offered as wrong for *eulogize* because the card that lists it
 * beside *laud* sat in a different third of the track.
 */
export function buildRelationIndex(words: Iterable<RelationSource>): RelationIndex {
  const index: RelationIndex = {
    synonyms: new Map(),
    antonyms: new Map(),
    listedBy: new Map(),
    opposedBy: new Map(),
  };
  for (const word of words) {
    const head = stem(word.word);
    if (!head) continue;
    for (const synonym of word.synonyms ?? []) {
      const s = stem(synonym);
      add(index.synonyms, head, s);
      add(index.listedBy, s, head);
    }
    for (const antonym of word.antonyms ?? []) {
      const a = stem(antonym);
      add(index.antonyms, head, a);
      add(index.opposedBy, a, head);
    }
  }
  return index;
}

export function synonymsOf(index: RelationIndex, wordStem: string): ReadonlySet<string> {
  return index.synonyms.get(wordStem) ?? EMPTY;
}

export function antonymsOf(index: RelationIndex, wordStem: string): ReadonlySet<string> {
  return index.antonyms.get(wordStem) ?? EMPTY;
}

/**
 * Could this term be shown as an option at all?
 *
 * One word, letters only (hyphens and apostrophes allowed), short enough to
 * sit on one line at 360px, and not a form of the headword — "abatement" as
 * the synonym of "abate" answers itself.
 */
export function isEligibleTerm(term: string, headword: string): boolean {
  const t = term.trim();
  if (t.length < 3 || t.length > MAX_TERM_LENGTH) return false;
  if (!/^[A-Za-z][A-Za-z'-]*[A-Za-z]$/.test(t)) return false;
  const s = stem(t);
  if (s === "" || s === stem(headword)) return false;
  // A clipped form answers itself: "expat" for *expatriate*.
  const a = t.toLowerCase();
  const b = headword.trim().toLowerCase();
  return !(a.length >= 4 && (b.startsWith(a) || a.startsWith(b)));
}

/**
 * Every stem that means roughly what `word` means.
 *
 * The word itself; its synonyms; headwords that list it as a synonym; the
 * synonyms of its synonyms (a one-sided second hop); and headwords that share
 * a synonym with it. An option whose stem is in here is defensible as "the
 * same meaning", and must not be offered as a wrong answer to a synonym
 * question.
 */
export function meaningNeighbourhood(
  index: RelationIndex,
  word: VocabWord,
): Set<string> {
  const head = stem(word.word);
  const out = new Set<string>([head]);
  const direct = new Set<string>(synonymsOf(index, head));
  for (const s of word.synonyms ?? []) direct.add(stem(s));
  for (const h of index.listedBy.get(head) ?? EMPTY) direct.add(h);

  // Content words of the definition. If the card defines *jaunty* as "lively,
  // cheerful and confident", then "cheerful" is a right answer whatever its
  // own card says.
  for (const s of definitionStems(word.definition)) out.add(s);
  for (const term of REVIEWED_EXCLUSIONS[word.word.trim().toLowerCase()] ?? []) out.add(stem(term));

  // Words with the same opposite are near-synonyms: *illegal* and
  // *illegitimate* are both the opposite of *legal*, and the audit found
  // "illegal" offered as a wrong answer for *illegitimate* before this rule.
  const opposites = new Set<string>(antonymsOf(index, head));
  for (const a of word.antonyms ?? []) opposites.add(stem(a));
  for (const a of opposites) {
    for (const sibling of index.opposedBy.get(a) ?? EMPTY) {
      out.add(sibling);
      for (const s of synonymsOf(index, sibling)) out.add(s);
    }
  }

  for (const s of direct) {
    out.add(s);
    // Synonyms of a synonym that is itself a headword.
    for (const second of synonymsOf(index, s)) out.add(second);
    // Headwords that share this synonym with the word.
    for (const sibling of index.listedBy.get(s) ?? EMPTY) out.add(sibling);
  }
  out.delete("");
  return out;
}

/**
 * Near-synonyms a read of the audit sample found and the data cannot.
 *
 * The rules above are general; these are not, and that is the point. Some
 * closeness lives in no card: *unravel*'s answer is "solve", and "uncover" is
 * a fair answer to the same riddle, but no list links them. When a human or
 * independent read of `scripts/audit-games.ts` output finds a defensible
 * option that a general rule cannot catch without wrecking the pool, it goes
 * here — keyed by the headword, listing options it must never be offered.
 *
 * Only ever stricter: an entry can remove an option, never add one.
 */
export const REVIEWED_EXCLUSIONS: Readonly<Record<string, readonly string[]>> = {
  // "Unravel a mystery" is to uncover, discover or fathom it.
  unravel: ["uncover", "reveal", "discover", "fathom", "unearth", "decipher", "detect", "expose"],
  // Sporadic is "occasional, infrequent", next door to rare.
  sporadic: ["rare", "scarce", "infrequent", "uncommon", "occasional"],
  // "I concede you're right" is "I agree you're right".
  concede: ["agree", "admit", "accept", "allow", "acquiesce"],
  // "Leaving no room for doubt" reads as undisputed.
  unambiguous: ["undisputed", "indisputable", "undeniable", "unquestionable", "incontestable"],
  // Compliant is submissive; "spineless" is that, said unkindly.
  compliant: ["spineless", "submissive", "docile", "meek", "pliant"],
  // A token amount is a modicum.
  modicum: ["token", "trace", "shred", "scrap", "iota"],
  // Manipulating someone is commonly deceiving them.
  manipulate: ["deceive", "trick", "dupe", "con", "hoodwink", "maneuver"],
  // Fill the Gap: these fit the same sentence about as well (blind read, seed 4).
  exuberant: ["ecstatic", "elated", "euphoric", "rapturous"],
  untamed: ["untrammeled", "unconstrained", "unbridled", "unfettered"],
  consort: ["connive", "collude", "conspire"],
  grandiloquent: ["gauche"],
  // Odd One Out (blind read, seed 8): "arbitrary rule" is autocratic rule, and
  // "ingrained" is listed beside intrinsic, innate and inherent.
  autocratic: ["arbitrary", "despotic", "tyrannical"],
  intrinsic: ["ingrained", "inbred", "deep-rooted"],
};

/** Words too common to mean anything when they appear in a definition. */
const DEFINITION_STOPWORDS = new Set([
  "about", "after", "also", "being", "between", "cause", "causing", "especially",
  "from", "have", "having", "into", "make", "making", "more", "most", "often",
  "other", "over", "person", "someone", "something", "state", "such", "that",
  "their", "them", "they", "thing", "this", "through", "very", "what", "when",
  "which", "with", "without", "within", "would",
  // The scaffolding definitions are written in. A shared "showing" or
  // "quality" says nothing about meaning, and with an overlap limit of one
  // they would reject half the pool for no reason.
  "able", "acting", "action", "become", "becoming", "behavior", "behaviour",
  "characterized", "describing", "done", "feeling", "given", "giving", "great",
  "having", "kind", "lacking", "manner", "much", "one's", "others", "people",
  "quality", "really", "showing", "tending", "time", "using", "usually", "way",
  "where", "while", "your",
]);

/** The stems of a definition's content words: four letters or more, not filler. */
export function definitionStems(definition: string): Set<string> {
  const out = new Set<string>();
  for (const token of definition.toLowerCase().split(/[^a-z'-]+/)) {
    if (token.length < 4 || DEFINITION_STOPWORDS.has(token)) continue;
    const s = stem(token);
    if (s) out.add(s);
  }
  return out;
}

/**
 * Definitions sharing this many content words describe nearly the same thing.
 *
 * One, after a second, independent read of the audit sample: at two,
 * *demented* ("wildly foolish") and *frantic* ("wildly anxious") passed, and
 * "frenzied" was offered as a wrong answer. Over-rejecting costs a candidate
 * from a pool of hundreds; the audit confirms every tier still fills.
 */
export const DEFINITION_OVERLAP_LIMIT = 1;

/**
 * Is `candidate` safe as the *source* of a wrong answer to a synonym question
 * about `target`?
 *
 * Four ways a candidate can be too close in meaning, each found by the audit
 * in a real question:
 *
 * 1. its headword is in the target's meaning neighbourhood;
 * 2. its own synonyms overlap the neighbourhood (two words sharing a synonym
 *    are near-synonyms);
 * 3. its definition uses the target or one of its synonyms;
 * 4. its definition shares {@link DEFINITION_OVERLAP_LIMIT} or more content
 *    words with the target's (*frantic* and *demented* are both "wildly").
 */
export function isSafeSynonymSource(
  index: RelationIndex,
  neighbourhood: ReadonlySet<string>,
  candidate: VocabWord,
  targetDefinition: ReadonlySet<string> = EMPTY,
): boolean {
  const head = stem(candidate.word);
  if (!head || neighbourhood.has(head)) return false;
  for (const s of synonymsOf(index, head)) {
    if (neighbourhood.has(s)) return false;
  }
  for (const s of candidate.synonyms ?? []) {
    if (neighbourhood.has(stem(s))) return false;
  }
  let shared = 0;
  for (const s of definitionStems(candidate.definition)) {
    if (neighbourhood.has(s) && !targetDefinition.has(s)) return false;
    if (targetDefinition.has(s) && ++shared >= DEFINITION_OVERLAP_LIMIT) return false;
  }
  return true;
}

/**
 * Is `term` a safe wrong answer to a synonym question?
 *
 * Not in the neighbourhood, and not something the target lists as its own
 * synonym under a spelling the stemmer did not join.
 */
export function isSafeWrongSynonym(
  neighbourhood: ReadonlySet<string>,
  term: string,
): boolean {
  const s = stem(term);
  return s !== "" && !neighbourhood.has(s);
}

/**
 * A word's synonyms that can serve as the right answer, best first.
 *
 * "Best" is the order the card lists them in. The lists were written best
 * first, and every other ranking tried did worse: shortest-first chose
 * *inquisitive* → "nosy" over "curious", and taking the least familiar for
 * Fiendish chose the loosest entry a list had (*harrow* → "cultivator",
 * *cackle* → "screech"). Both were found by a blind read of the audit sample.
 * Antonyms are excluded even if a careless list named a word as both.
 */
export function rankedSynonyms(index: RelationIndex, word: VocabWord): string[] {
  const head = stem(word.word);
  const antonyms = antonymsOf(index, head);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of word.synonyms ?? []) {
    const term = raw.trim();
    if (!isEligibleTerm(term, word.word)) continue;
    const s = stem(term);
    if (seen.has(s) || antonyms.has(s)) continue;
    seen.add(s);
    out.push(term);
  }
  return out;
}

/**
 * A word's antonyms that can serve as the right answer, best first — list
 * order, for the reason `rankedSynonyms` gives. A term the card also lists as
 * a synonym is dropped: a careless list cannot make one word both.
 */
export function rankedAntonyms(index: RelationIndex, word: VocabWord): string[] {
  const head = stem(word.word);
  const synonyms = new Set<string>(synonymsOf(index, head));
  for (const s of word.synonyms ?? []) synonyms.add(stem(s));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of word.antonyms ?? []) {
    const term = raw.trim();
    if (!isEligibleTerm(term, word.word)) continue;
    const s = stem(term);
    if (seen.has(s) || synonyms.has(s)) continue;
    seen.add(s);
    out.push(term);
  }
  return out;
}

/**
 * Every stem that could fairly be called an *opposite* of `word` — the mirror
 * of {@link meaningNeighbourhood}, for antonym questions.
 *
 * Its antonyms and their synonyms; headwords that list it as their antonym,
 * and their synonyms; and the opposites of its synonyms, since whatever is
 * opposite to *garrulous* is opposite to *loquacious* too.
 */
export function oppositeNeighbourhood(index: RelationIndex, word: VocabWord): Set<string> {
  const head = stem(word.word);
  const out = new Set<string>();
  const antonyms = new Set<string>(antonymsOf(index, head));
  for (const a of word.antonyms ?? []) antonyms.add(stem(a));
  for (const a of antonyms) {
    out.add(a);
    for (const s of synonymsOf(index, a)) out.add(s);
    for (const h of index.listedBy.get(a) ?? EMPTY) out.add(h);
  }
  for (const h of index.opposedBy.get(head) ?? EMPTY) {
    out.add(h);
    for (const s of synonymsOf(index, h)) out.add(s);
  }
  const synonyms = new Set<string>(synonymsOf(index, head));
  for (const s of word.synonyms ?? []) synonyms.add(stem(s));
  for (const s of synonyms) for (const a of antonymsOf(index, s)) out.add(a);
  for (const term of REVIEWED_OPPOSITE_EXCLUSIONS[word.word.trim().toLowerCase()] ?? []) {
    out.add(stem(term));
  }
  out.delete("");
  out.delete(head);
  return out;
}

/**
 * Opposites a read found and the data cannot. Same contract as
 * {@link REVIEWED_EXCLUSIONS}: only ever stricter.
 */
export const REVIEWED_OPPOSITE_EXCLUSIONS: Readonly<Record<string, readonly string[]>> = {
  // "Wild, uncontrolled": restraint is a fair opposite too.
  frenzy: ["restraint", "self-control", "composure"],
  // A changeable rule contrasts with an inviolable one as well as a breakable.
  inviolable: ["changeable", "alterable", "negotiable"],
  // "Cheerfully optimistic": a bleak outlook is as opposite as a gloomy one.
  sanguine: ["bleak", "despairing", "hopeless", "despondent"],
  // "A guarded response" against "an enthusiastic one" is a natural contrast.
  guarded: ["enthusiastic", "effusive", "eager"],
};

/**
 * Pairs both cards name that a read still found too loose to state as fact:
 * an exodus is a mass flight, not any migration. `isConfirmed` refuses them.
 * Keyed "a|b" in alphabetical order, lower case.
 */
export const REVIEWED_WEAK_PAIRS: ReadonlySet<string> = new Set(["exodus|migration", "connote|denote"]);

/**
 * Is `candidate` safe as the source of a wrong answer to an antonym question?
 *
 * Not itself an opposite; none of its synonyms an opposite; its definition
 * not using one; and — the check the synonym guard has no need of — not the
 * opposite of anything that means what the target means. A word opposed to
 * a synonym of the target is an opposite of the target.
 */
export function isSafeOppositeSource(
  index: RelationIndex,
  opposites: ReadonlySet<string>,
  meaning: ReadonlySet<string>,
  candidate: VocabWord,
): boolean {
  const head = stem(candidate.word);
  if (!head || opposites.has(head)) return false;
  for (const s of synonymsOf(index, head)) if (opposites.has(s)) return false;
  for (const s of candidate.synonyms ?? []) if (opposites.has(stem(s))) return false;
  for (const a of antonymsOf(index, head)) if (meaning.has(a)) return false;
  for (const a of candidate.antonyms ?? []) if (meaning.has(stem(a))) return false;
  for (const s of definitionStems(candidate.definition)) if (opposites.has(s)) return false;
  return true;
}

/**
 * Is this pair confirmed by both cards?
 *
 * A single list's entry is weak evidence: blind reads found *dread* stated as
 * the opposite of "anticipate" and *paragon* of "imperfection", both from one
 * card's list. A pair both cards name is far more reliable — 2,141 words have
 * a confirmed synonym and 814 a confirmed antonym.
 */
export function isConfirmed(
  index: RelationIndex,
  word: VocabWord,
  partner: string,
  relation: "synonym" | "antonym",
): boolean {
  const pair = [word.word.trim().toLowerCase(), partner.trim().toLowerCase()].sort().join("|");
  if (REVIEWED_WEAK_PAIRS.has(pair)) return false;
  const back =
    relation === "synonym" ? synonymsOf(index, stem(partner)) : antonymsOf(index, stem(partner));
  return back.has(stem(word.word));
}

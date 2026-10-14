import type { VocabMonth, VocabWord } from "@/types";

/** The shape a source needs, which is much less than a whole month. */
type RelationWord = Pick<VocabWord, "id"> & {
  synonyms?: string[];
  antonyms?: string[];
};
interface RelationSource {
  days: { words: RelationWord[] }[];
}

/**
 * Give an already-loaded month the synonyms the corpus has since gained.
 *
 * Enriching `public/vocab/` does not reach anybody's store. A month loaded
 * before the enrichment stays exactly as it was, and the library will not
 * re-offer it because it is already loaded — so a user who has had the app a
 * while sees no synonyms on precisely the months they use most, while a new
 * user sees them everywhere. That is the worst way round.
 *
 * This fills the gap in place rather than replacing the month, which matters
 * for three reasons:
 *
 * - **Words the user added survive.** `addWordsToMonth` is a real feature; a
 *   wholesale replace would silently discard whatever it added.
 * - **Nothing already there is overwritten.** Only a word with no synonyms is
 *   touched, so a hand-edited entry is left alone.
 * - **No word is added, removed or moved.** Days keep their contents, so
 *   nobody finds yesterday's words rearranged.
 *
 * Progress is untouched because it is keyed by word id and these ids are
 * unchanged — the property ADR 0011 exists to protect.
 *
 * Returns the same month object when there was nothing to do, so the caller
 * can skip the write entirely.
 */
export function backfillRelations(
  stored: VocabMonth,
  // Structural, not `VocabMonth`: the source is imported JSON, whose `track`
  // widens to `string`, and this only ever reads ids and relations. Saying so
  // is more honest than casting the whole month to a type it does not have.
  source: RelationSource,
): { month: VocabMonth; filled: number } {
  const bySourceId = new Map<string, RelationWord>();
  for (const day of source.days) {
    for (const word of day.words) bySourceId.set(word.id, word);
  }

  let filled = 0;
  const days = stored.days.map((day) => ({
    ...day,
    words: day.words.map((word) => {
      if (word.synonyms?.length) return word;
      const from = bySourceId.get(word.id);
      if (!from?.synonyms?.length) return word;
      filled += 1;
      return {
        ...word,
        synonyms: from.synonyms,
        // Antonyms are genuinely absent for many words, so an empty list from
        // the corpus is an answer rather than a gap. Only set what exists.
        ...(word.antonyms?.length || !from.antonyms?.length
          ? {}
          : { antonyms: from.antonyms }),
      };
    }),
  }));

  return filled === 0 ? { month: stored, filled: 0 } : { month: { ...stored, days }, filled };
}

/** Does this month have any word the corpus could still enrich? */
export function needsRelations(month: VocabMonth): boolean {
  return month.days.some((day) => day.words.some((w) => !w.synonyms?.length));
}

/**
 * A title that is really a date, left over from before months were positions.
 *
 * Months are teaching positions, not calendar months — which month of the year
 * you study one in is a `Schedule`, and two users starting a year apart share
 * the same content (ADR 0012). A month *titled* "April 2026" predates that and
 * says the wrong thing twice: it duplicates the schedule, and it goes stale
 * the moment the start month changes while the schedule quietly moves on.
 *
 * It also looks broken. A track carrying "April 2026", "May 2026" and
 * "Criticism and praise" side by side reads as two half-finished features.
 *
 * The corpus audit already refuses a date title; this is the same rule applied
 * to content that was stored before the rule existed.
 */
// A literal, not a built string: `\d` inside a template literal loses its
// backslash, which silently turns the pattern into "d{4}" and matches nothing.
const DATE_TITLE =
  /^(?:\d{4}-\d{2}|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4})$/i;

export function isDateTitle(title: string): boolean {
  return DATE_TITLE.test(title.trim());
}

/**
 * Give a date-titled month the corpus's real name.
 *
 * Only when the stored title is a date *and* the corpus offers something that
 * is not — a title the user chose is theirs, and a rename they did not ask for
 * is worse than an old one.
 */
export function retitleIfDated(
  stored: VocabMonth,
  source: { title?: string },
): VocabMonth {
  const next = source.title?.trim();
  if (!next || !isDateTitle(stored.title) || isDateTitle(next)) return stored;
  return { ...stored, title: next };
}

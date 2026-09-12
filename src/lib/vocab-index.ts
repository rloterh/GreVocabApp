/**
 * Every word the user has ever had, and what it would collide with.
 *
 * A duplicate is the one failure a vocabulary app cannot explain away, so this
 * is enforcement rather than persuasion. The avoid-list in a generation prompt
 * is an optimisation — it makes the first round better — but nothing is trusted
 * to respect it. Words are filtered here, locally, after they come back.
 *
 * **Removing a month does not free its words.** The entry is retired, not
 * deleted. A user who removes April and regenerates would otherwise be handed
 * April's words again, having already studied them — and their progress
 * records, which are keyed by word id and survive independently, would silently
 * reattach to "new" words. Same orthogonality principle that governs progress
 * (CONTINUING.md principle 1), applied to identity.
 *
 * See docs/VOCAB-GENERATION.md and docs/adr/0005-dedup-by-stem-with-retirement.md.
 */

import type { VocabMonth } from "@/types";
import { stem } from "@/lib/stem";
import { keyOf } from "@/lib/track";

/** Where a word came from, so the UI can explain a collision. */
export type VocabSource = "seed" | "import" | "generated" | "user";

export interface VocabIndexEntry {
  /** The collision key. */
  stem: string;
  /** As originally written, for showing the user. */
  word: string;
  monthKey: string;
  source: VocabSource;
  /** Set when its month was removed. Retired entries still block. */
  retiredAt?: string;
}

/** What happened to a batch of candidate words. */
export interface FilterResult<T> {
  kept: T[];
  /** Rejected, each with the entry it collided with. */
  rejected: Array<{ candidate: T; collidesWith: VocabIndexEntry }>;
}

export class VocabIndex {
  /** stem → entry. First writer wins; a later collision is the duplicate. */
  private readonly entries = new Map<string, VocabIndexEntry>();

  /**
   * Build from loaded months plus a retired ledger.
   *
   * Derived at startup rather than persisted as an index: the months are the
   * source of truth and a stale index would be worse than none. Only the
   * retired ledger has to be stored, because its months are gone.
   */
  static from(
    months: VocabMonth[],
    retired: readonly VocabIndexEntry[] = [],
  ): VocabIndex {
    const index = new VocabIndex();
    // Retired first: if a word is both retired and present in a loaded month,
    // the live month is the better answer, and adding it second lets it win.
    for (const entry of retired) index.put(entry);
    for (const month of months) index.addMonth(month);
    return index;
  }

  /** How many distinct words are known, retired included. */
  get size(): number {
    return this.entries.size;
  }

  /** How many are retired. */
  get retiredCount(): number {
    let n = 0;
    for (const entry of this.entries.values()) if (entry.retiredAt) n++;
    return n;
  }

  /** Is this word already spoken for? */
  has(word: string): boolean {
    return this.lookup(word) !== undefined;
  }

  /** What this word would collide with, if anything. */
  lookup(word: string): VocabIndexEntry | undefined {
    const key = stem(word);
    if (!key) return undefined;
    return this.entries.get(key);
  }

  /** Everything known, retired included. */
  all(): VocabIndexEntry[] {
    return [...this.entries.values()];
  }

  /**
   * Record every word in a month.
   *
   * Idempotent: re-adding a month the index already holds changes nothing,
   * which matters because months are re-derived on every store mutation.
   */
  addMonth(month: VocabMonth, source: VocabSource = "import"): this {
    for (const day of month.days) {
      for (const word of day.words) {
        this.put({
          stem: stem(word.word),
          word: word.word,
          monthKey: keyOf(month),
          source,
        });
      }
    }
    return this;
  }

  /** Record one word. */
  add(
    word: string,
    monthKey: string,
    source: VocabSource = "generated",
  ): this {
    this.put({ stem: stem(word), word, monthKey, source });
    return this;
  }

  /**
   * Mark a month's words retired rather than forgetting them.
   *
   * Returns the retired entries, which the caller persists — this object is
   * rebuilt from the months on next load and would otherwise lose them.
   */
  retireMonth(monthKey: string, at: string = new Date().toISOString()): VocabIndexEntry[] {
    const retired: VocabIndexEntry[] = [];
    for (const [key, entry] of this.entries) {
      if (entry.monthKey !== monthKey || entry.retiredAt) continue;
      const next = { ...entry, retiredAt: at };
      this.entries.set(key, next);
      retired.push(next);
    }
    return retired;
  }

  /**
   * Let retired words be generated again.
   *
   * Deliberately explicit and deliberately not per-word-automatic: the user is
   * saying they are willing to see these again. Only retired entries are
   * released — a live month's words are not the user's to free this way.
   */
  release(monthKey?: string): number {
    let released = 0;
    for (const [key, entry] of this.entries) {
      if (!entry.retiredAt) continue;
      if (monthKey && entry.monthKey !== monthKey) continue;
      this.entries.delete(key);
      released++;
    }
    return released;
  }

  /**
   * Split candidates into those that are new and those that are not.
   *
   * Also catches duplicates *within* the batch — a model asked for 40 words
   * will sometimes return the same word twice, and a filter that only checked
   * the existing index would pass both through.
   */
  filter<T>(candidates: readonly T[], wordOf: (c: T) => string): FilterResult<T> {
    const kept: T[] = [];
    const rejected: FilterResult<T>["rejected"] = [];
    const seenThisBatch = new Map<string, VocabIndexEntry>();

    for (const candidate of candidates) {
      const word = wordOf(candidate);
      const key = stem(word);
      // A word that normalises to nothing is not a word.
      if (!key) continue;

      const existing = this.entries.get(key) ?? seenThisBatch.get(key);
      if (existing) {
        rejected.push({ candidate, collidesWith: existing });
        continue;
      }
      kept.push(candidate);
      seenThisBatch.set(key, {
        stem: key,
        word,
        monthKey: "(this batch)",
        source: "generated",
      });
    }

    return { kept, rejected };
  }

  /**
   * A sample to put in a prompt, biased toward what is being asked for.
   *
   * The whole index does not fit a context window at year scale, and sending
   * 1,100 words to save a handful of regenerations is a bad trade. Words
   * sharing a first letter with the request are the ones a model is most likely
   * to reach for, so they are worth more than a random slice.
   */
  sample(limit: number, near: readonly string[] = []): string[] {
    if (limit <= 0) return [];
    const letters = new Set(
      near.map((w) => stem(w)[0]).filter((c): c is string => Boolean(c)),
    );

    const preferred: string[] = [];
    const rest: string[] = [];
    for (const entry of this.entries.values()) {
      (letters.has(entry.stem[0]) ? preferred : rest).push(entry.word);
    }
    return preferred.concat(rest).slice(0, limit);
  }

  /** Insert, letting a live entry replace a retired one for the same stem. */
  private put(entry: VocabIndexEntry): void {
    if (!entry.stem) return;
    const existing = this.entries.get(entry.stem);
    if (existing && !(existing.retiredAt && !entry.retiredAt)) return;
    this.entries.set(entry.stem, entry);
  }
}

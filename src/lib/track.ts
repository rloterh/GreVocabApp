import type { Track, VocabMonth } from "@/types";

/**
 * Tracks, and the keys that identify content within them.
 *
 * A track is part of a word's identity, not a filter over it — see
 * docs/adr/0011-tracks.md. Everything here is pure and has no opinion about
 * the calendar; that lives in src/lib/schedule.ts.
 */

export const TRACKS: readonly Track[] = ["gre", "sat"] as const;

export const TRACK_META: Record<
  Track,
  { id: Track; label: string; description: string }
> = {
  gre: {
    id: "gre",
    label: "GRE",
    description: "Graduate Record Examination",
  },
  sat: {
    id: "sat",
    label: "SAT",
    description: "Scholastic Assessment Test",
  },
};

export const DEFAULT_TRACK: Track = "gre";

export function isTrack(value: unknown): value is Track {
  return typeof value === "string" && (TRACKS as readonly string[]).includes(value);
}

/**
 * The store key for a month: `"gre/01"`.
 *
 * Zero-padded so keys sort lexicographically in the order they are taught,
 * which is what `Object.keys` and every debug dump will show.
 */
export function monthKey(track: Track, ordinal: number): string {
  return `${track}/${String(ordinal).padStart(2, "0")}`;
}

export function keyOf(month: VocabMonth): string {
  return monthKey(month.track, month.ordinal);
}

/** Parse a `"gre/01"` key. Returns null for anything else, legacy keys included. */
export function parseMonthKey(
  key: string,
): { track: Track; ordinal: number } | null {
  const parts = key.split("/");
  if (parts.length !== 2) return null;
  const [track, rest] = parts;
  if (!isTrack(track)) return null;
  if (!/^\d{1,3}$/.test(rest)) return null;
  const ordinal = Number(rest);
  if (!Number.isInteger(ordinal) || ordinal < 1) return null;
  return { track, ordinal };
}

/**
 * A word id: `"gre-abstemious"`.
 *
 * Track-scoped and calendar-free. `sat-abate` and `gre-abate` are deliberately
 * different rows with independent progress — a student who met the word at
 * sixteen is not being cheated by meeting it again at twenty-two.
 */
export function wordId(track: Track, slug: string): string {
  return `${track}-${slug}`;
}

/** The track a word id belongs to, or null if it is a legacy (calendar) id. */
export function trackOfWordId(id: string): Track | null {
  const dash = id.indexOf("-");
  if (dash < 0) return null;
  const head = id.slice(0, dash);
  return isTrack(head) ? head : null;
}

/**
 * The track a month key names, however malformed the rest of it is.
 *
 * Deliberately looser than `parseMonthKey`: the migration parks retired words
 * under `"gre/retired"` when the month they came from no longer exists, and
 * that entry still has to be filed under the right track.
 */
export function trackOfKey(key: string): Track | null {
  const head = key.split("/")[0];
  return isTrack(head) ? head : null;
}

/**
 * Does this word id belong to the given track?
 *
 * A free consequence of ADR 0011's decision to put the track in the id: a
 * progress record can be filed to a track without looking up the word it
 * names. Selectors that aggregate progress — mastered counts, quiz accuracy,
 * the due count — all need this, and doing it by month lookup would mean
 * walking the corpus on every render.
 */
export function isInTrack(id: string, track: Track): boolean {
  return id.startsWith(`${track}-`);
}

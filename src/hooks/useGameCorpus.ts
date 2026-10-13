/**
 * The words a game tier draws from, read without being loaded.
 *
 * Tiers are thirds of a whole track, and most users have loaded a few months
 * of it. So this fetches the same month files the library does — but never
 * hands them to `loadMonth`. Playing a game must not add a month to anyone's
 * notebook or schedule, and must not spend the localStorage budget their
 * actual notebook needs: everything fetched here lives in memory for the
 * session and nowhere else.
 *
 * A month the user *has* loaded wins over the shipped file, so an edited copy
 * is what they play. "Mine" fetches nothing at all.
 *
 * See docs/GAMES.md §8.3.
 */

import { useEffect, useMemo, useState } from "react";
import type { Track, VocabMonth, VocabWord } from "@/types";
import { allWordsInMonth, parseVocabMonth } from "@/lib/vocabulary";
import { keyOf, monthKey } from "@/lib/track";
import { studiedWords, tierOrdinals } from "@/lib/games/pool";
import { buildRelationIndex, type RelationIndex, type RelationSource } from "@/lib/games/relations";
import { parseRelationsFile } from "@/lib/games/relations-file";
import type { Tier } from "@/lib/games/types";
import { useVocabStore } from "@/store/useVocabStore";
import { useProgressStore } from "@/store/useProgressStore";

export type GameCorpus =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      /** Words that may be asked about. */
      prompts: VocabWord[];
      /** Words that may supply wrong answers. */
      pool: VocabWord[];
      monthOf: Record<string, string>;
      index: RelationIndex;
    };

const BASE = import.meta.env.BASE_URL;

// Session caches. Promises, so two components asking at once share one fetch.
let libraryIndex: Promise<Array<{ track: Track; ordinal: number }>> | null = null;
let relations: Promise<RelationSource[]> | null = null;
const monthFiles = new Map<string, Promise<VocabMonth>>();

function fetchJson(path: string): Promise<unknown> {
  return fetch(`${BASE}${path}`).then((r) =>
    r.ok ? r.json() : Promise.reject(new Error(`${path}: ${r.status}`)),
  );
}

function getLibraryIndex() {
  libraryIndex ??= fetchJson("vocab/index.json").then(
    (data) => ((data as { months?: Array<{ track: Track; ordinal: number }> }).months ?? []),
  );
  // A failed fetch must not be cached forever: the next attempt should retry.
  libraryIndex.catch(() => (libraryIndex = null));
  return libraryIndex;
}

function getRelations() {
  // A missing graph degrades the guard to what the round's own words know; it
  // does not stop the game.
  relations ??= fetchJson("vocab/relations.json")
    .then(parseRelationsFile)
    .catch(() => []);
  return relations;
}

function getMonth(track: Track, ordinal: number): Promise<VocabMonth> {
  const key = monthKey(track, ordinal);
  let pending = monthFiles.get(key);
  if (!pending) {
    pending = fetchJson(`vocab/${track}/${String(ordinal).padStart(2, "0")}.json`).then((raw) =>
      parseVocabMonth(raw, { track }),
    );
    pending.catch(() => monthFiles.delete(key));
    monthFiles.set(key, pending);
  }
  return pending;
}

function wordsOf(months: readonly VocabMonth[]) {
  const words: VocabWord[] = [];
  const monthOf: Record<string, string> = {};
  for (const m of months) {
    for (const w of allWordsInMonth(m)) {
      words.push(w);
      monthOf[w.id] = keyOf(m);
    }
  }
  return { words, monthOf };
}

export function useGameCorpus(track: Track, tier: Tier | null): GameCorpus {
  const months = useVocabStore((s) => s.months);
  const progress = useProgressStore((s) => s.words);
  const [fetched, setFetched] = useState<
    | { key: string; months: VocabMonth[]; relations: RelationSource[] }
    | { key: string; error: string }
    | null
  >(null);

  const requestKey = tier ? `${track}:${tier}` : "";

  useEffect(() => {
    if (!tier) return;
    let cancelled = false;
    const key = `${track}:${tier}`;
    (async () => {
      try {
        const graph = await getRelations();
        if (tier === "mine") {
          if (!cancelled) setFetched({ key, months: [], relations: graph });
          return;
        }
        const listed = (await getLibraryIndex()).filter((m) => m.track === track);
        const ordinals = tierOrdinals(listed.map((m) => m.ordinal), tier);
        const loaded = useVocabStore.getState().months;
        const files = await Promise.all(
          ordinals.map((o) => loaded[monthKey(track, o)] ?? getMonth(track, o)),
        );
        if (!cancelled) setFetched({ key, months: files, relations: graph });
      } catch (e) {
        if (!cancelled) {
          setFetched({ key, error: e instanceof Error ? e.message : "Could not load the words." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [track, tier]);

  return useMemo<GameCorpus>(() => {
    if (!tier || !fetched || fetched.key !== requestKey) return { status: "loading" };
    if ("error" in fetched) return { status: "error", message: fetched.error };

    const loadedInTrack = Object.values(months).filter((m) => m.track === track);
    // Every word the user has loaded joins the graph too, so a card they
    // edited or imported guards the round as well as the shipped ones.
    const everyLoaded = wordsOf(Object.values(months)).words;

    if (tier === "mine") {
      const { words, monthOf } = wordsOf(loadedInTrack);
      return {
        status: "ready",
        prompts: studiedWords(words, progress),
        pool: words,
        monthOf,
        index: buildRelationIndex([...fetched.relations, ...everyLoaded]),
      };
    }

    // Loaded months replace their shipped copies, by key.
    const byKey = new Map(fetched.months.map((m) => [keyOf(m), m]));
    for (const m of loadedInTrack) if (byKey.has(keyOf(m))) byKey.set(keyOf(m), m);
    const { words, monthOf } = wordsOf([...byKey.values()]);
    return {
      status: "ready",
      prompts: words,
      pool: words,
      monthOf,
      index: buildRelationIndex([...fetched.relations, ...everyLoaded]),
    };
  }, [tier, fetched, requestKey, months, track, progress]);
}

/** How many words "Mine" could draw on for this track. Cheap; for the hub. */
export function useStudiedCount(track: Track): number {
  const months = useVocabStore((s) => s.months);
  const progress = useProgressStore((s) => s.words);
  return useMemo(() => {
    const inTrack = Object.values(months).filter((m) => m.track === track);
    return studiedWords(wordsOf(inTrack).words, progress).length;
  }, [months, progress, track]);
}

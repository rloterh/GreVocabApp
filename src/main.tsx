/**
 * Lexicon — entry point.
 *
 * Runs storage migrations, seeds bundled vocabulary on first launch, then
 * mounts the app. For project conventions see /CLAUDE.md and /CONTINUING.md.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/globals.css";
import { runMigrations } from "./lib/migrations";

// Migrations rewrite persisted state in place and must finish before a single
// store hydrates — the tracks migration builds an id map from the vocabulary
// and applies it to progress, and zustand hydrates stores at import time, in
// no defined order. Hence the dynamic imports below: nothing that touches
// localStorage may be a static import of this module.
const migrations = runMigrations();

/**
 * The two starter months each track opens with.
 *
 * Bundled rather than fetched so that switching tracks is instant: the words
 * are already in the store before the user touches the control. The cost is a
 * one-time parse on first run, after which they are in local storage.
 *
 * `src/data/` is *generated* from `public/vocab/` by
 * `scripts/sync-starters.mjs`, which the corpus audit checks. The corpus is
 * the single source of truth; these are a derived copy that exists only to
 * avoid a fetch at bootstrap. Do not edit them by hand.
 */
/** The teaching positions each track's bundle covers. */
const STARTER_ORDINALS = [1, 2] as const;

const STARTERS = {
  gre: () =>
    Promise.all([import("./data/gre-01.json"), import("./data/gre-02.json")]),
  sat: () =>
    Promise.all([import("./data/sat-01.json"), import("./data/sat-02.json")]),
} as const;

async function bootstrap() {
  const { useVocabStore } = await import("./store/useVocabStore");
  const { useSettingsStore } = await import("./store/useSettingsStore");
  const { TRACKS } = await import("./lib/track");

  // Per track, not "is the store empty".
  //
  // The old guard seeded only when the whole store was empty, which meant SAT
  // was never seeded for anyone — and could never be seeded for an existing
  // user, because their GRE months kept the store non-empty forever. Switching
  // to SAT landed on an empty notebook and a trip to the library.
  //
  // `seededTracks` records what has been done, so a user who deliberately
  // unloads a track does not find it back on the next launch.
  const seeded = new Set(useSettingsStore.getState().seededTracks);
  const before = seeded.size;
  let seededActive = false;

  for (const track of TRACKS) {
    const store = useVocabStore.getState();
    const hasAny = Object.values(store.months).some((m) => m.track === track);
    if (hasAny || seeded.has(track)) continue;

    const [{ default: one }, { default: two }] = await STARTERS[track]();
    store.loadMonth(one);
    store.loadMonth(two);
    seeded.add(track);
    if (track === store.activeTrack) seededActive = true;
  }

  if (seeded.size !== before) {
    useSettingsStore.getState().set({ seededTracks: [...seeded] });
  }

  // Months loaded before the corpus gained synonyms keep the copy they were
  // loaded with, and the library will not re-offer a month that is already
  // loaded — so without this, a long-time user sees no synonyms on exactly the
  // months they use most while a new user sees them everywhere.
  //
  // Gated on finding a gap first, so the ordinary case never parses the
  // bundled JSON at all. Fills only what is missing: words the user added
  // survive, and anything already there is left alone. See
  // src/lib/backfill-relations.ts.
  await backfillStarters();


  // Only when the track the user is *looking at* was just seeded. An existing
  // user picking up SAT for the first time should not have the GRE month they
  // were on quietly reset to today's.
  if (seededActive) {
    // Open on whatever the schedule says is current rather than on month one.
    const now = new Date();
    const key = useVocabStore.getState().monthKeyForDate(now);
    if (key) {
      useVocabStore.getState().setActiveMonth(key);
      if (useVocabStore.getState().hasDayInMonth(key, now.getDate())) {
        useVocabStore.getState().setSelectedDay(now.getDate());
      }
    }
  }

  return import("./App");
}

/**
 * Top up the bundled starter months in place.
 *
 * Separate from seeding because it applies to months that are *already* there:
 * seeding is for a track with nothing in it, this is for a track whose content
 * is simply older than the bundle.
 */
async function backfillStarters() {
  const { useVocabStore } = await import("./store/useVocabStore");
  const { backfillRelations, needsRelations } = await import(
    "./lib/backfill-relations"
  );
  const { monthKey } = await import("./lib/track");
  const { TRACKS } = await import("./lib/track");

  for (const track of TRACKS) {
    const stale = STARTER_ORDINALS.map((ordinal) => ({
      ordinal,
      key: monthKey(track, ordinal),
    })).filter(({ key }) => {
      const month = useVocabStore.getState().months[key];
      return month && needsRelations(month);
    });
    if (stale.length === 0) continue;

    const loaded = await STARTERS[track]();
    let filledTotal = 0;
    for (const { ordinal, key } of stale) {
      const source = loaded.find((m) => m.default.ordinal === ordinal)?.default;
      const stored = useVocabStore.getState().months[key];
      if (!source || !stored) continue;
      const { month, filled } = backfillRelations(stored, source);
      if (filled === 0) continue;
      useVocabStore.getState().loadMonth(month, { track, ordinal });
      filledTotal += filled;
    }
    if (filledTotal > 0) {
      console.info(
        `[lexicon] filled synonyms on ${filledTotal} ${track.toUpperCase()} words ` +
          "from the bundled corpus",
      );
    }
  }
}

bootstrap().then(({ App }) => {
  const migrated = migrations.find((m) => m.ran);
  if (migrated) {
    // Worth saying out loud once. A migration that rewrote ids and left
    // orphans behind has lost somebody's progress, and the console is the
    // only place that evidence exists before a bug report does.
    console.info(
      `[lexicon] migrated ${migrated.monthsMigrated} months, ` +
        `${migrated.wordsRenamed} words, ` +
        `${migrated.progressRecordsRewritten} progress records` +
        (migrated.orphans.length > 0
          ? ` — ${migrated.orphans.length} orphaned: ${migrated.orphans.slice(0, 5).join(", ")}`
          : ""),
    );
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});

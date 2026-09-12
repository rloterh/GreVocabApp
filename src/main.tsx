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

async function bootstrap() {
  const { useVocabStore } = await import("./store/useVocabStore");

  const state = useVocabStore.getState();
  if (Object.keys(state.months).length === 0) {
    const [{ default: seedOne }, { default: seedTwo }] = await Promise.all([
      import("./data/gre-01.json"),
      import("./data/gre-02.json"),
    ]);
    state.loadMonth(seedOne);
    state.loadMonth(seedTwo);

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

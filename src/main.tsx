/**
 * Lexicon — entry point.
 *
 * Bootstraps the app and seeds bundled vocabulary on first launch.
 * For project conventions see /CLAUDE.md and /CONTINUING.md.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/globals.css";
import { useVocabStore } from "./store/useVocabStore";

// Seed data — load bundled sample months on first launch
import seedApril from "./data/2026-04.json";
import seedMay from "./data/2026-05.json";

async function bootstrap() {
  // Only seed if nothing loaded yet
  const state = useVocabStore.getState();
  if (Object.keys(state.months).length === 0) {
    state.loadMonth(seedApril);
    state.loadMonth(seedMay);
    // Set active month to something reasonable
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    if (state.hasMonthKey(key)) {
      state.setActiveMonth(key);
      state.setSelectedDay(now.getDate());
    }
  }
}

bootstrap().finally(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});

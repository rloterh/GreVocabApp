# Roadmap

Living document. If you disagree with a priority or a phase boundary, edit this file *first*, then build.

Format for every task: `[priority] short description — one-line why. → acceptance criteria.`

Priorities:
- **P0** — must, blocks the phase
- **P1** — should, high value
- **P2** — nice-to-have, do if easy

## Where we are

**Phase 1: Foundation — SHIPPED (v0.1.0)**

Full working app with dashboard, daily practice, flashcards (3D flip + Anki-style rating + swipe + confetti), quiz mode, sentence builder with AI/heuristic verification, calendar, archive, progress with heatmap and charts, search, settings with backup/restore, theming, seed data (April + May 2026, 180 words), Tauri v2 desktop wrapper, CI.

See [`CHANGELOG.md`](./CHANGELOG.md) for the shipped feature list.

## Next up (start here)

If you have an hour: pick a **P1** from Phase 2.
If you have an afternoon: a real content-import path.
If you have a weekend: content import + the desktop story.

**Phase 2 is complete.** Next:

1. **Real Tauri file-watching** (Phase 4, P0 for desktop story)
2. **Anki `.apkg` export** (Phase 3, P1) — low effort, high delight
3. **A test runner** — unphased, but `src/lib/sm2.ts` is the most logic-dense
   file in the repo and nothing guards it. See the Phase 2 caveat below.

## Phase 2 — Learning quality

**Goal.** Make the app measurably better at getting words into long-term memory. Right now progress is binary (mastered / not). SM-2 gives us actual scheduling.

**Why it matters.** Vocab retention degrades without spaced review. Without SRS, the app is a pretty flashcard viewer, not a learning tool.

### Tasks

- ~~**[P0] Implement SM-2 scheduler.**~~ **DONE.** `src/lib/sm2.ts`. Shipped signature is `schedule(rating, priorEF, priorInterval, priorReps, now?)` returning `{ easeFactor, intervalDays, reps, dueAt }` — the return keys were renamed from the sketch above to match the `WordProgress` field names exactly, so the store can spread the result, and `reps` was added because the caller cannot recompute it without duplicating the algorithm's branching. `now` is injected so scheduling is deterministic under test.
- ~~**[P0] "Due today" deck.**~~ **DONE.** `StudyDeck` variant `"due"`; Flashcards opens on it when anything is due (decided once per mount, so it never overrides a user's later choice). The Dashboard count is a call-to-action card that appears only when something is due, rather than a fifth stat tile — the stat grid is a 4-column layout and a lone fifth cell wrapped badly.
- ~~**[P1] SRS onboarding hint.**~~ **DONE.** `hasSeenSrsIntro` in `useSettingsStore`. Shipped as a dismissible callout directly above the rating row rather than a hover tooltip — a tooltip is unreachable on touch, and "seen once" needs a deliberate dismissal to persist honestly.
- ~~**[P1] Per-word progress detail.**~~ **DONE.** `src/components/WordDetail.tsx`, a Radix Dialog showing card content, mastery and quiz tallies, live SM-2 state (ease, interval, reps, next due in plain words) and real review history reconstructed from stored study sessions. Wired into Search. **Not wired into Archive:** Archive lists months, not words, so there is nothing there to click — giving it a word list is a redesign, not a hook-up.
- ~~**[P2] Study reminders.**~~ **DONE, with a real limit.** `src/hooks/useStudyReminder.ts` plus a Settings toggle and time picker. It uses the web Notification API and therefore **only fires while Lexicon is open**. Reaching a user with the app closed needs a service worker (web) or `tauri-plugin-notification` and Rust-side capability changes (desktop) — see Phase 4. The once-a-day guard is persisted as `lastReminderDate`, so a reload cannot double-notify.

### Definition of done

- ~~Rating a card updates EF and interval per SM-2.~~ Done.
- ~~Dashboard shows accurate "due today" count.~~ Done.
- ~~A user who studies for 5 days sees exponentially spaced reviews for words they consistently rate "Good" or "Easy".~~ Done — consecutive "Good" yields intervals of 1, 6, 15, 38, 95, 238 days; consecutive "Easy" yields 1, 6, 17, 49, 147, 456.

**Caveat:** the scheduler is pure and was verified against SM-2 reference values with a throwaway harness, but the repo still has no test runner, so nothing guards it in CI. Adding Vitest is the obvious next move.

## Phase 3 — Content flow

**Goal.** Reduce friction to bring vocab in and take work out.

**Why it matters.** The one-JSON-per-month format is fine for hand-authored decks but painful for existing content sources. Anki is the interoperability layer of the vocab world.

### Tasks

- ~~**[P1] CSV import.**~~ **DONE.** `src/lib/csv.ts`, hand-parsed — the grammar is small and well specified, and PapaParse would ship in every bundle to serve one button. CSV is accepted everywhere JSON is (file input and both folder pickers), with forgiving header aliases and per-line error messages. It produces month-shaped objects fed to the existing `parseVocabMonth`, so there is one definition of a valid month.
- ~~**[P1] Anki `.apkg` export.**~~ **DONE.** `src/lib/anki-collection.ts` builds the schema-11 SQLite database, `src/lib/anki-export.ts` owns the lazy loading and zipping. `sql.js` and `fflate` are dynamically imported and confirmed absent from the main bundle. SM-2 state carries across, so reviewed words land in Anki already scheduled — that is what satisfies "leave Lexicon with progress intact" below.
- ~~**[P1] "Generate vocabulary" via API.**~~ **DONE.** `src/lib/generate.ts` plus a dialog in Archive. Output is constrained with a strict tool schema rather than parsed out of prose, and the result goes through `parseVocabMonth` like any import — generated content is not trusted more than a supplied file.
- **[P2] Deck-file drag-and-drop overlay.** — Dropping a `.json` anywhere in the app triggers import. → Global drop handler in `App.tsx`.
- **[P2] Markdown export of progress.** — For sharing a study log. Nice-to-have.

### Definition of done

- User with 200 Anki cards can bring them into Lexicon in under 5 minutes.
- User can leave Lexicon with their progress intact via export.

## Phase 4 — Multi-device & desktop parity

**Goal.** The Tauri build isn't just "web app in a window." It has features the web can't do.

**Why it matters.** If desktop and web are functionally identical, there's no reason to build Tauri.

### Tasks

- **[P0] Real file-watching.** — Point at a folder; new JSON files appear in the app without re-import. → Add `notify` crate to `src-tauri/Cargo.toml`, emit events to frontend, listen with `@tauri-apps/api/event`. Settings gains a "Watched folder" path.
- **[P0] Native app icons.** — Currently placeholder SVG. → Design a 1024×1024 source, run `npm run tauri icon`. See `src-tauri/icons/README.md`.
- **[P1] Global shortcut to launch Flashcards.** — e.g. `Cmd+Shift+L` opens the app and drops straight into a due-today session. → `tauri-plugin-global-shortcut`.
- **[P1] System tray icon.** — Quick-access on desktop. → `tauri-plugin-tray`.
- **[P2] Mobile build.** — Tauri v2 supports iOS/Android. Layout needs review before this is real. → Separate mobile-specific navigation (bottom bar, not sidebar).

### Definition of done

- Dropping a JSON into a watched folder loads it in <2 seconds without a refresh.
- Desktop app has a real icon in the dock/taskbar.

## Phase 5 — Polish, community, sharing

**Goal.** Make the app something you'd tell someone about.

### Tasks

- **[P1] Global keyboard shortcuts everywhere.** — Not just Flashcards. `/` to open Search from anywhere, `g d` for Dashboard, etc. → New `src/hooks/useShortcuts.ts`.
- **[P1] Onboarding tour.** — First-run walkthrough. Skippable. → Use `useSettingsStore` for `hasOnboarded`.
- **[P1] Public deck sharing.** — Copy a deck to clipboard as a URL-safe blob; paste to import. → `src/lib/share.ts` — base64-encoded zstd or lz-string.
- **[P2] Themes beyond light/dark.** — Solarized, high-contrast, sepia. → Extend `Settings.theme` union and swap CSS-var sets in `globals.css`.
- **[P2] Sound effects.** — Subtle click on flip, satisfying ding on session complete. Opt-in in Settings.
- **[P2] Confetti variants.** — Emoji rain for perfect runs, streamers for personal bests.

### Definition of done

- A friend can install the app, complete a session, and get to their second day without confusion.
- Someone can share a deck link on Twitter and the recipient can import it in one click.

## Explicitly not planned

- **Cloud sync as a first-party feature.** — Users can export/import; that's enough. If cloud sync happens, it's via a pluggable adapter (Dropbox, iCloud file), never a Lexicon-owned backend.
- **User accounts.** — Same reason.
- **Gamification beyond streaks.** — No XP bars, no levels, no leagues. Streaks + heatmap are enough.
- **Payment / freemium.** — MIT, forever.

## Ideas parking lot

Things that don't have a phase yet. Move up when they do.

- OCR-import from photos of vocabulary lists
- Voice-first study mode (say the definition, get told the word)
- Reading-mode: paste an article, get vocabulary suggestions
- Etymology drill-down (integrate an offline Wiktionary dump?)

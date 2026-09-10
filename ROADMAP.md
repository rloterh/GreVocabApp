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

If you have an hour: pick a **P0** from Phase 2.
If you have an afternoon: knock out the SRS scheduler.
If you have a weekend: SRS + a real content-import path.

1. **SM-2 spaced repetition** (Phase 2, P0)
2. **Real Tauri file-watching** (Phase 4, P0 for desktop story)
3. **Anki `.apkg` export** (Phase 3, P1) — low effort, high delight

## Phase 2 — Learning quality

**Goal.** Make the app measurably better at getting words into long-term memory. Right now progress is binary (mastered / not). SM-2 gives us actual scheduling.

**Why it matters.** Vocab retention degrades without spaced review. Without SRS, the app is a pretty flashcard viewer, not a learning tool.

### Tasks

- **[P0] Implement SM-2 scheduler.** — Standard SuperMemo 2 algorithm. → New `src/lib/sm2.ts` exporting `schedule(rating, priorEF, priorInterval, priorReps): { ef, interval, dueDate }`. `WordProgress` gains `easeFactor`, `intervalDays`, `reps`, `dueAt` fields. `Flashcards.tsx` `applyStudyRating` calls the scheduler. Unit-testable in isolation.
- **[P0] "Due today" deck.** — Surface the words the scheduler says are due. → New `StudyDeck` variant `"due"`. Dashboard shows a count; Flashcards defaults to this deck when it has any cards.
- **[P1] SRS onboarding hint.** — First time a user opens Flashcards after this ships, explain the four rating buttons in a one-time tooltip. → State stored under `useSettingsStore` as `hasSeenSrsIntro`.
- **[P1] Per-word progress detail.** — Click a word in Search or Archive → modal showing review history, current EF, next due date. → New `WordDetail.tsx` component; opens as a Radix Dialog.
- **[P2] Study reminders.** — Optional daily nudge (browser Notification API in web, Tauri notifications on desktop). → Settings toggle + time picker. Skip if the runtime doesn't have permission.

### Definition of done

- Rating a card updates EF and interval per SM-2.
- Dashboard shows accurate "due today" count.
- A user who studies for 5 days sees exponentially spaced reviews for words they consistently rate "Good" or "Easy".

## Phase 3 — Content flow

**Goal.** Reduce friction to bring vocab in and take work out.

**Why it matters.** The one-JSON-per-month format is fine for hand-authored decks but painful for existing content sources. Anki is the interoperability layer of the vocab world.

### Tasks

- **[P1] CSV import.** — Accept a CSV with columns `word,partOfSpeech,definition,example,mnemonic,day`. → New tab in `JsonImporter.tsx` for CSV; use PapaParse (already common) or hand-parse — dependency choice at implementation time.
- **[P1] Anki `.apkg` export.** — One deck per month, or one deck for everything. → `src/lib/anki-export.ts`. Anki packages are SQLite + zip; use `sql.js` in browser (adds ~500KB but only when triggered).
- **[P1] "Generate vocabulary" via API.** — Given a topic and count, Claude produces a month's worth. → Reuses the API key already in Settings. New page or new tab in Archive.
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

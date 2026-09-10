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

**Phases 1-5 are complete**, except one item. What is left:

1. **Mobile build** (Phase 4, P2) — the only unfinished roadmap task. Needs the
   Android SDK/NDK or Xcode, and a bottom-bar navigation rather than the
   sidebar. Nothing here is blocking it except tooling and a layout decision.
2. **See it actually run.** Everything below is verified by lint, typecheck,
   283 unit tests, a production build and `cargo check`/`cargo test` — but no
   part of the UI has been exercised in a browser, and the desktop shell
   (watcher, tray, global shortcut) has never been observed running. That is
   the honest gap in all of it.
3. **Page-level component tests.** `src/lib/`, the stores, and the two
   components with real logic are covered. The pages are composition and are
   not.

Ideas beyond the roadmap are in the parking lot at the bottom.

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

~~**Caveat:** ... no test runner ...~~ Resolved. The scheduler is covered by `src/lib/sm2.test.ts`, which runs in CI.

## Phase 3 — Content flow

**Goal.** Reduce friction to bring vocab in and take work out.

**Why it matters.** The one-JSON-per-month format is fine for hand-authored decks but painful for existing content sources. Anki is the interoperability layer of the vocab world.

### Tasks

- ~~**[P1] CSV import.**~~ **DONE.** `src/lib/csv.ts`, hand-parsed — the grammar is small and well specified, and PapaParse would ship in every bundle to serve one button. CSV is accepted everywhere JSON is (file input and both folder pickers), with forgiving header aliases and per-line error messages. It produces month-shaped objects fed to the existing `parseVocabMonth`, so there is one definition of a valid month.
- ~~**[P1] Anki `.apkg` export.**~~ **DONE.** `src/lib/anki-collection.ts` builds the schema-11 SQLite database, `src/lib/anki-export.ts` owns the lazy loading and zipping. `sql.js` and `fflate` are dynamically imported and confirmed absent from the main bundle. SM-2 state carries across, so reviewed words land in Anki already scheduled — that is what satisfies "leave Lexicon with progress intact" below.
- ~~**[P1] "Generate vocabulary" via API.**~~ **DONE.** `src/lib/generate.ts` plus a dialog in Archive. Output is constrained with a strict tool schema rather than parsed out of prose, and the result goes through `parseVocabMonth` like any import — generated content is not trusted more than a supplied file.
- ~~**[P2] Deck-file drag-and-drop overlay.**~~ **DONE.** `src/components/DropOverlay.tsx`, mounted at the root. Accepts `.csv` as well as `.json`. The drag counter is reference-counted because dragenter/dragleave fire per element and the overlay would otherwise flicker over every child.
- ~~**[P2] Markdown export of progress.**~~ **DONE.** `src/lib/markdown-export.ts` — pure and clock-injectable. Summary, per-month breakdown, due list with interval and ease, and the last 30 active days. Empty sections are omitted rather than rendered as empty tables.

**Phase 3 is complete.** The import paths were also unified in the process: `src/lib/import.ts` is now the one place a file becomes months, shared by the button, both folder pickers and the drop overlay.

### Definition of done

- ~~User with 200 Anki cards can bring them into Lexicon in under 5 minutes.~~
  Done. Both paths work: CSV (which Anki exports natively) and `.apkg` directly,
  by drop or by picker. `.apkg` import does not carry scheduling — see
  `src/lib/anki-import.ts` for why.
- ~~User can leave Lexicon with their progress intact via export.~~ Done, and
  more literally than the line implies: Anki export carries SM-2 interval, ease
  and repetition count, so progress survives the move rather than just the
  words.

## Phase 4 — Multi-device & desktop parity

**Goal.** The Tauri build isn't just "web app in a window." It has features the web can't do.

**Why it matters.** If desktop and web are functionally identical, there's no reason to build Tauri.

### Tasks

- ~~**[P0] Real file-watching.**~~ **DONE.** `src-tauri/src/watcher.rs` on the `notify` crate, `src/hooks/useWatchedFolder.ts` on the frontend. Debounced at 400ms because editors write a file several times per save; only `.json`/`.csv`/`.apkg` are reported.
- ~~**[P0] Native app icons.**~~ **DONE.** `scripts/make-icon.mjs` draws the mark to a 1024×1024 PNG with no dependencies, then `npm run tauri icon`. Regenerate rather than hand-editing the output. This was blocking everything: `tauri-build` refuses to compile without `icons/icon.ico`.
- ~~**[P1] Global shortcut to launch Flashcards.**~~ **DONE.** `Ctrl/Cmd+Shift+L`, in `src-tauri/src/desktop.rs`. Registration failure is non-fatal — another app may own the binding.
- ~~**[P1] System tray icon.**~~ **DONE.** Same file. Tauri v2 has tray built in behind the `tray-icon` feature; there is no `tauri-plugin-tray`.
- **[P2] Mobile build.** — Still open, and now the only Phase 4 item that is. It needs the Android SDK/NDK or Xcode, neither of which was available. Layout also needs a bottom bar rather than the sidebar before this is real.

### Definition of done

- ~~Dropping a JSON into a watched folder loads it in <2 seconds without a refresh.~~ Implemented. **Not observed running** — verifying it needs `npm run tauri dev`, which opens a desktop window this environment could not interact with. The Rust compiles and is unit-tested; the end-to-end path is not.
- ~~Desktop app has a real icon in the dock/taskbar.~~ Done.

## Phase 5 — Polish, community, sharing

**Goal.** Make the app something you'd tell someone about.

### Tasks

- ~~**[P1] Global keyboard shortcuts everywhere.**~~ **DONE.** `src/lib/shortcuts.ts` holds the matching (pure, so the two-key sequences are testable without a DOM); `src/hooks/useShortcuts.ts` binds it. `/` for search, `?` for the help overlay, `g` then a letter for each page. Never fires while typing in a field.
- ~~**[P1] Onboarding tour.**~~ **DONE.** `src/components/Onboarding.tsx`, four screens, skippable at every step, tracked as `hasOnboarded`. Settings can replay it.
- ~~**[P1] Public deck sharing.**~~ **DONE.** `src/lib/share.ts`, using the platform's own `CompressionStream("gzip")` rather than lz-string — one less dependency. Codes are prefixed `lex1:` and base64url, so they survive a URL or a chat message. A pasted deck goes through `loadMonth` like a file: it is the least trustworthy input the app takes.
- ~~**[P2] Themes beyond light/dark.**~~ **DONE.** Sepia, Solarized Dark and a high-contrast palette, as token blocks in `globals.css`. `src/lib/theme.ts` is the single place that knows which class goes on the root — the logic used to be duplicated between `App.tsx` and `Settings.tsx`.
- ~~**[P2] Sound effects.**~~ **DONE.** `src/lib/sound.ts`, synthesised with Web Audio rather than shipped as files. Off by default.
- ~~**[P2] Confetti variants.**~~ **DONE.** Emoji rain for a perfect run, streamers for a personal best, ordinary confetti otherwise.

### Definition of done

- ~~A friend can install the app, complete a session, and get to their second day without confusion.~~ The onboarding tour and the shortcut overlay are in. Whether it is actually confusing is a question for a real person, not a test.
- ~~Someone can share a deck link on Twitter and the recipient can import it in one click.~~ Done, with a caveat: a code is a paste, not a link. A deck of 90 words encodes to a few thousand characters, which is fine for a message or a gist but too long for a tweet. Turning it into a real link needs somewhere to host it, and hosting is explicitly not planned.

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

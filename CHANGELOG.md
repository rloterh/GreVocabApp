# Changelog

Format: [Keep a Changelog](https://keepachangelog.com). Versioning: [SemVer](https://semver.org).

## [Unreleased]

### Added
- **SM-2 spaced repetition** (`src/lib/sm2.ts`) — rating a flashcard now
  schedules its next review. `WordProgress` carries `easeFactor`,
  `intervalDays`, `reps` and `dueAt`; all four are optional, so progress saved
  before this release keeps working and picks up scheduling on its next rating.
- **"Due today" deck** — a `due` deck in Flashcards, selected automatically on
  open when anything is due, plus a Dashboard card showing the count with a
  jump straight into review.
- **SRS onboarding hint** — a one-time, dismissible explainer above the rating
  buttons covering what each rating does to the schedule. Tracked as
  `hasSeenSrsIntro`.
- **Per-word detail modal** (`src/components/WordDetail.tsx`) — click any
  Search result for definition, mnemonic, mastery and quiz tallies, live SM-2
  state (ease, interval, reps, next due) and the word's real review history.
- **Optional daily study reminder** — Settings toggle and time picker, using
  the web Notification API. Fires at most once a day, and only while the app is
  open; permission is requested when you switch it on and reminders stay off if
  it is refused.

- **CSV vocabulary import** — CSV is accepted anywhere JSON is, with forgiving
  header names and per-line error messages. Hand-rolled parser, no new
  dependency. See the README for the column list.
- **Anki `.apkg` export** — Settings can write every loaded month to an Anki
  deck, one deck per month or a single deck. SM-2 state travels with the
  cards, so reviewed words arrive already scheduled rather than reset to new.
  `sql.js` and `fflate` are dynamically imported and add nothing to the main
  bundle.

- **Generate vocabulary with Claude** — Archive can produce a month from a
  topic and a word count using the Anthropic key already in Settings. Output is
  schema-constrained and validated like any import.

- **Anki `.apkg` import** — read an existing Anki deck into Lexicon. Fields are
  matched by name with a positional fallback; HTML and media references are
  stripped; notes with no word or meaning are skipped and counted.
- **Drag and drop import** — drop a `.json`, `.csv` or `.apkg` anywhere in the
  app. Shares one import path with the button and both folder pickers.
- **Markdown study log export** — Settings → Backup writes totals, streaks, a
  per-month breakdown, what is due, and recent activity.
- **Tests** — Vitest over `src/lib/`, the Zustand stores and components,
  running in CI ahead of the build.

- **Desktop: folder watching** — point Lexicon at a folder and dropped files
  load without a refresh (`notify` crate + a frontend listener).
- **Desktop: real app icons**, generated from the mark by `scripts/make-icon.mjs`.
- **Desktop: system tray and a global shortcut** (`Ctrl/Cmd+Shift+L`) that jump
  straight into a study session.
- **Global keyboard shortcuts** — `/` for search, `?` for the shortcut list,
  `g` then a letter to move between pages.
- **First-run walkthrough**, skippable, replayable from Settings.
- **Deck sharing** — copy a month as a `lex1:` code and paste it anywhere.
- **Three more themes** — sepia, Solarized Dark, high contrast.
- **Optional interface sounds**, synthesised rather than shipped as files.
- **Confetti variants** — emoji for a perfect run, streamers for a personal best.

### Changed
- Bumped vite 5.4 → 6.4.3 to move onto patched esbuild (GHSA-67mh-4wv8-2f99).
  `npm audit` is now clean.
- `npm run lint` passes and runs in CI, alongside typecheck and build.

- **Generate vocabulary with no API key at all.** "Generate elsewhere" copies a
  ready-made prompt you can paste into any AI you already use — then paste the
  reply back and it loads like any file. Commentary and code fences are ignored.
- **Desktop: use an AI tool you already have.** If Claude Code, Codex or the
  Gemini CLI is installed and signed in, switch it on in Settings and Lexicon
  will use it — no API key. Lexicon never reads their credentials; it runs the
  tool and the tool authenticates itself.
- **Desktop: local model servers just work.** Requests go through Rust, so
  Ollama and LM Studio are reachable without setting `OLLAMA_ORIGINS`.
- **Any AI provider, not just Anthropic.** Local servers (Ollama, LM Studio,
  llama.cpp), OpenAI, Groq, OpenRouter, or any OpenAI-compatible endpoint. The
  app picks whichever is cheapest for you — on-device first — and names the one
  it used.
- **Sentence checking works with a local model**, which means your own sentences
  no longer have to leave your machine.

### Security
- **Backup exports no longer contain your API key.** `exportData()` serialised
  the whole settings object, key included, into a file the app tells you to keep
  — and people keep backups in cloud drives and email. Credentials now live in a
  separate `Secrets` type that the export strips by construction. Restoring an
  older backup drops any key it carried and says so.

### Fixed
- **Sentence verification read the wrong content block.** It took
  `content[0].text`, so any response that led with another block fell silently
  back to the heuristic. It now finds the text block, and a regression test
  covers it. The model moved to a current one, with effort set instead of a
  token budget.

- Production build was broken: `vite.config.ts` had no Node types and a
  `build.minify` ternary that widened to `string`. `npm run typecheck` missed
  both because it only compiles `src/`.
- The Tauri and File System Access import paths counted failed files and then
  discarded the count, so partial import failures were silent.
- `SentenceBuilder` reset its draft from inside a `useMemo` with an incomplete
  dependency list; `Quiz` rebuilt a memo dependency on every render.

## [0.1.0] — 2026-09-09

Initial release.

### Added
- **Dashboard** with greeting, today's words, current/longest streak, quiz accuracy, mastery ratio, overall progress
- **Daily Practice** with reveal-style flashcards, keyboard-friendly day navigation, per-day mastery progress
- **Flashcards** — full-screen study mode with 3D flip, Anki-style ratings (Again/Hard/Good/Easy), keyboard shortcuts (Space + 1-4), swipe support, session streak counter, live timer, pause overlay, confetti-on-finish results screen, deck picker (day / month / mastered / still-learning / all)
- **Quiz** with three modes (word→def, def→word, mixed) and three pools
- **Sentence Builder** with per-sentence feedback via Anthropic API (opt-in with own key) or local heuristic fallback
- **Calendar** with custom picker; unselectable days for months without vocab
- **Archive** listing every loaded month
- **Progress** with year heatmap and month/quarter/year bar chart
- **Search** across word, definition, mnemonic, example — highlighted matches
- **Settings** with theme (light/dark/system), API key management, backup export/restore, reset actions
- **Seed vocabulary** — April 2026 and May 2026, 3 words × 30 days × 2 months (180 words total, no cross-month overlap)
- **Tauri v2 desktop wrapper** with fs, dialog, and shell plugins
- **CI workflow** running typecheck and build on push/PR

### Docs
- README with feature list, install steps, JSON format, project map
- CONTINUING.md handoff for future contributors and AI sessions
- CLAUDE.md, AGENTS.md, .cursor/rules/main.mdc, .github/copilot-instructions.md for AI tool auto-discovery
- ROADMAP.md with phased plan and acceptance criteria

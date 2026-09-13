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

## [1.1.0] — 2026-09-13

Two exams, and content that no longer has a calendar baked into it.

### Added

- **GRE and SAT tracks.** Two separate vocabularies, switched from a control
  visible on every screen at every width. Separate content, separate schedules,
  separate progress; **one** streak, because a day studied is a day studied and
  splitting it would punish exactly the behaviour the app should encourage.
- **Three years of SAT vocabulary** — 2,416 words across 36 months, with its
  own difficulty bands (core academic → argument and evidence → advanced
  literary and scientific) and its own themes, drawn from what the test reads.
  Both corpora now ship as defaults: 72 months, 5,241 words, fetched only when
  asked for.
- **A start date.** First run asks which month you begin in and lays the track
  out from there. Both answers arrive pre-selected and Skip accepts them, so
  the screen is one tap from done.
- **Reordering and reshuffling.** Months can run as taught or shuffled, freely
  and reversibly. Words can be redistributed across the months — which keeps
  every review you have ever done, and is honest that it does not undo.
- **Flashcard edge arrows.** 44px controls just outside the card, hidden at
  rest and revealed on hover, focus or tap. Disabled rather than removed at the
  ends, so the other one never moves.
- **A navigation rail** between the phone tab bar and the desktop sidebar, from
  720px to 1024px, carrying all ten destinations with labels.
- **An app icon**, drawn as SVG and rasterised for every desktop, iOS and
  Android size.
- `scripts/rebalance-corpus.ts`, and browser drivers for tracks, the schedule,
  flashcard navigation, tablets and the README screenshots.

### Changed

- **Word ids no longer contain a date.** `gre-abstemious`, not
  `2026-04-abstemious`. This is the change everything else rests on: an id that
  names a month changes whenever the word moves, and moving words is exactly
  what start dates and reshuffling do.
- **Months are teaching positions, not dates** — keyed `gre/01` … `gre/36`,
  with a per-track schedule mapping them onto the calendar. Two users starting
  a year apart share the corpus files byte for byte.
- **Swiping a flashcard now navigates instead of rating it.** It used to write
  "again" on a drag left and "good" on a drag right at a fixed 120px, so on a
  360px phone a 121-pixel drag recorded a permanent judgement with nothing on
  screen to say what had been recorded. Rating keeps its four buttons and the
  keys `1`–`4`.
- **Small and tablet screens are fullscreen** — full-bleed content below `lg`,
  `100dvh` so a phone's address bar stops covering the last rows, and
  `viewport-fit=cover` with safe areas on all four edges. Reading pages still
  cap their line length at every width.
- The shell breakpoint moved from Tailwind's `md` (768px) to a named `rail`
  breakpoint at **720px**, chosen because the iPad mini is 744px wide: the
  default left the smallest iPad on the phone layout.
- Vocabulary files carry `track`, `ordinal` and `title` instead of `month` and
  `displayName`. Files in the old shape still import.
- `generate-corpus.ts`, `repair-corpus.ts` and `audit-corpus.ts` all take a
  track. Uniqueness is enforced within a track and deliberately not across
  them; the audit reports the overlap (59%) as information.

### Fixed

- **The dashboard and progress page counted every progress record, not the
  open track's.** Switching to an empty SAT showed a user their GRE mastery
  under an SAT heading.
- **The progress store had no schema version**, so once the migration stamped
  one on its blob, zustand decided the data came from a future it could not
  read and discarded every record. Storage was correct and the running app was
  empty. Twenty-three unit tests missed it because none of them hydrate a
  store; a browser caught it on the first run.
- Both copies of the track switcher shared one Framer `layoutId`, so the active
  pill animated into whichever copy was `display: none`.
- `containsWord` reported `belie` as missing from "Her calm voice belied the
  panic" — the stemmer maps `belied` to `bely` and `belie` to `beli`, which
  differ in the last character, so no shared-prefix test could bridge them.
  The whole `-ie/-ied` family was affected.
- Four-across stat cards on a tablet: "Words mastered" wraps where its
  neighbours do not, which made that card taller and left its number off the
  line the other three sat on.

### Migration

Existing installs migrate on first launch, before any store hydrates — the id
map is built from the vocabulary and needed by progress, and zustand hydrates
stores in no defined order. It is idempotent and fails closed: any error leaves
every blob exactly as it was.

The acceptance test, asserted in unit tests and again in a browser: **a store
taken before the migration, read after it, shows the same words on the same
days with the same progress.** Including for a user whose months had gaps —
April and September with nothing between — where the schedule holds the empty
positions open rather than sliding September into May.

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

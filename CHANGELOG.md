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

### Changed
- Bumped vite 5.4 → 6.4.3 to move onto patched esbuild (GHSA-67mh-4wv8-2f99).
  `npm audit` is now clean.
- `npm run lint` passes and runs in CI, alongside typecheck and build.

### Fixed
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

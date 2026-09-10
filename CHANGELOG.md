# Changelog

Format: [Keep a Changelog](https://keepachangelog.com). Versioning: [SemVer](https://semver.org).

## [Unreleased]

Nothing yet — see [`ROADMAP.md`](./ROADMAP.md) for what's next.

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

# CONTINUING.md

Handoff document. If you're picking this project up in a fresh Claude session (Fable 5.1, Sonnet, Opus, whatever), or in VS Code, or handing it to a collaborator — read this first.

## Where the project stands

- **Shipped features** — see [`CHANGELOG.md`](./CHANGELOG.md).
- **What's next, with priorities** — see [`ROADMAP.md`](./ROADMAP.md). The "Next up" section at the top names the three best things to start on.
- **Runs** — `npm install && npm run dev` (web, :1420) or `npm run tauri:dev` (desktop, needs Rust).

The rest of this file is *conventions*, not status — those go in the two files above so this one doesn't drift.

## Design principles applied

Keep these in mind when extending:

1. **Progress data is orthogonal to vocab data.** Progress is keyed by `wordId`. You can reload the same JSON five times and progress persists.
2. **Every JSON is a month.** No cross-month files. A month is the unit of loading, unloading, archiving.
3. **All animations use Framer Motion** with easing `[0.16, 1, 0.3, 1]` (custom bezier — quick start, gentle finish). Keep this consistent.
4. **The word itself uses `display-serif`** (Fraunces). Everything else is Inter. Numbers use `tabular` for stability.
5. **Zustand stores are the source of truth**, `localStorage` is the persistence layer via `zustand/middleware`. Never write to `localStorage` directly outside `useSettingsStore` / `useVocabStore` / `useProgressStore`.
6. **Pages don't own domain logic.** `src/lib/` holds pure functions; pages orchestrate. This makes them testable and swappable.
7. **No `Co-Authored-By` in commits.** All commits attributed to the repo owner (Robert).

## Where to make common changes

| I want to… | File to touch |
| --- | --- |
| Add a new page | `src/pages/NewPage.tsx`, register in `App.tsx` `renderPage`, add nav entry in `Sidebar.tsx` and `Page` type in `src/store/useAppStore.ts` |
| Change color palette | `src/styles/globals.css` — CSS custom properties in `:root` and `.dark` |
| Change animation timings | Component-level `transition={...}` — search for `[0.16, 1, 0.3, 1]` to find the standard |
| Add a new vocab field | `src/types/index.ts` (add to `VocabWord`), `src/lib/vocabulary.ts` (parse), `FlashCard.tsx` (render) |
| Change progress tracking | `src/store/useProgressStore.ts` |
| Tune spaced repetition | `src/lib/sm2.ts` — pure SM-2, no store or React imports. `useProgressStore.applyStudyRating` is its only caller |
| Add a study deck | `StudyDeck` union in `src/types/index.ts`, then `poolFor`, `deckOptions` and the `counts` object in `Flashcards.tsx` — the union makes the compiler point at all three |
| Add a setting | `Settings` in `src/types/index.ts`, a default in `DEFAULT_SETTINGS`, then a `SettingSection` in `Settings.tsx`. Backup export/restore picks it up for free |
| Change sentence checks | `src/lib/verify.ts` — `heuristicVerify` and `apiVerify` are independent |
| Add a chart type | `ProgressPage.tsx` uses Recharts — `LineChart`, `AreaChart`, `PieChart` all imported the same way |
| Wire real Tauri file-watching | Add `notify` crate to `src-tauri/Cargo.toml`, emit events to frontend, listen with `@tauri-apps/api/event` |

## Running the app

```bash
# First time
npm install

# Web (fastest way to iterate)
npm run dev

# Desktop (needs Rust)
npm run tauri:dev

# Lint, type check — both run in CI
npm run lint
npm run typecheck

# Production build
npm run build          # web only
npm run tauri:build    # native installers
```

## Data model at a glance

```typescript
VocabMonth
  ├── month: "2026-04"
  ├── displayName: "April 2026"
  └── days: VocabDay[]
       ├── day: 1..31
       └── words: VocabWord[]
            ├── id (slug, stable, used as progress key)
            ├── word, partOfSpeech, definition, example, mnemonic
            └── synonyms?, antonyms?

WordProgress (one per wordId)
  ├── mastered, timesReviewed, quizAttempts, quizCorrect
  ├── lastReviewed (ISO), masteredAt (ISO | null)

DayActivity (one per YYYY-MM-DD)
  ├── wordsReviewed, wordsMastered, quizzesTaken, sentencesWritten

SentencePractice (keyed by wordId:date)
  ├── sentences: string[]
  └── verification: { method, overall, perSentence[], timestamp }
```

## Sanity check before commits

Run these two in order:

```bash
npm run typecheck    # must pass clean
npm run build        # must produce dist/ without errors
```

If typecheck fails, don't push. Common failure: adding a Zustand action but forgetting to add it to the interface at the top of the store file.

## Known rough edges

- The seed data loads on every fresh install (via `main.tsx`). If a user manually removes April 2026, next reload brings it back **unless** they've loaded something else that made `months` non-empty. Fine for now but consider a "seeded" flag.
- File System Access API only works on Chrome/Edge — Firefox / Safari fall back to file-upload only. Documented in the importer UI.
- Recharts uses inline colors from CSS vars; some theme transitions look better with `key` remounts. Not a blocker.
- Speech synthesis in `FlashCard.tsx` uses the browser default voice — quality varies. Consider a voice picker in Settings if this matters.

## If continuing with a different AI

Point it at this doc and the README. The codebase is intentionally organized so any single file can be understood in isolation:

- Types live in one place (`src/types/index.ts`)
- Pure logic lives in `src/lib/`
- State lives in `src/store/`
- UI lives in `src/components/` and `src/pages/`

There is no hidden magic, no code generation step, no complex build pipeline. Vite + TypeScript + Tailwind + Zustand + Framer Motion + Recharts. That's the whole stack.

## If continuing in VS Code

Recommended extensions:

- **ESLint** (dbaeumer.vscode-eslint)
- **Prettier** (esbenp.prettier-vscode)
- **Tailwind CSS IntelliSense** (bradlc.vscode-tailwindcss)
- **rust-analyzer** (rust-lang.rust-analyzer) — for Tauri work
- **Tauri** (tauri-apps.tauri-vscode)

Add a `.vscode/settings.json` if you want format-on-save with the Tailwind class sort.

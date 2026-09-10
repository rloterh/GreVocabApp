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
| Add an import format | Parse to a month-shaped object, then hand it to `loadMonth` — never build a second validator. `src/lib/csv.ts` is the worked example; `src/lib/import.ts` is where formats are dispatched, and every entry point (button, folder pickers, drop overlay) goes through it |
| Change what Claude generates | `src/lib/generate.ts` — the prompt and the strict tool schema are next to each other. Day layout is done in code afterwards, deliberately |
| Add a test | `*.test.ts` beside the code, Vitest. Node environment by default; component tests are `*.test.tsx` with a `@vitest-environment jsdom` docblock. `src/test/setup.ts` supplies an in-memory `localStorage` and the jest-dom matchers. Note: `user-event` hangs under `vi.useFakeTimers()` — use the real clock in interaction tests |
| Change the Anki output | `src/lib/anki-collection.ts` for the database, `anki-export.ts` for loading and zipping. Keep the WebAssembly import out of the former or it stops being runnable outside a browser |
| Change sentence checks | `src/lib/verify.ts` — `heuristicVerify` and `apiVerify` are independent |
| Add a chart type | `ProgressPage.tsx` uses Recharts — `LineChart`, `AreaChart`, `PieChart` all imported the same way |
| Change folder watching | `src-tauri/src/watcher.rs` emits `vocab-file-changed`; `src/hooks/useWatchedFolder.ts` listens and imports. The event name is duplicated in both — keep them in step |
| Change the app icon | Edit the geometry in `scripts/make-icon.mjs`, run it, then `npm run tauri icon src-tauri/icons/source.png`. Do not hand-edit the generated PNGs |

## Gotchas that cost real time

- **`cargo: program not found` right after installing Rust.** rustup adds
  `~/.cargo/bin` to your *persisted* PATH, but a shell opened before the install
  never sees it, and Tauri reports it as
  `failed to run 'cargo metadata' … program not found` — which sends people
  looking for a broken Rust install that is fine. `scripts/tauri.mjs` now finds
  cargo in the standard location and says what it is doing, so the npm scripts
  work in a stale shell. To fix the shell itself, open a new terminal, or
  `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"` (PowerShell) /
  `export PATH="$HOME/.cargo/bin:$PATH"` (bash). Nothing is actually broken.
- **`cargo build --release` is not `npm run tauri build`.** The plain cargo
  build skips the `custom-protocol` feature that embeds the frontend, so the
  window opens on the dev URL and shows the browser's "can't reach this page".
  The binary runs; it is just not the one you want. Always bundle via the npm
  script.
- **Filesystem scope lives in `src-tauri/capabilities/`, not `tauri.conf.json`.**
  A `plugins.fs.scope` block is Tauri v1 shape; v2 rejects it at *startup* with
  `unknown field \`scope\``, so the app compiles, bundles, installs, and then
  panics on launch. Nothing before runtime catches it.
- **`tauri-build` refuses to compile without `src-tauri/icons/icon.ico`.** If
  that file is missing, *nothing* Rust will build and the error names the icon
  rather than the cause. Run `node scripts/make-icon.mjs` then
  `npm run tauri icon src-tauri/icons/source.png`.
- **Node 20 cannot run the component tests.** jsdom pulls in an undici that
  needs `webidl.util.markAsUncloneable`, absent before Node 22 — the worker
  fails to start and the other tests still pass, so the run looks half-healthy.
  `engines` says >=22; CI pins 24.
- **`user-event` hangs under `vi.useFakeTimers()`.** It waits on timers a frozen
  clock never advances. Use the real clock in interaction tests; keep the fake
  one only where a fixed "today" matters.
- **A stale dev server on port 1420 will happily serve old code** and answer
  200. If a change is not showing up, check what actually owns the port before
  believing the page.

## Running the app

```bash
# First time
npm install

# Web (fastest way to iterate)
npm run dev

# Desktop (needs Rust)
npm run tauri:dev

# Lint, type check, unit tests — all run in CI
npm run lint
npm run typecheck
npm test
npm run test:watch     # while working on src/lib/

# Node 22+ is required. jsdom (component tests) pulls in an undici that
# needs a Node built-in absent from Node 20; the suite fails to start there.

# Desktop (Rust). Needs rustup plus a platform C toolchain — on Windows that
# is the Visual Studio Build Tools with the C++ workload.
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --lib --manifest-path src-tauri/Cargo.toml
npm run tauri dev      # first run compiles the whole tree; minutes, then seconds

# Regenerate the app icons from the mark
node scripts/make-icon.mjs
npm run tauri icon src-tauri/icons/source.png

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

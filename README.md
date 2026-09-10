# Lexicon

A premium daily vocabulary practice app. Learn a few new words each day, track your growth over months and years, quiz yourself, and write sentences that get checked for grammar and correct usage.

Built with React 18, TypeScript, Tailwind, Framer Motion, and Tauri v2 — runs as either a native desktop app or a plain web app.

> **New to this codebase?** Start with [`CONTINUING.md`](./CONTINUING.md) for state and conventions, then [`ROADMAP.md`](./ROADMAP.md) for what's next. [`CHANGELOG.md`](./CHANGELOG.md) records what shipped. AI coding assistants also pick up [`CLAUDE.md`](./CLAUDE.md), [`AGENTS.md`](./AGENTS.md), [`.cursor/rules/main.mdc`](./.cursor/rules/main.mdc), and [`.github/copilot-instructions.md`](./.github/copilot-instructions.md) automatically.

## Features

- **Daily practice** — animated flashcards with definition, example, and mnemonic
- **Custom calendar** — jump to any month, quarter, or day; days without vocabulary are dimmed
- **Quiz mode** — three modes (word→def, def→word, mixed) with any pool: mastered, current month, or everything
- **Sentence builder** — write practice sentences; get feedback via Anthropic API or local heuristics
- **Progress tracking** — activity heatmap, monthly/quarterly/yearly charts, current & longest streaks
- **Archive** — every month you've loaded, always browsable
- **Search** — full-text across all loaded vocabulary
- **JSON-driven** — one file per month, dropped in a folder. Load, unload, keep as many as you want
- **Backup / restore** — export everything as JSON
- **Light & dark themes** — with warm off-white / near-black palettes

## Quick start (web app)

```bash
npm install
npm run dev
```

Opens at http://localhost:1420. Comes pre-seeded with April and May 2026 (180 GRE-level words).

## Quick start (desktop app via Tauri)

Prerequisites: [Rust toolchain](https://www.rust-lang.org/tools/install), plus platform-specific build tools ([macOS](https://tauri.app/start/prerequisites/#macos), [Windows](https://tauri.app/start/prerequisites/#windows), [Linux](https://tauri.app/start/prerequisites/#linux)).

```bash
npm install
npm run tauri:dev        # Development mode
npm run tauri:build      # Produces installers in src-tauri/target/release/bundle/
```

## Loading your own vocabulary

Vocabulary files are JSON with this shape:

```json
{
  "month": "2026-06",
  "displayName": "June 2026",
  "days": [
    {
      "day": 1,
      "words": [
        {
          "word": "Ineffable",
          "partOfSpeech": "adjective",
          "definition": "Too great or extreme to be expressed in words.",
          "example": "The view from the summit had an ineffable beauty.",
          "mnemonic": "'In-' (not) + 'effable' (utterable) — cannot be uttered."
        }
      ]
    }
  ]
}
```

### CSV

CSV is accepted anywhere JSON is. It is converted to the shape above and then
put through exactly the same validation, so the rules do not differ.

```csv
word,partOfSpeech,definition,example,mnemonic,day
abate,verb,To lessen in intensity.,The storm abated by dawn.,"a-BATE, like bait shrinking",1
cogent,adjective,Clear and convincing.,She made a cogent argument.,"cogent = co-agent, persuasive",1
```

- **Required columns:** `word`, `partOfSpeech`, `definition`, `example`,
  `mnemonic`, `day`.
- **Optional columns:** `month` (`YYYY-MM`), `id`, `synonyms`, `antonyms`.
  Synonyms and antonyms are semicolon-separated: `terse;curt`.
- **Header names are forgiving** — `Part of Speech`, `part_of_speech` and `POS`
  all resolve to `partOfSpeech`; `Term` works for `word`, `Meaning` for
  `definition`, `Memory Aid` for `mnemonic`.
- **Which month?** A `month` column wins. Otherwise the filename is used if it
  contains one (`2026-07.csv`), and failing that the current month. One CSV may
  span several months; each becomes its own month, because a month is the unit
  of loading everywhere in the app.
- Quoted fields, embedded commas and newlines, and doubled quotes (`""`) are
  handled per RFC 4180.

Errors name the line: `Line 4: 'day' must be a whole number 1-31, got "nope"`.

### Four ways to load

1. **Drag and drop** — drop `.json`, `.csv` or `.apkg` files anywhere in the app
2. **Import button** — "Import JSON / CSV" on the Dashboard or Archive
3. **Pick a folder** — in browser (Chrome/Edge only) or Tauri, load a whole folder at once
4. **Auto-seed** — files in `src/data/` are bundled and loaded on first run

All four go through the same validation, so a file one accepts they all accept.

## Generating vocabulary with Claude

Archive has a **Generate with AI** button. Give it a topic, a word count and a
month, and Claude writes the words, definitions, examples and mnemonics.

It uses the Anthropic API key from Settings and is billed to your account.
Words you already have are sent along so the model does not repeat them.

The response is constrained with a strict tool schema rather than parsed out of
prose, and the result is still put through the same validation as an imported
file — generated content is not trusted any more than a file you supplied.

## Importing from Anki

Drop an `.apkg` into the app, or pick it with the import button. Lexicon reads
the notes out of the deck and lands them in the first month you have nothing
loaded in, three words per day.

Anki decks have no fixed schema, so fields are matched by **name** first —
`Word`/`Term`/`Front` for the word, `Definition`/`Meaning`/`Back` for the
meaning, and `Example`, `Mnemonic` and `Part of Speech` where present. A deck
whose fields match none of those falls back to "first field is the word, second
is the meaning", which is what a two-field note almost always is. Missing
example and mnemonic fields show as `—`.

Notes with no word or no meaning are skipped and counted. HTML, `[sound:…]`
references and entities are stripped.

Two limits worth knowing:

- **Scheduling is not imported.** Lexicon's progress is keyed by its own word
  ids, and inventing review history for words you have not seen here would be
  worse than starting fresh. Export the other way *does* carry scheduling.
- **Anki's newer compressed format is not readable.** If you get an error
  saying so, re-export from Anki with "Support older Anki versions" ticked.

## Exporting a study log

Settings → Backup → **Export study log (Markdown)** writes a readable record:
totals and streaks, a per-month breakdown, what is due with its interval and
ease, and your last 30 active days. Useful for sharing progress or keeping a
record outside the app.

## Exporting to Anki

Settings has an **Anki export** section that writes every loaded month to a
standard `.apkg` file. Choose one deck per month (as subdecks of a top-level
deck you name) or a single deck for everything.

Review scheduling travels with the cards. A word you have rated in Lexicon
arrives in Anki as a *review* card with its interval, ease factor and
repetition count intact, due on the same day Lexicon would have shown it —
not reset to new. Words you have never rated arrive as new cards.

The file is Anki's legacy schema 11, the format `genanki` produces and current
Anki still imports. The SQLite and zip libraries needed to build it are
downloaded only the first time you export, so they cost nothing to anyone who
does not use the feature.

## Sentence verification

Two modes, chosen based on Settings:

- **AI verification** (recommended) — sends the word, its definition, and your sentences to Anthropic's API. Returns per-sentence feedback on grammar and correct usage. Add your API key in Settings; it's stored locally in your browser only.
- **Heuristic** (fallback) — local checks: does the sentence use the word (with morphological variants), is it capitalized, does it have punctuation, is it long enough, does it look copy-pasted from the example.

## Data model

- `src/types/index.ts` — all interfaces
- `src/lib/vocabulary.ts` — parser and validator
- `src/lib/verify.ts` — heuristic + API verification
- `src/lib/streak.ts` — streak calculation
- `src/store/` — Zustand stores (vocab, progress, settings, app nav)

Progress is stored in `localStorage` under keys prefixed with `lexicon.*`.

## Project structure

```
src/
├── App.tsx, main.tsx        Root
├── components/              Presentation
│   ├── ui/                  Primitives (Button, Card, Dialog, ...)
│   ├── FlashCard.tsx        Flip-reveal word card
│   ├── CalendarPicker.tsx   Custom calendar with unselectable days
│   ├── JsonImporter.tsx     File / folder import
│   ├── Sidebar.tsx          Navigation
│   ├── Toast.tsx
│   └── EmptyState.tsx
├── pages/                   Route views
│   ├── Dashboard.tsx        Overview + today's words
│   ├── DailyPractice.tsx    Flashcards for a day
│   ├── Quiz.tsx             Setup / play / results
│   ├── SentenceBuilder.tsx  Write & verify
│   ├── Calendar.tsx         Date picker + preview
│   ├── Archive.tsx          All loaded months
│   ├── ProgressPage.tsx     Heatmap + charts
│   ├── Search.tsx           Full-text
│   └── Settings.tsx         Theme, API key, backup, reset
├── store/                   Zustand stores
├── lib/                     Pure logic (no React)
├── types/                   TypeScript types
├── data/                    Bundled vocabulary
└── styles/globals.css       Tailwind + design tokens
```

## Tests

```bash
npm test              # once
npm run test:watch    # while working
```

Vitest, covering `src/lib/` — the spaced-repetition scheduler, the CSV parser,
the Anki collection builder, the vocabulary generator, and sentence
verification. Those are the files where a silent mistake is expensive, and
`src/lib/` is pure by design, so they test without a DOM.

The Anki tests build a real collection and read it back with real SQLite. The
two files that call the Anthropic API are tested with `fetch` stubbed, which
pins the request shape and every error path without spending anything.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server at :1420 |
| `npm run build` | Production build to `dist/` |
| `npm run typecheck` | Type-check without emit |
| `npm run lint` | ESLint |
| `npm run tauri:dev` | Tauri desktop app in dev mode |
| `npm run tauri:build` | Bundle native installers |

## Roadmap

See [`ROADMAP.md`](./ROADMAP.md) for the phased plan with priorities and acceptance criteria. High-level phases:

1. **Foundation** — shipped in v0.1.0
2. **Learning quality** — spaced repetition (SM-2), due-today deck
3. **Content flow** — CSV import, Anki `.apkg` export, generate-with-AI
4. **Multi-device & desktop parity** — real file-watching, native icons, mobile
5. **Polish, community, sharing** — global shortcuts, deck sharing, onboarding

## License

MIT

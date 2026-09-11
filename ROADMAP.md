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

**Phases 1-5 are complete.** v0.1 is a working web and desktop app: SM-2
scheduling, four import formats, an Anki round-trip, AI generation, sharing,
themes, 283 tests, and a desktop bundle that has been launched and looked at.

**Phases 6-12 are v1.0** — multi-platform, multi-provider, and a real testing
suite. The design for all of it is in [`docs/`](./docs/); read
[`docs/README.md`](./docs/README.md) first. Nothing in those documents is built
until the phase below says so.

Order is deliberate. Phase 6 is first because every later phase either uses the
provider layer or is made harder by not having it. Phase 7 is second because
mobile layout is verifiable in a browser and blocks the Android work.

1. **Phase 6 — the AI provider layer.** Unblocks everything else.
2. **Phase 7 — responsive shell.** Blocks Android; improves the web app today.
3. **Phase 8 — generation at scale.** The dedup engine is the hard part.

**One open decision** before Phase 11:
[ADR 0006](./docs/adr/0006-fun-vs-no-gamification.md) — whether the standing
"no gamification beyond streaks" rule holds. Everything currently scheduled
respects it.

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

- ~~Dropping a JSON into a watched folder loads it in <2 seconds without a refresh.~~ Implemented, and the desktop app is now confirmed to **launch and render its own UI** from a release bundle. The watcher's own round trip — drop a file, see it load — has still not been driven by hand.
- ~~Desktop app has a real icon in the dock/taskbar.~~ Done.

**Getting there found two runtime bugs that every other check passed.** The app
had never been able to start: `tauri.conf.json` carried a v1-shaped
`plugins.fs.scope` that the v2 fs plugin rejects during initialisation, so the
binary compiled, bundled, installed and then panicked. `cargo check`, `cargo
test`, CI and `tauri build` were all green throughout. It shipped in the
initial commit.

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

## Phase 6 — The AI provider layer

**Goal.** The app finds a model on its own, from whatever the user already has,
and every AI feature goes through one seam instead of a hand-rolled fetch.

**Why it matters.** Today AI means "paste an Anthropic key". That excludes most
people on first run, and `generate.ts` and `verify.ts` each carry their own copy
of the HTTP, the model id and the error handling. Both problems have one fix.

Design: [`docs/AI-PROVIDERS.md`](./docs/AI-PROVIDERS.md) ·
[ADR 0001](./docs/adr/0001-provider-cascade.md) ·
[ADR 0003](./docs/adr/0003-rust-http-transport.md) ·
[ADR 0007](./docs/adr/0007-authentication-strategy.md) ·
[ADR 0008](./docs/adr/0008-prompt-bridge.md) ·
[ADR 0009](./docs/adr/0009-installed-cli-providers.md) ·
[ADR 0010](./docs/adr/0010-secrets-handling.md)

### Tasks

- **[P0] Spike: browser built-in AI.** — The API has changed repeatedly and is partly origin-trial gated; the design assumes capability detection rather than a fixed shape. → A throwaway page reporting what this machine's Chrome and Edge actually expose, written into the ADR before any provider code depends on it.
- **[P0] Provider interface and registry.** — One `Provider` shape, one `complete()` / `completeStructured()`. → `src/lib/ai/`, plus a contract test suite every adapter must pass against a stubbed transport.
- **[P0] Structured-output façade.** — Providers express JSON schemas four different ways, and weak models express none. → `structured.ts` picks the strongest mechanism available and falls back to prompt-and-repair. Validation always runs, whatever the mechanism claimed.
- **[P0] OpenAI-compatible adapter.** — One implementation covers OpenAI, Groq, OpenRouter, Together, DeepSeek, LM Studio, llama.cpp and any custom base URL. → The highest-leverage single file in the phase.
- **[P0] Anthropic adapter.** — Port the existing strict-tool call, behaviour unchanged. → The 48 generator tests keep their meaning, re-pointed at the new seam.
- **[P0] Local server detection.** — Ollama and LM Studio, probed in parallel on a 1.5s budget, cached per session. → Detected with no configuration on desktop.
- **[P0] Rust HTTP transport.** — Escapes the CORS wall that stops a browser calling Ollama. → An `ai_request` command with a scheme and host allowlist and a response size cap. Not a general proxy, and must never become one.
- **[P1] Browser built-in provider.** — Gated on the spike. → On-device, no key, no network.
- **[P1] Provider settings UI.** — What was detected, what is in use, what it costs, an on-device badge. → One screen that makes the cascade legible instead of magic.
- **[P1] Keys into OS secure storage.** — Desktop and mobile keychain rather than `localStorage`. → Includes migrating an existing Anthropic key out, and clearing it.
- **[P0] Fix: API keys leak into backup exports.** — `exportData()` serialises the whole settings object, key included, into a file users put in cloud drives. → Split `Settings` from `Secrets` so the export cannot include one by construction, and drop keys found in old backups on restore. A live defect, and the most serious one in the codebase. [ADR 0010](./docs/adr/0010-secrets-handling.md)
- **[P0] Prompt bridge.** — Generate vocabulary with no credential at all: the app writes the prompt, the user runs it in whatever AI they already have open, and pastes the result back. → The recommended path for anyone without a key, not a fallback for the desperate. CSV round-trip through the existing parser, with fence-stripping and per-line errors. [ADR 0008](./docs/adr/0008-prompt-bridge.md)
- **[P1] Installed AI CLI providers.** — Detect `claude`, `codex`, `gemini` and similar on PATH; invoke with consent. → The tool authenticates itself; Lexicon never reads its credential store. Fixed allowlist, argument vectors, prompts via stdin, no shell. [ADR 0009](./docs/adr/0009-installed-cli-providers.md)
- **[P1] OAuth connect, where the provider offers it.** — "Sign in with…" rather than a pasted key. → Spike first: establish per provider whether third-party client registration exists, and record it in ADR 0007. Token to the OS keychain.
- **[P1] Secret hygiene.** — A `Secret` wrapper that redacts on stringify, per-provider binding so a key cannot go to the wrong host, and a confirmation naming the host before a custom base URL first receives one. → Tested: stringifying a populated config must contain no substring of the secret. [ADR 0010](./docs/adr/0010-secrets-handling.md)
- **[P2] WebGPU in-app model.** — No key, offline, but a multi-gigabyte download. → Opt-in, never automatic, with a clear size warning.

### Definition of done

- A user with Ollama running, a current Chrome, or Claude Code installed
  generates vocabulary without typing anything.
- **A user with none of those, and no API key, can still generate a month** via
  the prompt bridge.
- No AI feature contains a `fetch` to a provider.
- Every adapter passes the same contract suite.
- The provider in use is always visible in the UI.
- A backup export contains no secret, and a test proves it.

## Phase 7 — Responsive shell

**Goal.** The app works on a phone-sized screen — in a browser today, in an
Android app in Phase 9.

**Why it matters.** A fixed 240px sidebar and a 53-column heatmap are unusable
below ~640px. This is also the cheapest phase to verify: a browser at a phone
viewport is the whole test rig.

Design: [`docs/MOBILE.md`](./docs/MOBILE.md)

### Tasks

- **[P0] Responsive shell.** — One shell: sidebar at `lg` and up, bottom tab bar below. → Pages do not know which is showing; anything that needs to know is a layout bug to fix in the page.
- **[P0] Bottom tab bar.** — Five destinations, the ones used daily; the rest behind More. → Safe-area padded, 44px minimum targets.
- **[P0] Per-screen fixes.** — Stat grid, rating row, quiz options, heatmap, dialogs. → No horizontal page scroll at 360px; dialogs become full-screen sheets below `sm`.
- **[P1] Touch and input hygiene.** — 44px targets, 16px input font so iOS does not zoom, no hover-only affordances. → The Archive share button is currently hover-only.
- **[P1] Component tests at mobile viewports.** — The shell swap and the tab bar are logic, not composition. → jsdom at two widths.

### Definition of done

- Nothing scrolls the page horizontally at 360px.
- Every interactive target is at least 44px.
- Screenshots at 360, 768 and 1280 in the README.

## Phase 8 — Generation at scale

**Goal.** Generate a month, a quarter, six months or a year; never repeat a
word; let the user insist on words of their own.

**Why it matters.** Generating one month at a time is a demo. A year is the
product — and a year is exactly where duplicates become inevitable without
enforcement.

Design: [`docs/VOCAB-GENERATION.md`](./docs/VOCAB-GENERATION.md) ·
[ADR 0005](./docs/adr/0005-dedup-by-stem-with-retirement.md)

### Tasks

- **[P0] Dedup index.** — Stem-based collision, retirement on month removal, derived at startup. → Property-style tests: no duplicate survives, variants collapse, a removed month still blocks its words.
- **[P0] Conservative stemmer.** — `abate`/`abated`/`abatement` are one word; `industry`/`industrious` are two. → A rule set with a word-family fixture, deliberately under-aggressive.
- **[P0] Generation plan.** — Horizon, difficulty curve, themes, must-include words, as an editable value object. → Previewed before a single token is spent.
- **[P0] Batched execution with overage.** — Ask for 25% more than needed, filter locally, top up once, then accept a short month and say so. → Enforcement is local; the avoid-list in the prompt is only an optimisation.
- **[P0] Resumable plans.** — A year that fails at month 9 resumes at month 9. → Checkpoint after each committed month.
- **[P1] User-supplied word lists.** — Paste or type words that must appear. → Placed first, never dropped, warned about if already present.
- **[P1] Add words to an existing month.** — Generate only the card content for a word the user names.
- **[P1] Local quality checks.** — No circular definitions; examples that do not restate the definition; mnemonics that are actually mnemonics. → Reuses the overlap check already in `verify.ts`, one targeted regeneration per failure.

### Definition of done

- A year-long plan produces ~1,100 words with zero stem collisions.
- Removing a month and regenerating does not hand back that month's words.
- A plan that fails partway resumes without repeating work.

## Phase 9 — Android

**Goal.** Lexicon on the Play Store.

**Why it matters.** It is where vocabulary practice actually happens — in
queues, on buses, in the five minutes before something starts.

Design: [`docs/MOBILE.md`](./docs/MOBILE.md) ·
[ADR 0004](./docs/adr/0004-android-first.md)

### Tasks

- **[P0] Android toolchain and `tauri android init`.** — JDK 17, SDK 34+, NDK, four Rust targets. → Written up as a runbook in CONTINUING.md, because this is the step that eats an afternoon.
- **[P0] Platform capability gating.** — The watched folder is meaningless under scoped storage; tray and global shortcut are desktop-only. → Runtime capability checks, not platform branches scattered through the UI.
- **[P0] System back button.** — Must navigate within the app before exiting it.
- **[P0] Scheduled notifications.** — `tauri-plugin-notification`, plus the Android 13+ runtime permission. → This is what finally makes daily reminders fire with the app closed.
- **[P1] Share-target intent.** — Receive a `.json`, `.csv` or `.apkg` shared from another app.
- **[P1] Play Store submission.** — Keystore kept out of the repo, privacy policy, data-safety form declaring no collection, content rating, screenshots.
- **[P2] Android CI.** — Build the APK on a runner, so the mobile build cannot rot the way the desktop build did.

### Definition of done

- A signed APK installs and runs on a real device.
- A reminder fires with the app closed.
- The Play listing is submitted.

## Phase 10 — Testing suite

**Goal.** Quizzes worth taking: instant, periodic, and a 100-question sectioned
exam.

**Why it matters.** Flashcards teach recognition. Testing under constraint is
what reveals whether a word is actually known, and it is the thing a GRE
candidate is preparing for.

Design: [`docs/QUIZ-AND-EXAMS.md`](./docs/QUIZ-AND-EXAMS.md)

### Tasks

- **[P0] Distractor scoring.** — Same part of speech, similar definition length, same register; synonyms penalised hard. → A distractor that is arguably correct is the fastest way to lose trust in a quiz.
- **[P0] Instant quiz with a scope picker.** — Scope, count, mode, then straight in; remembers the last choice. → Defaults to Due now whenever anything is due.
- **[P0] Periodic tests.** — Daily 10, Weekly 25, Monthly 50, drawn from defined pools weighted toward low ease factors. → Uniform sampling mostly asks about words the user already knows.
- **[P0] 100-question sectioned exam.** — Five sections of twenty, optional per-section timer, break screens without scores. → Persisted on every answer; closing the app mid-exam must not lose it.
- **[P0] Wrong answers feed the scheduler.** — A missed word has its interval cut, as an "Again" would. → An exam is a study session, not only a measurement.
- **[P1] Full per-question review.** — The word, your answer, the right answer, and the card.
- **[P1] Test history and trend.** — Personal bests per period on the Progress page. → The point of testing on a schedule.
- **[P2] AI-generated distractors.** — Better questions where a provider is available and the user opts in. → An enhancement; the heuristic is never removed.

### Definition of done

- A 100-question exam survives the app being closed and reopened.
- No question has a distractor that is a synonym of its answer.
- Missed words appear sooner in the flashcard schedule.

## Phase 11 — Craft and delight

**Goal.** The details that make people keep using it.

**[ADR 0006](./docs/adr/0006-fun-vs-no-gamification.md) is decided:** the
no-gamification rule stands. Fun here means craft, surprise and satisfying
feedback — not a second scoring system competing with the scheduler. The one
exception is the streak freeze, which corrects an existing mechanic rather than
adding a new one. No XP, levels, badges or comparison.

### Tasks

- **[P0] Info dialog.** — A small `i` button opening "Designed by Robert Loterh · 2026", with version, licence and links.
- **[P0] README with screenshots.** — What the app looks like, at desktop and mobile widths. → A vocabulary app with no screenshot in its README is asking a lot of a reader.
- **[P1] Streak freeze.** — One token a week, spent automatically on a missed day. → Streaks motivate until one breaks, at which point they become a reason to stop. This removes the cliff without adding a number to chase.
- **[P1] Word of the day** on the Dashboard, drawn from what is due.
- **[P1] Audio pronunciation.** — Extends the flashcard speak button that already exists.
- **[P1] Etymology and root families.** — Group by shared root; show the family while studying one. Genuinely aids retention.
- **[P1] Confusable pairs drill.** — `affect`/`effect`, `discreet`/`discrete`. → A real, repeated failure mode, and satisfying to finally nail.
- **[P2] Session recap card.** — A shareable image of a session; the deck-share plumbing already exists.
- **[P2] Empty and success state craft.**

### Definition of done

- The info dialog exists and names its designer.
- The README shows the app.
- Nothing here needs a legend to explain it. That is the test for "fun, not
  confusing" — if a feature would need a tooltip to justify itself, it is out.

## Phase 12 — iOS

**Blocked.** Needs a Mac and a paid Apple Developer account; neither exists for
this project. Xcode is macOS-only and there is no cross-compilation path.

Everything in Phases 7 and 9 is written to serve iOS too — responsive layout,
safe areas, runtime capability detection — so this phase is short when it
becomes possible rather than a rewrite.

### Tasks

- **[P0] Toolchain and `tauri ios init`.**
- **[P0] Device and simulator testing.**
- **[P0] App Store submission.** — Expect a review question about network calls; the answer is the consent dialog and the privacy policy.
- **[P1] Screenshots at the required device sizes.**

### Definition of done

- The app runs on a physical iPhone.
- The App Store listing is submitted.

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

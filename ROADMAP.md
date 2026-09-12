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

- ~~**[P0] Spike: browser built-in AI.**~~ **DONE 2026-09-11.** Measured on Edge and Chrome 152, headless and headed. `globalThis.LanguageModel` is present; the legacy `window.ai.*` shape is gone; `availability()` returns `"unavailable"` on this machine; WebGPU works. Findings and consequences in [ADR 0007](./docs/adr/0007-authentication-strategy.md). **The browser provider drops to P2 as a result** — presence is not availability, and the out-of-the-box path has to rest on routes that were measured to work.
- ~~**[P0] Provider interface and registry.**~~ **DONE.** — One `Provider` shape, one `complete()` / `completeStructured()`. → `src/lib/ai/`, plus a contract test suite every adapter must pass against a stubbed transport.
- ~~**[P0] Structured-output façade.**~~ **DONE.** — Providers express JSON schemas four different ways, and weak models express none. → `structured.ts` picks the strongest mechanism available and falls back to prompt-and-repair. Validation always runs, whatever the mechanism claimed.
- ~~**[P0] OpenAI-compatible adapter.**~~ **DONE.** — One implementation covers OpenAI, Groq, OpenRouter, Together, DeepSeek, LM Studio, llama.cpp and any custom base URL. → The highest-leverage single file in the phase.
- ~~**[P0] Anthropic adapter.**~~ **DONE.** — Port the existing strict-tool call, behaviour unchanged. → The 48 generator tests keep their meaning, re-pointed at the new seam.
- ~~**[P0] Local server detection.**~~ **DONE.** — Ollama and LM Studio, probed in parallel on a 1.5s budget, cached per session. → Detected with no configuration on desktop.
- ~~**[P0] Rust HTTP transport.**~~ **DONE** via `tauri-plugin-http`, whose allowlist lives in capabilities where Tauri audits it — better than a hand-rolled proxy that could drift. Original note: — Escapes the CORS wall that stops a browser calling Ollama. → An `ai_request` command with a scheme and host allowlist and a response size cap. Not a general proxy, and must never become one.
- **[P2] Browser built-in provider.** — Demoted by the spike: `availability()` was `"unavailable"` on both browsers tested, so this cannot carry the zero-setup experience. Still worth building — free and fully private where it works. → Detect via `globalThis.LanguageModel` then `availability()`; never treat presence as availability.
- ~~**[P1] Provider settings UI.**~~ **DONE 2026-09-11.** — `ProviderSettings.tsx` in Settings: every provider with what detection found, an on-device badge, and the one that will answer marked. Click to pin, click again to return to the cascade. → The cascade is legible instead of magic.
- ~~**[P1] Keys into OS secure storage.**~~ **DONE 2026-09-11.** — `src-tauri/src/keystore.rs` (the `keyring` crate, one service name, an allowlist of credential names so the commands cannot read arbitrary entries) behind `src/lib/ai/keystore.ts`. Startup migrates a key out of the settings blob — a move, not a copy — and an empty save clears it. → The browser has no keychain, so there it falls back to `localStorage` under its own prefix **and the UI says so in those words** rather than implying a safety it does not have.
- ~~**[P0] Fix: API keys leak into backup exports.**~~ **DONE.** — `exportData()` serialises the whole settings object, key included, into a file users put in cloud drives. → Split `Settings` from `Secrets` so the export cannot include one by construction, and drop keys found in old backups on restore. A live defect, and the most serious one in the codebase. [ADR 0010](./docs/adr/0010-secrets-handling.md)
- ~~**[P0] Prompt bridge.**~~ **DONE.** — Generate vocabulary with no credential at all: the app writes the prompt, the user runs it in whatever AI they already have open, and pastes the result back. → The recommended path for anyone without a key, not a fallback for the desperate. CSV round-trip through the existing parser, with fence-stripping and per-line errors. [ADR 0008](./docs/adr/0008-prompt-bridge.md)
- ~~**[P0] Installed AI CLI providers.**~~ **DONE.** — Detect `claude`, `codex`, `gemini` and similar on PATH; invoke with consent. → **Promoted by the spike:** on the development machine this is the *only* zero-config programmatic route — the browser model is unavailable and no local server is running. → The tool authenticates itself; Lexicon never reads its credential store. Fixed allowlist, argument vectors, prompts via stdin, no shell. [ADR 0009](./docs/adr/0009-installed-cli-providers.md)
- ~~**[P1] Spike: OAuth, per provider.**~~ **DONE 2026-09-11.** — Seven providers checked, by measurement wherever measurement was possible. **One says yes: OpenRouter** — a public-client PKCE flow needing no client registration and no client secret, verified against the live service. Anthropic is not merely undocumented but **expressly prohibits** third-party Claude.ai login and consumer-plan credential routing, in writing. Google was measured against the live API discovery document: no OAuth scope reaches `generateContent` at all. Together publishes an OIDC server whose scopes carry identity only. Full findings and the exact quotes in [ADR 0007](./docs/adr/0007-authentication-strategy.md).
- ~~**[P1] OpenRouter "Connect" button.**~~ **DONE 2026-09-11.** Loopback listener in `src-tauri/src/oauth.rs` on desktop, redirect-and-resume on web, PKCE and the exchange in `src/lib/ai/oauth.ts`, key straight into the keychain. Driven end to end in a browser against a stubbed OpenRouter: 22/22, including that no `client_id` or client secret is ever sent and the authorization code is stripped from the address bar. Original note: — What "OAuth connect" reduced to once measured: six of seven providers cannot offer it, so a generic "Sign in with…" affordance would advertise something that exists in one place. → Loopback listener on an ephemeral port, `code_challenge`/`code_verifier` (S256), exchange at `/api/v1/auth/keys`, result straight into the keychain from Phase 6 P1. The flow returns a user-controlled **API key**, not an expiring token, so there is no refresh path and nothing downstream changes. One integration reaches Claude, GPT, Gemini and the open models behind the same gateway.
- ~~**[P1] OAuth for Anthropic, OpenAI, Google, Groq, Mistral, Together, DeepSeek.**~~ **CLOSED — will not build.** — Not deferred: unavailable, and for Anthropic expressly against its terms. Do not reopen without new published terms from the provider in question. [ADR 0007](./docs/adr/0007-authentication-strategy.md)
- **[P1] Secret hygiene.** **MOSTLY DONE 2026-09-11.** — `Secret` redacts under interpolation, `String()`, concatenation and `JSON.stringify`; `secretForUrl` binds a credential to its host and withholds it from a lookalike (`api.openai.com.evil.test`), a different provider, and a malformed URL. Tested: stringifying a populated config contains no substring of the secret. **Outstanding:** the confirmation naming the host before a custom base URL first receives a key — deferred because no UI yet writes a custom base URL; it lands with that screen. [ADR 0010](./docs/adr/0010-secrets-handling.md)
- **[P2] WebGPU in-app model.** — No key, offline, but a multi-gigabyte download. → Opt-in, never automatic, with a clear size warning.

### Definition of done

- A user with Ollama running, or Claude Code installed, generates vocabulary
  without typing anything. (Not "a current Chrome" — the browser-AI spike
  measured `availability()` as `"unavailable"` on both browsers tested.)
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

- ~~**[P0] Responsive shell.**~~ **DONE 2026-09-11.** — Sidebar is `hidden lg:flex`; `MobileTabBar` is `lg:hidden`. No page learned anything about which is showing. → Content padding steps 16/24/32px and clears the bar.
- ~~**[P0] Bottom tab bar.**~~ **DONE 2026-09-11.** — Home, Practice, Cards, Quiz, More; the other six in a sheet behind More, which stays lit while you are on one of them. Safe-area padded, 56px targets. 13 component tests.
- ~~**[P0] Per-screen fixes.**~~ **DONE 2026-09-11.** — Rating row 2×2 below `sm`, quiz modes stacked, dialogs full-height sheets below `sm`. The heatmap already scrolled in its own container. → Measured: no page scrolls horizontally at 360px.
- ~~**[P1] Touch and input hygiene.**~~ **DONE 2026-09-11.** — One `@media (pointer: coarse)` block rather than a size prop threaded through every call site, because the forgotten one is always the button nobody tested on a phone. Keyed to the pointer, not the width: a narrow desktop window keeps its density and a large tablet still gets 44px. → The Archive share button turned out not to be hover-only; that note was stale.
- ~~**[P1] Component tests at mobile viewports.**~~ **DONE 2026-09-11.** — 13 tests on the tab bar: which destinations earn a tab, that all ten stay reachable between bar and sheet, that More lights up for a page behind it, Escape, and that choosing a destination closes the sheet. → jsdom has no layout, so the `lg:hidden` swap itself is proven in the browser audit instead, which is the honest split.

### Definition of done — met 2026-09-11

- ~~Nothing scrolls the page horizontally at 360px.~~ **Measured** across all ten pages at 360, 768 and 1280.
- ~~Every interactive target is at least 44px.~~ **Measured**, on a touch pointer. A checkbox is judged by the label that wraps it, since that is what a finger actually hits.
- ~~Screenshots at 360, 768 and 1280 in the README.~~ In `docs/screenshots/`.

## Phase 8 — Generation at scale

**Goal.** Generate a month, a quarter, six months or a year; never repeat a
word; let the user insist on words of their own.

**Why it matters.** Generating one month at a time is a demo. A year is the
product — and a year is exactly where duplicates become inevitable without
enforcement.

Design: [`docs/VOCAB-GENERATION.md`](./docs/VOCAB-GENERATION.md) ·
[ADR 0005](./docs/adr/0005-dedup-by-stem-with-retirement.md)

### Tasks

- ~~**[P0] Dedup index.**~~ **DONE 2026-09-11.** — `src/lib/vocab-index.ts`, derived from loaded months plus a persisted retired ledger, wired into `useVocabStore`. Catches duplicates inside a single batch too, which a model asked for 40 words will produce. 33 + 13 tests: variants collapse, a removed month still blocks its words, the block survives a restart.
- ~~**[P0] Conservative stemmer.**~~ **DONE 2026-09-11.** — `src/lib/stem.ts`. 54 tests against a fixture of 17 real word families and 18 pairs that must *not* collide, because the two errors do not cost the same: a missed collision is visible and annoying, an over-match silently drops a legitimate word with no explanation.
- ~~**[P0] Generation plan.**~~ **DONE 2026-09-11.** — `src/lib/generation-plan.ts`: a value object with a difficulty curve across the horizon rather than a constant. `previewPlan` contacts nothing, which is the point of it. 36 tests.
- ~~**[P0] Batched execution with overage.**~~ **DONE 2026-09-11.** — `src/lib/generation-run.ts`. Asks for 25% more, filters locally, tops up once, then accepts a short month and records the shortfall rather than blocking a year on one stubborn batch.
- ~~**[P0] Resumable plans.**~~ **DONE 2026-09-11.** — `RunCheckpoint` after every month, committed or not. Tested by failing mid-run and resuming with a working provider: month 1 is not generated again.
- ~~**[P1] User-supplied word lists.**~~ **DONE 2026-09-11.** — A textarea in the plan builder, one per line or comma-separated. Distributed across the earliest months, named in the prompt as *additional* rather than instead of, and warned about — before anything is generated — when already present.
- ~~**[P1] Add words to an existing month.**~~ **DONE 2026-09-11.** — `AddWordsButton` on each Archive month. The words are the user's, so only definition, example and mnemonic are generated. Existing days are left untouched; new words top up the last day before opening another. Collisions are named before generating, not after.
- ~~**[P1] Local quality checks.**~~ **DONE 2026-09-11.** — `src/lib/word-quality.ts`: circular definitions (stem-based, so `abatement` in the definition of `abate` counts), examples missing the word or restating the definition, mnemonics that are the definition again. The overlap check moved out of `verify.ts` into `text-overlap.ts` so both callers share one implementation. One targeted regeneration per failure, and a repair is kept only if it is actually better — a card is never dropped for failing.

### Definition of done — library complete 2026-09-11

- ~~A year-long plan produces ~1,100 words with zero stem collisions.~~ Tested end to end against a stub provider: 1,080 words, `new Set(stems).size === words.length`.
- ~~Removing a month and regenerating does not hand back that month's words.~~ Tested at both the index and the store level, including across a simulated restart.
- ~~A plan that fails partway resumes without repeating work.~~ Tested.

**Phase complete 2026-09-11.** `PlanBuilder` is a second mode in the generate
dialog: horizon, difficulty, register, and a word list, with a preview that
contacts nothing. Months already loaded are skipped rather than overwritten. A
failure mid-run keeps what finished and offers Resume.

Driven in a browser against a stubbed provider at every step: 15/15 for the
plan builder (450 words across months, zero repeats, a deliberate mid-run
failure and a resume that completed it) and 10/10 for adding words to a month.

## Phase 9 — Android

**Goal.** Lexicon on the Play Store.

**Why it matters.** It is where vocabulary practice actually happens — in
queues, on buses, in the five minutes before something starts.

Design: [`docs/MOBILE.md`](./docs/MOBILE.md) ·
[ADR 0004](./docs/adr/0004-android-first.md)

### Tasks

- ~~**[P0] Android toolchain and `tauri android init`.**~~ **DONE 2026-09-12.** — NDK 27.3.13750724, Temurin JDK 17, four Rust targets, `tauri android init` generated, and a **signed 23.7 MB arm64 APK produced and verified by `apksigner`**. Four traps are written up in CONTINUING.md: Android Studio's bundled JBR is Java 25 and Gradle rejects it with a message that never mentions Java; Studio installs neither the NDK nor the command-line tools; `tauri android build` cannot symlink on Windows without Developer Mode; and the Gradle Rust task runs the *dev* script, so a release build must skip it.
- ~~**[P0] Platform capability gating.**~~ **DONE 2026-09-12.** — `src/lib/platform.ts` asks "can I watch a folder?", never "is this Android?". Its tests are a capability table, so what works where is reviewable in one place. 37 tests.
- ~~**[P0] System back button.**~~ **DONE 2026-09-12.** — `useSystemBack`, over the History API the gesture actually drives. Back navigates within the app and only exits from the home screen. **Unverified on a device.**
- ~~**[P0] Scheduled notifications.**~~ **DONE 2026-09-12**, on the code side. `tauri-plugin-notification` registered and granted in capabilities; the reminder sends through the OS service when packaged and falls back to the browser API on the web, which the UI already describes honestly. The Android 13+ runtime prompt is requested at send time. **Unverified on a device.**
- **[P1] Share-target intent.** — Receive a `.json`, `.csv` or `.apkg` shared from another app.
- **[P1] Play Store submission.** — Keystore kept out of the repo, privacy policy, data-safety form declaring no collection, content rating, screenshots.
- **[P2] Android CI.** — Build the APK on a runner, so the mobile build cannot rot the way the desktop build did.

### Definition of done — partly met

- A signed APK **builds**; whether it installs and runs is **unverified**. The
  APK exists, is signed, and contains the arm64 library with the frontend
  embedded — confirmed by finding the current `dist/assets` filenames inside
  the `.so`. But no device is attached and no emulator system image is
  installed, so it has never been launched.
- A reminder fires with the app closed. **Unverified**, for the same reason.
- The Play listing is submitted. **No.** That needs a release keystore, which
  is the owner's to create and must never be committed.

What is proven: the project cross-compiles to `aarch64-linux-android`,
packages, and signs. What is not: that any of it works on hardware.

## Phase 10 — Testing suite

**Goal.** Quizzes worth taking: instant, periodic, and a 100-question sectioned
exam.

**Why it matters.** Flashcards teach recognition. Testing under constraint is
what reveals whether a word is actually known, and it is the thing a GRE
candidate is preparing for.

Design: [`docs/QUIZ-AND-EXAMS.md`](./docs/QUIZ-AND-EXAMS.md)

### Tasks

- ~~**[P0] Distractor scoring.**~~ **DONE 2026-09-12.** — `src/lib/distractors.ts`, 20 tests. Disqualifications (the answer, another inflection of it, an identical definition) are separate from scoring so no weight can rescue them. The synonym penalty is checked in both directions and by stem, because a synonym list is only as good as whichever card was written more carefully.
- ~~**[P0] Instant quiz with a scope picker.**~~ **DONE 2026-09-12.** — Due now, Still learning, Current month, Mastered, All — Due first because it is the highest-value thing available. The scope and count are remembered, so the second quiz is effectively one tap. **The old quiz picked distractors with `sample()`** — literally random — which is the trivially-passable failure the design names; it now goes through the scorer.
- ~~**[P0] Periodic tests.**~~ **DONE 2026-09-12.** — Daily 10, Weekly 25, Monthly 50. Due words first, then the period's material, then a top-up weighted toward low ease factors and words with no consecutive successes behind them (`reps`, which SM-2 resets on an "again", since there is no `lapses` field).
- ~~**[P0] 100-question sectioned exam.**~~ **DONE 2026-09-12.** — `src/lib/exam.ts` plus `src/pages/Exam.tsx`, 33 tests. Persisted on every answer; break screens show progress and never a score. Proved in a browser: seven questions in, reload, resumes on question seven with answers intact.
- ~~**[P0] Wrong answers feed the scheduler.**~~ **DONE 2026-09-12.** — In both the exam and the instant quiz. Verified in a browser that answering moves a word into the schedule.
- ~~**[P1] Full per-question review.**~~ **DONE 2026-09-12.** — A collapsed section under the exam result: every question, what you said where you were wrong, and the right answer. A score alone tells you that you got eleven wrong; this tells you which eleven.
- ~~**[P1] Test history and trend.**~~ **DONE 2026-09-12.** — Exam history on the Progress page: the last twenty scores as a bar trend, with best and latest.
- **[P2] AI-generated distractors.** — Better questions where a provider is available and the user opts in. → An enhancement; the heuristic is never removed.

### Definition of done — P0 met 2026-09-12

- ~~A 100-question exam survives the app being closed and reopened.~~ Driven in a browser, not only unit-tested.
- ~~No question has a distractor that is a synonym of its answer.~~ Enforced as a disqualification, checked by stem in both directions.
- ~~Missed words appear sooner in the flashcard schedule.~~ Both surfaces.

**Outstanding:** only the P2 items — AI-generated distractors, where a provider
is available and the user opts in. The heuristic is never removed, so this is an
enhancement rather than a dependency.

## Phase 11 — Craft and delight

**Goal.** The details that make people keep using it.

**[ADR 0006](./docs/adr/0006-fun-vs-no-gamification.md) is decided:** the
no-gamification rule stands. Fun here means craft, surprise and satisfying
feedback — not a second scoring system competing with the scheduler. The one
exception is the streak freeze, which corrects an existing mechanic rather than
adding a new one. No XP, levels, badges or comparison.

Design: [`docs/THEMES.md`](./docs/THEMES.md) ·
[`docs/WORD-ORDER.md`](./docs/WORD-ORDER.md) ·
[ADR 0006](./docs/adr/0006-fun-vs-no-gamification.md)

### Tasks

- ~~**[P0] Info dialog.**~~ **DONE 2026-09-11.** — `AboutDialog`, beside Settings in the sidebar and in the mobile More sheet. The version comes from package.json through a Vite define, so it cannot claim a version the build is not.
- ~~**[P0] README with screenshots.**~~ **DONE 2026-09-11**, in Phase 7 — `docs/screenshots/` at 390, 768 and 1280.
- ~~**[P1] Streak freeze.**~~ **DONE 2026-09-12.** — One per seven days of the run, spent automatically on a single missed day. A week away is still a break. The Dashboard says "N missed days covered" only when it happened, and there is nothing to earn, spend faster, or compare.
- **[P1] Word of the day** on the Dashboard, drawn from what is due.
- **[P1] Audio pronunciation.** — Extends the flashcard speak button that already exists.
- **[P1] Etymology and root families.** — Group by shared root; show the family while studying one. Genuinely aids retention.
- **[P1] Confusable pairs drill.** — `affect`/`effect`, `discreet`/`discrete`. → A real, repeated failure mode, and satisfying to finally nail.
- **[P2] Session recap card.** — A shareable image of a session; the deck-share plumbing already exists.
- **[P2] Empty and success state craft.**

#### Themes

- ~~**[P0] Four new themes.**~~ **DONE 2026-09-11.** — Midnight, Evergreen, Porcelain and Claret, lifted from the token blocks in [`docs/THEMES.md`](./docs/THEMES.md) by script rather than retyped, since a transcription error would have been silent. Ten themes in all.
- ~~**[P0] Automated contrast test.**~~ **DONE 2026-09-11.** — 108 assertions across ten palettes, parsed out of `globals.css` rather than copied. **It found six real legibility failures in themes that shipped months ago**, including white-on-accent at 3.21:1 in the default light theme — which is a button label. It also proved the `--border` threshold in the design doc wrong; both the doc and the test now record why.
- ~~**[P1] Grouped theme picker with palette previews.**~~ **DONE 2026-09-11.** — `ThemePicker`, grouped Automatic / Light / Dark / Accessibility. Each swatch applies the theme's own class and reads the same custom properties the app renders with, so a preview cannot drift from what it previews.

#### Word order

- ~~**[P0] `orderWords` and the `wordOrder` setting.**~~ **DONE 2026-09-11.** — `src/lib/order.ts`, pure, seed passed in. Default authored. 30 tests.
- ~~**[P0] Random means *stable*.**~~ **DONE 2026-09-11.** — Seeded by month, deck and day; FNV-1a into mulberry32, then Fisher–Yates. Verified in a browser that the order survives a reload unchanged.
- ~~**[P0] Scheduling and fairness win.**~~ **DONE 2026-09-12.** — Applied to Daily Practice, Archive listings, and the Flashcards shuffle toggle's initial state. `order-boundary.test.ts` asserts the due deck is identical across all three settings, and that quiz and search never reference the preference. **The guard found a real bug:** the due deck was in *authored* order and the shuffle toggle applied to it, so spaced repetition was being presented in the order the words were written. It is now `bySchedule` — most overdue first — and ignores the toggle.
- ~~**[P1] Fold the existing Flashcards shuffle toggle into it.**~~ **DONE 2026-09-11.** — The preference sets the toggle's initial state; the toggle stays a per-session override and never writes back.

### Definition of done — P0 met 2026-09-12

- ~~The info dialog exists and names its designer.~~
- ~~The README shows the app.~~
- ~~Ten themes, every one passing the contrast test.~~ 108 assertions.
- ~~Changing word order never changes what the scheduler shows next.~~ Asserted across all three settings, and the assertion caught the due deck not being in scheduler order at all.
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

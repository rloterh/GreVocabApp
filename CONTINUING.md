# CONTINUING.md

Handoff document. If you're picking this project up in a fresh Claude session (Fable 5.1, Sonnet, Opus, whatever), or in VS Code, or handing it to a collaborator — read this first.

## Where the project stands

- **Shipped features** — see [`CHANGELOG.md`](./CHANGELOG.md).
- **What's next, with priorities** — see [`ROADMAP.md`](./ROADMAP.md). The "Next up" section at the top names the three best things to start on.
- **How v1.0 is designed** — see [`docs/`](./docs/). Phases 6-12 have design documents and decision records; do not start one of those phases without reading its document.
- **Runs** — `npm install && npm run dev` (web, :1420) or `npm run tauri:dev` (desktop, needs Rust).

The rest of this file is *conventions*, not status — those go in the two files above so this one doesn't drift.

## Driving the app

Unit tests cannot see composition, routing, persistence across a reload, or
what the user is looking at. Several real defects in this project were invisible
to `tsc`, `cargo check` and the unit suite — including a Tauri config error that
meant the desktop app had never launched while everything was green.

`scripts/drive/` holds browser drivers for the things that need a running app.
See [`scripts/drive/README.md`](./scripts/drive/README.md). They are not wired
into `npm test` on purpose: they need a dev server, and a unit suite that
silently depends on one is worse than no unit suite.


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
- **A test that times out is usually a slow dynamic import, not a bug.** The
  CSV parser, the Anki reader and sql.js are all loaded by `await import()` at
  the point of use; the first one in a worker pays for the transform. Vitest's
  5s default was not enough on a loaded machine and produced a flake roughly one
  run in four. `testTimeout`/`hookTimeout` in `vitest.config.ts` are set high
  deliberately — they never mask a failing assertion, only a slow transform.
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

## Android: the toolchain runbook

Phase 9's first task, written down because it is the step that eats an
afternoon and because nothing about it is discoverable from an error message.

**Status: installed and building as of 2026-09-12.** Android Studio's SDK,
NDK 27.3.13750724, Temurin JDK 17, and all four Android Rust targets are
present, and a signed arm64 APK has been produced. The section below records
what this machine actually needed, including several traps.

### 1. JDK 17

Tauri's Android build needs 17 specifically; 21 has caused Gradle
incompatibilities.

```powershell
winget install --id EclipseAdoptium.Temurin.17.JDK
```

Then set `JAVA_HOME` to the install root (not `bin`) and add `%JAVA_HOME%\bin`
to `PATH`. Confirm with `java -version` in a **new** shell — winget does not
update the environment of an already-running one, which is the single most
common false start here.

### 2. Android SDK and NDK

Android Studio is the easy path and installs both:

```powershell
winget install --id Google.AndroidStudio
```

Then in Studio: **SDK Manager → SDK Platforms** → Android 14 (API 34) or newer;
**SDK Tools** → check *NDK (Side by side)*, *Android SDK Command-line Tools*,
and *Android SDK Platform-Tools*.

Command-line only, if Studio is unwanted: download `commandlinetools-win`, put
it at `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest`, then

```powershell
sdkmanager "platforms;android-34" "build-tools;34.0.0" "ndk;27.0.12077973" "platform-tools"
```

### 3. Environment

```powershell
setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
setx NDK_HOME "$env:LOCALAPPDATA\Android\Sdk\ndk\<version>"
```

`NDK_HOME` must point at the **versioned** directory, not at `ndk`. Tauri's
error when it is wrong does not say so.

### 4. Rust targets

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi \
  i686-linux-android x86_64-linux-android
```

`aarch64` is every real device; the other three are emulators and old hardware.

### 5. Initialise and run

```bash
npm run tauri android init      # generates src-tauri/gen/android/, gitignored
npm run tauri android dev       # needs a device or a running emulator
npm run tauri android build     # APK/AAB in src-tauri/gen/android/app/build/outputs/
```

`src-tauri/gen/android/` is generated output and stays gitignored. Do not edit
it by hand; anything that needs to survive belongs in `tauri.conf.json` or in
the Rust source.

### What is already done, without the toolchain

Phase 9's code-side work does not depend on any of the above and is complete:

- **Capability gating** — `src/lib/platform.ts` asks "can I watch a folder?"
  rather than "is this Android?", with a capability table in its tests. The
  watched folder is desktop-only because scoped storage makes watching a
  directory the wrong model, not because an API is missing.
- **The system back gesture** — `src/hooks/useSystemBack.ts`. Back navigates
  within the app and only exits from the home screen.
- **Notifications that fire with the app closed** — `tauri-plugin-notification`
  is wired up, including the Android 13+ runtime permission, with the browser
  API as the fallback the web build honestly admits to.

### Known gaps

- **No signing keystore.** It must be generated on the release machine and kept
  out of the repo. Losing it means never updating the listing again.
- **Nothing has run on a device.** Everything above is compiled and reasoned
  about, not observed on hardware. The definition of done for this phase is a
  signed APK on a real device, and that has not happened.
- **Share-target intent** and the Play listing itself are still open.

### What actually worked, 2026-09-12

The runbook above is the clean path. This is what this machine needed, and
every deviation is a trap worth knowing about.

**Versions that worked:** Android Studio's SDK (platform 34 and 37, build-tools
36), NDK **27.3.13750724**, JDK **17.0.20.1** (Temurin), Gradle 8.14.3.

#### 1. Do not use Android Studio's bundled JBR

It is Java **25**, and Gradle 8.14.3 fails with

```
BUG! exception in phase 'semantic analysis' … Unsupported class file major version 69
```

which says nothing about Java versions. Install a real JDK 17 and point
`JAVA_HOME` at it. Downloading the Temurin zip is far quicker than winget,
which ran for the better part of an hour here without finishing:

```bash
curl -L -o jdk17.zip "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse"
unzip jdk17.zip -d ~/jdks
```

#### 2. Android Studio does not install the NDK or the command-line tools

Both are needed and neither is there by default. Fetch
`commandlinetools-win` into `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest`,
then:

```bash
sdkmanager --licenses          # accept all
sdkmanager "ndk;27.3.13750724" "platforms;android-34" "build-tools;34.0.0"
```

NDK 29 is offered and is newer than Tauri is tested against; 27 is the safe
choice.

#### 3. `tauri android build` fails on Windows without Developer Mode

```
Failed to create a symbolic link … Creation symbolic link is not allowed for this system.
```

The Rust cross-compile **succeeds** first — only the final step, symlinking the
`.so` into `jniLibs`, fails. Enabling Developer Mode is the documented fix and
needs an administrator. Without it, copy the library and drive Gradle directly:

```bash
cp src-tauri/target/aarch64-linux-android/release/liblexicon_lib.so \
   src-tauri/gen/android/app/src/main/jniLibs/arm64-v8a/

cd src-tauri/gen/android
./gradlew assembleArm64Release \
  -PabiList=arm64-v8a -ParchList=arm64 -PtargetList=aarch64 \
  -x rustBuildArm64Release
```

The `-P` flags stop Gradle building all four ABIs when only arm64 was
compiled. `-x rustBuildArm64Release` skips the task that re-invokes Tauri —
necessary because that task runs `tauri android android-studio-script`, which
is the **dev** path and panics on a release build:

```
failed to read missing addr file …com.lexicon.app-server-addr
```

#### 4. Signing

The APK Gradle produces is unsigned. For testing:

```bash
keytool -genkeypair -keystore ~/lexicon-dev-keystore.jks -alias lexicon \
  -keyalg RSA -keysize 2048 -validity 10000

zipalign -f -p 4 app-arm64-release-unsigned.apk lexicon-arm64-signed.apk
apksigner sign --ks ~/lexicon-dev-keystore.jks --ks-key-alias lexicon lexicon-arm64-signed.apk
apksigner verify --print-certs lexicon-arm64-signed.apk
```

**The release keystore is not this one and must never be committed.** Losing
the keystore used for a Play release means never updating that listing again.

#### 5. Confirming the frontend is really in there

Tauri embeds the web assets *into the Rust library*, compressed — they are not
APK `assets/`, and grepping the `.so` for page text finds nothing. That looks
exactly like a broken build. Check for asset **filenames**, which are stored as
uncompressed keys:

```bash
for f in $(ls dist/assets | head -3); do
  grep -qa "$f" src-tauri/target/aarch64-linux-android/release/liblexicon_lib.so \
    && echo "$f FOUND"
done
```

This matters because this project has already shipped a "working" release build
whose window showed an error page.

#### Result

`lexicon-arm64-signed.apk`, 23.7 MB, signed and verified by `apksigner`,
containing `lib/arm64-v8a/liblexicon_lib.so` (20.9 MB, frontend embedded).

**It has not been installed or run on a device.** No physical device is
attached and no emulator system image is installed here, so "a signed APK
installs and runs on a real device" remains unmet. What is proven is that the
project cross-compiles, packages, and signs.

# Architecture

How Lexicon is put together, and the rules that keep it that way as it grows to
four platforms and a dozen AI providers.

## The existing shape, and why it holds up

Lexicon v0.1 established a layering that has survived every phase since:

```
src/pages/        orchestrate — no domain logic
src/components/   presentation, plus a few self-contained behaviours
src/hooks/        bind pure logic to the platform (window, timers, Tauri)
src/store/        Zustand; the source of truth; persistence via middleware
src/lib/          pure functions; no React, no stores, no ambient clock
src-tauri/        the desktop and mobile shell
```

The rule that makes it work is in `src/lib/`: **pure, injectable, testable
without a DOM**. That is why the SM-2 scheduler, the CSV parser, the Anki reader
and writer and the shortcut matcher all have real tests, and why the components
mostly do not need them.

Everything below preserves that rule. Where new work is hard to test, it is
because it touches the platform — and in those cases the pure part is split out
so the platform part stays thin enough to read.

### Dependency direction

```
pages ──> components ──> hooks ──> lib
  │            │            │
  └────────────┴────────────┴──> store ──> lib
```

- `lib` imports nothing above it. Not stores, not React.
- `store` may import `lib`.
- `hooks` bridge: they may touch `window`, `navigator`, Tauri, timers.
- Components and pages may import anything below them.

A `lib` module that needs the current time, a network client, or randomness
takes it as an argument. `schedule(rating, ef, interval, reps, now)` is the
pattern; `buildAnkiCollection(SQL, options)` is the same idea for a heavy
dependency.

## What v1.0 adds

Five new subsystems. Each gets its own directory under `src/lib/`, each is pure
where it can be, and each has exactly one place that touches the outside world.

```
src/lib/ai/           provider abstraction, detection, structured output
src/lib/vocab/        generation planning, the dedup index, user seed lists
src/lib/quiz/         question construction, distractor selection, exam state
src/lib/platform/     capability detection (is this mobile? Tauri? WebGPU?)
src/lib/migrate/      persisted-schema versioning
```

And in the shell:

```
src-tauri/src/ai_proxy.rs    HTTP to AI providers from Rust, to escape CORS
src-tauri/src/notify.rs      scheduled local notifications
src-tauri/gen/android/       generated Android project
```

### Why an AI call may go through Rust

A browser cannot call `http://127.0.0.1:11434` (Ollama) from an `https://`
or `tauri://` origin unless that server opts in with CORS headers. Ollama does
not, by default.

On desktop and mobile we are not a browser — we have a Rust process that can
make any request it likes. So the desktop and mobile builds route provider HTTP
through a Rust command, and the web build is limited to providers that permit
browser origins. One interface, two transports, chosen by capability rather
than by `#ifdef` scattered through the UI.

See [adr/0003-rust-http-transport.md](./adr/0003-rust-http-transport.md).

## Module boundaries that matter

**`src/lib/ai/` is the only place that knows a provider exists.** Today
`generate.ts` and `verify.ts` each hand-roll a `fetch` to Anthropic with its own
headers, model id and error handling. That duplication is already a liability
and becomes untenable at nine providers. Both collapse into callers of a single
`complete()` / `completeStructured()`.

**`src/lib/vocab/dedup.ts` owns the answer to "have we seen this word".**
Generation, import and user-entered lists all ask the same index the same
question. There must not be a second definition of "the same word".

**`src/store/` stays the only thing that touches `localStorage`,** and now via
the migration framework rather than directly. This is an existing rule
(CONTINUING.md principle 5); the growth in persisted state makes it load-bearing
rather than tidy.

## Rendering and layout

The app is currently desktop-shaped: a fixed 240px sidebar and a content column.
Mobile requires a second navigation shape, not a narrower version of the first.

The decision is a **single responsive shell** rather than separate mobile
components:

```
AppShell
 ├── Sidebar          lg and up
 ├── BottomTabBar     below lg, safe-area aware
 └── <main>           the page, unchanged
```

Pages do not know which navigation is showing. Anything that would need to know
is a layout bug to fix in the page, not a branch to add.

See [MOBILE.md](./MOBILE.md).

## Testing strategy as the surface grows

Current coverage: `src/lib/` and `src/store/` thoroughly, two components with
real logic, nothing else. That is the right shape and v1.0 keeps it, with two
additions:

- **Provider adapters get contract tests.** One shared suite runs against every
  provider through a stubbed transport, asserting they all normalise the same
  request and the same errors. A new provider is not done until it passes the
  same suite as the others.
- **The dedup index gets property-style tests.** Generate random word sets,
  assert no duplicate survives, assert morphological variants collapse, assert
  a removed month still blocks its words.

What stays untested, deliberately: page composition, and anything that requires
a real model. Provider tests stub the transport; they verify *our* side of the
contract, never the model's output quality.

## Non-goals

Restating, so the design is not quietly widened:

- **No backend, no accounts, no sync service.** ROADMAP.md rules these out and
  nothing in v1.0 needs them. A cloud AI provider is the user's own key talking
  to the user's own account.
- **No telemetry.** Not even anonymous. There is nowhere to send it and no one
  to read it.
- **No bundled model weights.** The in-app WebGPU option downloads on demand,
  with consent, and is never the default.

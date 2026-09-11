# ADR 0003 — Provider HTTP goes through Rust on desktop and mobile

**Status:** accepted · 2026-09-11

## Context

Local model servers are the most valuable key-free providers. Ollama listens on
`127.0.0.1:11434` and, by default, rejects requests whose `Origin` is a web page
— including the `tauri://` and `http://localhost:1420` origins the app runs
under. The user can set `OLLAMA_ORIGINS` to permit us, but requiring a shell
environment variable before the app works is not a feature, it is a support
burden.

The web build genuinely cannot get around this. The desktop and mobile builds
can: they have a Rust process that is not subject to CORS at all.

## Decision

The provider layer has two transports behind one interface:

- **`fetch`** in the browser.
- **A Rust command** (`ai_request`) on desktop and mobile, which performs the
  HTTP call and returns the response.

Selection is by capability at startup, not by branching in feature code. Callers
of `complete()` never know which is in use.

## Consequences

- Local providers work on desktop and mobile with **zero configuration**, which
  is the single biggest win available for the "no API keys" goal.
- The web build shows local providers as "available on desktop" rather than
  silently omitting them, with a note about `OLLAMA_ORIGINS` for users who want
  them in the browser.
- The Rust command is a request-forwarding primitive and must be constrained:
  an allowlist of schemes and hosts, no arbitrary URL from the frontend, and a
  size cap on responses. It is not a general-purpose proxy and must never become
  one.
- One more thing that behaves differently per platform, and therefore one more
  thing needing a test at the seam.

## Rejected

- **Telling users to set `OLLAMA_ORIGINS`.** Works, but pushes our problem onto
  them and fails silently when they skip it.
- **Bundling a proxy.** More moving parts than a single Rust command.
- **Dropping local providers on web.** They are the best answer to the actual
  requirement; degrade rather than omit.

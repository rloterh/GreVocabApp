# ADR 0001 — Providers cascade by cost to the user

**Status:** accepted · 2026-09-11

## Context

Lexicon needs a language model for generation, sentence checking and distractor
quality. Users may have: a browser with a built-in model, a local server, a
capable GPU, a paid API key, or none of these. Asking every user to paste a key
before the app is useful is the thing we are trying to avoid.

## Decision

Providers are tried in a fixed order, and the first available one wins:

1. Browser built-in (on-device, no key, no download)
2. Local server on localhost (no key)
3. In-app WebGPU model (no key, opt-in because of the download)
4. Cloud, using a key the user supplied

The ordering is **by cost to the user** — privacy, then money, then effort — not
by output quality. The app does not rank models and will not pretend to.

The user may pin a provider, which skips the cascade entirely.

## Why this order is safe to automate

Tiers 1–3 need no credential. Tier 4 *cannot run* without one the user
deliberately supplied. So an automatic cascade can never silently send a user's
data to a third party: reaching tier 4 at all requires prior, explicit setup.

That property is what makes "just use whatever is available" acceptable rather
than alarming, and it must be preserved by any future provider added here.

## Consequences

- Most users get a working app with no configuration.
- Output quality varies by whatever was detected. The provider in use is always
  named in the UI, so surprising results are attributable.
- We must maintain detection for several runtimes, and detection failures are a
  new error class (`Unreachable`).
- A provider that needs a key but is "free" — OpenRouter's free tier, Groq —
  sits in tier 4 like any other, because it still needs setup.

## Rejected

- **Quality-ranked ordering.** Requires judging models we cannot evaluate, and
  would push users toward paid providers by default.
- **Ask on first run.** A setup screen before any value is exactly the friction
  this decision removes.
- **Automatic mid-request fallback.** If the chosen provider fails, say which and
  why. Silently switching makes "why did the output change" unanswerable.

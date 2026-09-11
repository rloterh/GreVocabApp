# ADR 0002 — We do not reuse a user's AI subscription

**Status:** SUPERSEDED by [ADR 0007](./0007-authentication-strategy.md) · 2026-09-11

> **This decision record contains an error and is kept only for the record.**
> It claimed that using a user's existing AI subscription would require
> capturing their credentials, and likened it to phishing. That is wrong: tools
> like Claude Code use OAuth, where the provider authenticates the user in a
> browser and returns a scoped token, and the application never sees a
> credential. The real constraint is narrower — a provider must offer
> third-party client registration — and is stated correctly in ADR 0007.
> Nothing below should be relied on.

## Context

A requirement was stated as: connect automatically to "any AI that is connected
in the browser or installed on the app/desktop without asking for API keys".

Read literally, part of that means: if the user is signed in to ChatGPT, Claude
or Gemini in their browser, use that.

## Decision

We do not, and will not, attempt to use a user's consumer AI subscription.

## Why

There is no mechanism for it that is both possible and legitimate:

- Those subscriptions authenticate **a person to a web app**, via session
  cookies scoped to that provider's origin. There is no API, no OAuth scope, and
  no supported delegation path for a third-party program.
- Obtaining one would mean capturing the user's session cookie or login
  credentials. A vocabulary app asking for a ChatGPT password is
  indistinguishable from a phishing app, and would be right to be treated as
  one.
- Most providers' terms prohibit programmatic use of consumer subscriptions.
- Browser extensions that expose a page-level bridge to a logged-in assistant
  exist, but they are not a standard, they differ per extension, and depending
  on one would make the feature break without warning.

## What we do instead

Everything genuinely reachable without credentials, which turns out to cover
most of the intent:

- **Browser built-in AI** — an on-device model exposed by the browser itself, by
  design, to any page. No key, no account, no network.
- **Local servers** — Ollama, LM Studio, llama.cpp. The user already installed
  them; they listen on localhost and want to be used.
- **In-app WebGPU** — a model the app downloads and runs itself.

For a user on a current Chrome, or anyone running Ollama, the observable result
is the same as the original ask: the app finds AI and works, with nothing typed.

## Consequences

- A user whose only AI is a ChatGPT Plus subscription must paste an API key
  (a separate, paid thing) or install a local model. The settings UI should say
  this plainly rather than leaving them hunting for a connect button.
- We are insulated from a whole class of breakage and legal exposure.
- If a real delegation standard ever ships, it slots in as another tier-1
  provider without disturbing anything.

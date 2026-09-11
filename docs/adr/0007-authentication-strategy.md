# ADR 0007 — How Lexicon authenticates to AI

**Status:** accepted · 2026-09-11 · **supersedes [ADR 0002](./0002-no-subscription-reuse.md)**

## Why this replaces ADR 0002

ADR 0002 claimed that using a user's existing AI subscription "would mean
capturing the user's session cookie or login credentials" and compared it to
phishing. **That was wrong**, and the error mattered because it ruled out a
whole family of legitimate options.

Claude Code, the GitHub Copilot extension and similar tools do not ask for
passwords. They use **OAuth**: the app opens a browser, the user authenticates
with the provider directly, the provider hands back a scoped token. The
application never sees a credential. That is the industry-standard way to do
exactly this, and it is the opposite of phishing — OAuth exists *because*
password-sharing is unacceptable.

The genuine constraint is narrower and worth stating precisely.

## The actual constraint

OAuth requires the provider to operate a client-registration programme that a
third-party application can join. That is a per-provider business decision, not
a technical one.

| Provider | Third-party OAuth for consumer plans? |
| --- | --- |
| OpenRouter | **Yes** — a documented PKCE flow that returns a user-scoped key. Verify at spike. |
| Anthropic | Its OAuth serves first-party tooling (`ant auth login`, Claude Code). No public third-party client registration is documented. Verify at spike. |
| OpenAI | Platform keys are the documented path for third-party apps. Verify at spike. |
| Google, Mistral, Groq, others | API keys documented; OAuth status per provider. Verify at spike. |

So: **support OAuth wherever the provider offers it, and do not pretend it is
available where it is not.** The spike in Phase 6 establishes the current state
of each rather than this document asserting it from memory.

## Decision

Five ways in, in order of how little the user has to do:

| # | Route | User action | Credential |
| --- | --- | --- | --- |
| 1 | **On-device** — browser built-in AI, WebGPU | none | none |
| 2 | **Local server** — Ollama, LM Studio, llama.cpp | none (already installed) | none |
| 3 | **Installed AI CLI** — a tool already authenticated on this machine | approve once | theirs, never seen by us — [ADR 0009](./0009-installed-cli-providers.md) |
| 4 | **Connect with OAuth** — where offered | click, approve in browser | scoped token, stored in the OS keychain |
| 5 | **Paste an API key** | paste | key, stored in the OS keychain |

And, orthogonal to all of them, a sixth path for users with no programmatic AI
at all: **the prompt bridge** — [ADR 0008](./0008-prompt-bridge.md). The app
writes the prompt, the user runs it in whatever AI they already use, and pastes
the result back. No credential of any kind.

## What we still do not do

- **Read another application's stored tokens.** Claude Code's credentials on
  disk belong to Claude Code. Reading them would be credential theft regardless
  of how easy it is, and it breaks the moment that tool changes its storage.
- **Drive a logged-in web session.** Injecting into a `claude.ai` or
  `chatgpt.com` tab, or shipping a headless browser to do it, violates those
  services' terms and breaks constantly.
- **Ship our own credentials.** A bundled key is extracted within a day and
  billed to whoever owns it.

The line is ownership and consent: the user's own tools, invoked by the user's
own choice, on the user's own machine — yes. Impersonating the user to a service
that has not agreed to it — no.

## Consequences

- The "difficult API key" problem is addressed from three directions at once:
  OAuth where it exists, the user's already-authenticated local tooling, and the
  prompt bridge as a universal fallback.
- Phase 6 gains an OAuth flow and a CLI-detection task.
- Each provider's OAuth availability is a spike finding, recorded here when
  known, not guessed at now.

## The privacy point that makes most of this moot

A user studying alone on one device does not need to send anything anywhere.
Routes 1, 2 and 3 are all fully local. That is the default the cascade reaches
for first, and for most users it should be the end of the discussion.

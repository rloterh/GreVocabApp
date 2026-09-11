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

> **The spike has since run.** The table below is what was *believed* before
> it, kept because the gap between the two is the point. The verified answers
> are in **[Spike findings — OAuth per provider](#spike-findings--oauth-per-provider-2026-09-11)**
> at the end of this document, and they are what to act on.

| Provider | Third-party OAuth for consumer plans? | Spike verdict |
| --- | --- | --- |
| OpenRouter | **Yes** — a documented PKCE flow that returns a user-scoped key. Verify at spike. | **Confirmed by measurement.** |
| Anthropic | Its OAuth serves first-party tooling (`ant auth login`, Claude Code). No public third-party client registration is documented. Verify at spike. | **Understated.** Not merely undocumented — expressly prohibited, and enforced. |
| OpenAI | Platform keys are the documented path for third-party apps. Verify at spike. | Confirmed. |
| Google, Mistral, Groq, others | API keys documented; OAuth status per provider. Verify at spike. | Confirmed, and Google measured: no OAuth scope reaches text generation. |

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

## Spike findings — browser built-in AI, 2026-09-11

Measured on this machine rather than assumed. Edge and Chrome, both channels at
Chromium 152, headless and headed, on a real `https://` origin.

| Probe | Result |
| --- | --- |
| `typeof globalThis.LanguageModel` | `"function"` — **present in both browsers** |
| `window.ai` / `window.ai.languageModel` | `undefined` — the legacy shape is gone |
| `Summarizer`, `Translator`, `LanguageDetector` | present |
| `Writer`, `Rewriter` | absent |
| **`await LanguageModel.availability()`** | **`"unavailable"`** in both, both modes |
| `navigator.gpu` + `requestAdapter()` | present, adapter obtained |

### What this changes

1. **Detect with the modern shape only.** `globalThis.LanguageModel` plus
   `availability()`. Do not write a `window.ai.*` fallback; it is not there.
2. **Presence is not availability.** The API surface exists while the model is
   unusable. Any adapter that treats "the global is defined" as "I can use
   this" will fail at the first request. `availability()` is mandatory.
3. **The browser provider cannot be the primary path.** It returned
   `"unavailable"` — not `"downloadable"` — so on this configuration the model
   cannot be provisioned at all. Why is not determinable from a page probe:
   plausible causes are hardware or free-disk gating, enterprise policy, or
   regional rollout. The honest position is that a meaningful share of users
   will get nothing here.
4. **WebGPU is viable**, which makes the in-app model a real fallback on this
   class of machine rather than a theoretical one.

### Consequences for the plan

The browser provider drops from P1 to P2. It stays worth building — it is free
and perfectly private when it works — but the weight of "AI with no setup"
shifts onto the routes that were measured to work: a **local server**, an
**installed CLI**, and the **prompt bridge**, which needs nothing at all.

This is the spike doing its job. Designing the cascade around a browser model
that is unavailable on the developer's own machine would have produced a
first-run experience that quietly did nothing.

## The privacy point that makes most of this moot

A user studying alone on one device does not need to send anything anywhere.
Routes 1, 2 and 3 are all fully local. That is the default the cascade reaches
for first, and for most users it should be the end of the discussion.

## Spike findings — OAuth per provider, 2026-09-11

The table under "The actual constraint" above said *verify at spike* against
every row. This is that verification. Where a claim could be measured it was
measured; where only documentation exists, the source is named and the evidence
is labelled as documentary rather than tested.

### Result

| Provider | Third-party OAuth for API access? | Evidence |
| --- | --- | --- |
| **OpenRouter** | **Yes — and it works.** | **Measured.** Public-client PKCE, no client registration, loopback callback accepted. |
| Anthropic | **No — and explicitly prohibited.** | Documented, verbatim, in Anthropic's own terms. |
| OpenAI | No. | Documented. API keys are the stated path for third-party apps. |
| Google (Gemini) | No — not for text generation. | **Measured** against the live API discovery document. |
| Together | No — identity only. | **Measured.** OIDC exists; its scopes carry no API access. |
| Groq, Mistral, DeepSeek | No. | No discovery metadata published; API-key-only documentation. |

**One provider out of seven.** The plan assumed OAuth would be a broadly
available route, and it is not. That is the finding.

### OpenRouter — measured, and the one to build

Two probes, against the live service:

1. `GET https://openrouter.ai/auth?callback_url=http://localhost:51423/callback&code_challenge=...&code_challenge_method=S256`
   — sent with **no `client_id` at all** — returned `200` and carried the
   request through to OpenRouter's own sign-in page with every parameter
   preserved. No `invalid_client`, no `unauthorized_client`.
2. `POST https://openrouter.ai/api/v1/auth/keys` with a deliberately invalid
   code and **no client secret** returned
   `{"error":{"message":"Invalid code","code":400}}` — it objected to the code,
   not to the caller.

Both matter for a *distributed desktop app*, which is the case that usually
breaks OAuth: there is no server to hold a client secret, and shipping one in
the binary means shipping it to everybody. A public-client PKCE flow with no
registration and a loopback redirect is exactly the shape that works here.

The flow returns a **user-controlled API key**, not an expiring access token, so
there is no refresh path to build — it goes into the keychain alongside a pasted
key and everything downstream is unchanged. Authorization codes expire in ten
minutes.

The leverage is that OpenRouter is a gateway: one integration reaches Claude,
GPT, Gemini and a long tail of open models. The single provider that says yes
happens to be the one that makes the other six reachable anyway.

### Anthropic — prohibited, in writing

From [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance),
under **Authentication and credential use**, verbatim:

> **Developers** building products or services that interact with Claude's
> capabilities, including those using the Agent SDK, should use API key
> authentication through Claude Console or a supported cloud provider.
> Anthropic does not permit third-party developers to offer Claude.ai login
> into their own applications, or to route requests through Free, Pro, or Max
> plan credentials on behalf of their users. Moreover, developers may not
> collect, store, or intermediate Claude.ai credentials or session tokens —
> sign-in to a Claude account must complete through Anthropic's own flow.

This is a stronger answer than "undocumented". The door is not shut by
omission; it is closed deliberately, and the same source notes that Anthropic
"reserves the right to take measures to enforce these restrictions and may do so
without prior notice."

**This does not vindicate [ADR 0002](./0002-no-subscription-reuse.md).** ADR 0002
reached a roughly correct conclusion for Anthropic through a wrong argument —
that reusing a subscription necessarily means capturing credentials, which it
likened to phishing. It does not, as this ADR established. The barrier is a
business decision, not a technical or ethical property of OAuth, and the
difference is not pedantic: the wrong reason ruled out OpenRouter too, which
turned out to be the one provider where the whole thing works.

### The same page validates the installed-CLI route

Worth recording, because [ADR 0009](./0009-installed-cli-providers.md) designed
that route before this text was read, and it lands inside the permitted envelope
rather than near its edge. Anthropic permits running Claude Code within another
product where "each end user must authenticate with their own Anthropic API key,
Claude subscription plan credentials, or 3P inference provider credential", with
usage "billed directly to the end user", provided the binary "must not be
modified" and the integrator does not "pay for, resell, or intermediate Claude
usage on their end users' behalf".

Lexicon shells out to the user's own unmodified `claude` on PATH, sends a prompt
on stdin, and never sees or stores a credential. That is the permitted shape.
Three conditions bind us going forward:

- **Never modify or wrap the binary's authentication.** Invoke it as published.
- **Never intermediate billing.** No shared key, no proxy, no reselling.
- **Trademark.** The terms allow plain text saying the product runs Claude Code,
  but forbid using the Claude Code or Anthropic name or logo "as part of your
  own product, feature, or company name, in your own logo, or in a way that
  suggests Anthropic built, endorses, or is partnered with" it. Today's UI is
  compliant: `ai_cli.rs` labels the *detected tool* "Claude Code" inside a list
  headed "Installed AI tools", which is a plain statement of fact. A feature
  named "Claude Mode", or that logo in the sidebar, would not be.

### Google — measured, not inferred

The OAuth quickstart is genuinely ambiguous about which methods accept user
credentials, so the question went to the live discovery document at
`https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta`:

- `models.generateContent`, `models.streamGenerateContent`, `models.countTokens`
  and `models.embedContent` declare **no OAuth scopes at all**.
- Exactly **one** OAuth scope appears anywhere in the 375 KB document:
  `devstorage.read_only`, on file and cache listing methods.
- `generative-language.retriever` — the scope the OAuth quickstart names — does
  not occur anywhere in the current API surface.

So OAuth is not a route to text generation on the Gemini Developer API. An API
key is. Reading only the quickstart would have produced the opposite answer.

### Together — an OAuth server that cannot help

`https://api.together.xyz/.well-known/openid-configuration` exists and is real
(issuer `https://ums.together.ai`). It is still a no, for three independent
reasons, any one of which would be sufficient:

- `scopes_supported` is `openid`, `email`, `profile`, `groups`. **Identity
  only** — no scope grants inference.
- No `registration_endpoint`, and `POST /register` returns 404: no dynamic
  client registration, so a third party has no way to obtain a `client_id`.
- A full PKCE authorize with an unregistered `client_id` returns a `302` to
  `https://localhost:4000/signin` — an internal host leaking into a public
  response. Not a flow an external client can complete.

### A methodology note, because it nearly produced a wrong row

`https://platform.openai.com/.well-known/oauth-authorization-server` returns
**HTTP 200**. It is not OAuth metadata — it is the documentation site's
single-page-app shell, served for any path. Read as a status code it says "this
endpoint exists"; read as a body it is `<!doctype html>`.

This is the same failure mode as the release build earlier in this project that
produced a running window displaying an error page: a green signal measured at
the wrong layer. **Check the body, not the status.** The `404` from
`api.openai.com` for the same path is the honest answer.

### Consequences for the plan

1. **Build OpenRouter OAuth.** Measured working, no registration or client
   secret, returns a key the existing keychain already handles, and reaches most
   models through one integration. A concrete task now rather than a blocked one.
2. **Drop "OAuth connect" as a general provider feature.** Six of seven
   providers cannot offer it. A generic "Sign in with..." affordance would
   advertise something that exists in exactly one place. It becomes an
   OpenRouter-specific button.
3. **Anthropic's row is closed permanently, not pending.** Do not revisit it
   without new published terms, and do not let it be implemented quietly.
4. **The prompt bridge and the installed CLIs carry more weight than planned.**
   With OAuth available at one provider and the browser model unavailable (the
   earlier spike), the routes needing no credential do most of the work of "AI
   without setup". Both are already built. That is the cascade paying off.
5. **No change to the keychain work.** OpenRouter returns an API key, so
   Phase 6 P1's storage is already exactly what it needs.

# AI providers

How Lexicon gets a language model, ideally without asking anyone for an API key.

## The problem, stated honestly

The goal is "connect to whatever AI the user already has". Almost all of it is
achievable; the design is only sound if we are precise about *how* each route
works and where the one real boundary lies.

| Ask | Reality |
| --- | --- |
| Use an on-device model built into the browser | **Yes.** Chrome and Edge ship a built-in model behind a JS API. No key, no network. |
| Use a local server the user is already running | **Yes.** Ollama, LM Studio and llama.cpp expose HTTP on localhost. No key. CORS is the obstacle and the desktop build bypasses it. |
| Use an AI CLI already installed and signed in on the machine | **Yes**, on desktop, with consent. We invoke the tool; it authenticates itself. [ADR 0009](./adr/0009-installed-cli-providers.md) |
| Sign in with the provider, no key typed | **At OpenRouter, and nowhere else.** Measured across seven providers: only OpenRouter runs a PKCE flow open to an unregistered public client. Anthropic expressly prohibits third-party Claude.ai login; Google's OAuth reaches no text-generation method; the rest publish no third-party flow. It is not credential-sharing where it exists — the browser authenticates the user and hands back a key. [ADR 0007](./adr/0007-authentication-strategy.md) |
| Run a model inside the app itself | **Yes.** WebGPU. No key, offline, but a multi-gigabyte download. |
| Use the user's own cloud account via a pasted key | **Yes.** What the app does today for Anthropic. |
| Use any AI at all, with no credential of any kind | **Yes** — the prompt bridge. The app writes the prompt, the user runs it in whatever AI they already have open, and pastes the result back. [ADR 0008](./adr/0008-prompt-bridge.md) |
| Read another app's stored token, or drive a logged-in web session | **No.** Not because it is hard, but because it is credential theft and a terms violation respectively. [ADR 0007](./adr/0007-authentication-strategy.md) |

The line is **ownership and consent**: the user's own tools, invoked by the
user's own choice, on the user's own machine. Everything above that line is in
scope; impersonating the user to a service that has not agreed to it is not.

For a user on a current Chrome, or running Ollama, or with Claude Code
installed, or with any chat AI open in a tab — which is most people — the app
works with nothing typed.

## The cascade

Providers are tried in order of *how little they cost the user* — privacy first,
then money, then effort. The first one that reports itself available wins, and
the choice is remembered.

```
1. Browser built-in        on-device, no key, no network, no download
2. Local server            no key, localhost only
                           Ollama · LM Studio · llama.cpp · Jan · LocalAI
3. Installed AI CLI        no key; the tool authenticates itself
                           opt-in per tool, desktop only        [ADR 0009]
4. In-app WebGPU model     no key, offline after a one-time download (opt-in)
5. Connected by OAuth      no key typed; the returned key goes to the keychain
                           OpenRouter only — measured           [ADR 0007]
6. Cloud, user's own key   OpenAI · Anthropic · Google · Mistral · Groq ·
                           OpenRouter · DeepSeek · Together · any
                           OpenAI-compatible endpoint

   and, outside the cascade entirely:
   Prompt bridge           no credential at all; the user runs the prompt
                           in whatever AI they already use      [ADR 0008]
```

**Tiers 1–4 require no credential; tiers 5 and 6 cannot run until the user has
deliberately connected an account.** That is the safety property that makes an
automatic cascade acceptable: the app cannot silently send a user's vocabulary
anywhere, because it has no way to authenticate to a remote service unless the
user set one up.

Two tiers are opt-in despite needing no key: the WebGPU model, because a 1–4 GB
download is not something to start on someone's behalf, and installed CLIs,
because spending a user's subscription quota without asking is not acceptable
even when it is technically possible.

The user can pin any provider explicitly and the cascade is skipped.

### What "available" means

Detection is a capability probe with a short timeout, cached for the session:

| Provider | Probe | Notes |
| --- | --- | --- |
| Browser built-in | `typeof globalThis.LanguageModel === "function"`, then `await LanguageModel.availability()` | **Measured 2026-09-11:** the global is present in Edge and Chrome 152 but `availability()` returns `"unavailable"` on this machine. Presence is not availability — always call it. The legacy `window.ai.*` shape is gone; do not implement it. |
| Ollama | `GET /api/tags` on `127.0.0.1:11434` | Lists installed models. Blocked by CORS from a browser origin unless the user sets `OLLAMA_ORIGINS`; fine from Rust. |
| LM Studio | `GET /v1/models` on `127.0.0.1:1234` | OpenAI-compatible. Serves CORS more liberally, but do not rely on it. |
| llama.cpp | `GET /v1/models` on `127.0.0.1:8080` | OpenAI-compatible. |
| WebGPU | `navigator.gpu` present and an adapter obtainable | Presence is not sufficient; request an adapter. |
| Installed CLI | The binary is on `PATH`, plus a cheap `--version` | Detected but never used until the user enables that tool. [ADR 0009](./adr/0009-installed-cli-providers.md) |
| OAuth (OpenRouter) | A key obtained through the connect flow is stored | The flow returns a **user-controlled API key, not an expiring token**, so there is no refresh to perform — treat it exactly like a pasted key and prompt to reconnect on `Unauthorized`. |
| Cloud | A key exists in settings for that provider | No network probe. Do not spend the user's money to answer "are you configured". |

> **Spike result, 2026-09-11.** The browser built-in model was `"unavailable"`
> on both Edge and Chrome here, headless and headed. The API is worth
> supporting — free and fully private when it works — but it cannot be the
> path that makes the app work out of the box. That weight falls on local
> servers, installed CLIs and the prompt bridge. Details in
> [ADR 0007](./adr/0007-authentication-strategy.md).

Probes run in parallel with a ~1.5s budget, and the result is cached until
settings change. A cold start must not block the UI: generation entry points
show "finding a model…" and the settings screen shows the full detected list.

## The provider interface

One interface, nine or more implementations, of which most share a single
OpenAI-compatible adapter.

```ts
interface Provider {
  readonly id: ProviderId;
  readonly label: string;
  readonly tier: 1 | 2 | 3 | 4 | 5 | 6;
  /** Cheap, cached, must not throw. */
  detect(): Promise<Availability>;
  capabilities(): Capabilities;
  complete(req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse>;
  completeStructured<T>(
    req: StructuredRequest<T>,
    signal?: AbortSignal,
  ): Promise<T>;
}
```

`capabilities()` is what lets the rest of the app stop caring which provider is
in use:

```ts
interface Capabilities {
  structuredOutput: "schema" | "tool" | "grammar" | "prompt-only";
  maxOutputTokens: number;
  streaming: boolean;
  /** True for tiers 1-4: nothing leaves the machine. Drives the privacy badge. */
  onDevice: boolean;
  /** Rough, for warning before a 90-word generation on a tiny local model. */
  contextTokens: number;
}
```

### Structured output is the hard part

Every feature that matters — generating vocabulary, checking sentences, building
quiz distractors — needs reliable JSON. Every provider does that differently:

| Provider | Mechanism |
| --- | --- |
| Anthropic | tool with `strict: true` (what the app already does) |
| OpenAI & compatible | `response_format: { type: "json_schema", strict: true }` |
| Ollama | `format` accepting a JSON schema |
| llama.cpp | GBNF grammar |
| Browser built-in | a response-constraint option taking a JSON schema |
| WebLLM | grammar-backed `response_format` |
| Anything older | nothing — prompt and pray |

`src/lib/ai/structured.ts` normalises this: callers hand over a JSON schema and
a Zod-style validator, and the module picks the strongest mechanism the provider
supports. The bottom rung is a **prompt-and-repair loop**: ask for JSON, attempt
to parse, and on failure send the parse error back once for correction before
giving up. That loop is the reason a weak local model is usable at all.

Validation runs regardless of mechanism. A provider claiming strict schema
support is not a reason to skip checking — and for vocabulary the result goes
through `parseVocabMonth` afterwards anyway, exactly as an imported file does.

### Errors

One taxonomy, so the UI can respond sensibly no matter who failed:

```
AiError
 ├── NotConfigured      no provider available at all → offer setup
 ├── Unauthorized       bad or expired key → point at settings
 ├── RateLimited        includes retryAfter when the provider says
 ├── ContextExceeded    ask for fewer words / a smaller batch
 ├── Refused            safety refusal, with the provider's reason
 ├── Unreachable        localhost server stopped, network down
 └── Malformed          structured output failed even after repair
```

Each maps to a message a user can act on. `Unreachable` on a local provider
should offer to re-run detection, because the usual cause is Ollama not running
yet.

## Consent and privacy

- Tiers 1–3 carry an **"on-device"** badge wherever a model is named. Nothing
  leaves the machine.
- Tier 4 requires the user to add a key, which is itself the consent. Before the
  **first** request to a newly configured cloud provider, a one-time dialog
  states plainly what is sent: the topic, the word count, and the list of words
  to avoid repeating. No progress data, no sentences, no settings.
- Keys move out of `localStorage` into OS-backed secure storage on desktop and
  mobile (Tauri's keyring/stronghold). The web build keeps `localStorage` and
  says so, because there is nowhere better in a browser.
- Sentence verification already sends user-written sentences to a provider. With
  a local provider selected, it stops leaving the machine — a genuine privacy
  improvement worth surfacing in the UI.

## Migration from what exists today

`generate.ts` and `verify.ts` currently each hold their own `fetch`, headers,
model id and error handling for Anthropic. Both become thin callers:

```ts
// before: ~60 lines of fetch, headers, tool schema, error mapping
// after:
const month = await ai.completeStructured({
  schema: VOCAB_SCHEMA,
  system: VOCAB_SYSTEM,
  prompt: buildPrompt(options),
});
```

The Anthropic-specific parts move into `providers/anthropic.ts` unchanged in
behaviour — same strict tool, same browser-access header — so the existing 48
generator tests keep their meaning and are re-pointed at the new seam.

## Deliberately not doing

- **No provider ranking by quality.** The app does not know which model is
  better and will not pretend to. Order is by cost to the user, not by taste.
- **No automatic fallback mid-request.** If the selected provider fails, the
  user is told which one and why. Silently retrying on a different model would
  make "why did the words change" unanswerable.
- **No key sharing, no proxy, no bundled credentials.** A shared key would be
  extracted from the bundle within a day and billed to whoever owned it.
- **No streaming in v1.0.** Generation is a single structured response;
  streaming buys nothing for JSON that must be validated whole. Revisit if a
  chat-style feature ever lands.

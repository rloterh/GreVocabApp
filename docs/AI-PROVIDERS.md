# AI providers

How Lexicon gets a language model, ideally without asking anyone for an API key.

## The problem, stated honestly

The goal is "connect to whatever AI the user already has". That splits into one
thing that is easy, one that is fiddly, and one that is **impossible** — and the
design is only sound if we are clear about which is which.

| Ask | Reality |
| --- | --- |
| Use an on-device model built into the browser | **Possible.** Chrome and Edge ship a built-in model behind a JS API. No key, no network. |
| Use a local server the user is already running | **Possible.** Ollama, LM Studio and llama.cpp all expose HTTP on localhost. No key. CORS is the obstacle, and the desktop build can bypass it. |
| Run a model inside the app itself | **Possible.** WebGPU + WebLLM. No key, works offline, but a multi-gigabyte download. |
| Use the user's own cloud account via a key they paste | **Possible.** This is what the app does today for Anthropic. |
| **Silently reuse the user's ChatGPT Plus / Claude Pro / Gemini Advanced subscription** | **Not possible.** There is no API for it. Those subscriptions authenticate a person to a web app, not a third-party program. Doing it would mean taking their login credentials, which is exactly what a vocabulary app must never do. |

That last row is worth stating plainly because it is the natural reading of
"auto-connect to any AI that is connected in the browser". What the app *can*
do — and will — is find every source of AI that is genuinely reachable without
credentials, and use it before ever asking for a key. For most users on a
current Chrome, or anyone running Ollama, that means the app just works.

See [adr/0002-no-subscription-reuse.md](./adr/0002-no-subscription-reuse.md).

## The cascade

Providers are tried in order of *how little they cost the user* — privacy first,
then money, then effort. The first one that reports itself available wins, and
the choice is remembered.

```
1. Browser built-in        on-device, no key, no network, no download
2. Local server            no key, no network beyond localhost
                           Ollama · LM Studio · llama.cpp · Jan · LocalAI
3. In-app WebGPU model     no key, offline after a one-time download (opt-in)
4. Cloud, user's own key   OpenAI · Anthropic · Google · Mistral · Groq ·
                           OpenRouter · DeepSeek · Together · any
                           OpenAI-compatible endpoint
```

**Nothing in tiers 1–3 requires a credential, and nothing in tier 4 can run
without the user having pasted one.** That is the safety property that makes an
automatic cascade acceptable: the app cannot silently send a user's vocabulary
to a third party, because it has no way to authenticate to one unless the user
set it up.

Tier 3 is opt-in despite needing no key, because a 1–4 GB download is not
something to start on the user's behalf.

The user can pin any provider explicitly and the cascade is skipped.

### What "available" means

Detection is a capability probe with a short timeout, cached for the session:

| Provider | Probe | Notes |
| --- | --- | --- |
| Browser built-in | `LanguageModel.availability()` (and the older `window.ai.*` shape) | Returns available / downloadable / unavailable. **API surface must be verified in the spike** — this area has changed repeatedly and is partly origin-trial gated. |
| Ollama | `GET /api/tags` on `127.0.0.1:11434` | Lists installed models. Blocked by CORS from a browser origin unless the user sets `OLLAMA_ORIGINS`; fine from Rust. |
| LM Studio | `GET /v1/models` on `127.0.0.1:1234` | OpenAI-compatible. Serves CORS more liberally, but do not rely on it. |
| llama.cpp | `GET /v1/models` on `127.0.0.1:8080` | OpenAI-compatible. |
| WebGPU | `navigator.gpu` present and an adapter obtainable | Presence is not sufficient; request an adapter. |
| Cloud | A key exists in settings for that provider | No network probe. Do not spend the user's money to answer "are you configured". |

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
  readonly tier: 1 | 2 | 3 | 4;
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
  /** True for tiers 1-3. Drives the privacy badge in the UI. */
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

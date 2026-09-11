/**
 * The one interface every AI provider implements.
 *
 * Before this existed, `generate.ts` and `verify.ts` each carried their own
 * fetch, headers, model id and error handling for Anthropic. Adding a second
 * provider would have meant a third copy. Everything that talks to a model now
 * goes through `Provider`.
 *
 * See docs/AI-PROVIDERS.md.
 */

/** Every provider we can talk to. Ids are stable and persisted. */
export type ProviderId =
  | "browser"
  | "ollama"
  | "lmstudio"
  | "llamacpp"
  | "webgpu"
  | "cli"
  | "anthropic"
  | "openai"
  | "google"
  | "groq"
  | "openrouter"
  | "custom";

/**
 * Cost to the user, not quality. Lower tiers are tried first.
 * See docs/adr/0001-provider-cascade.md.
 */
export type ProviderTier = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Whether a provider can be used right now.
 *
 * `unavailable` and `needs-setup` are deliberately distinct: the first means
 * "this will never work here", the second means "you could make this work".
 * Only the second is worth showing the user a button for.
 */
export type Availability =
  | "available"
  | "downloadable"
  | "needs-setup"
  | "unavailable";

export interface Capabilities {
  /** The strongest way this provider can be made to return valid JSON. */
  structuredOutput: "schema" | "tool" | "grammar" | "prompt-only";
  maxOutputTokens: number;
  /** Rough, for warning before a 90-word request on a small local model. */
  contextTokens: number;
  /** True when nothing leaves the machine. Drives the privacy badge. */
  onDevice: boolean;
}

export interface ChatRequest {
  /** Instructions that are not the task itself. */
  system?: string;
  prompt: string;
  maxOutputTokens?: number;
  /** Omitted by default: providers disagree, and vocabulary wants consistency. */
  temperature?: number;
  signal?: AbortSignal;
}

export interface ChatResponse {
  text: string;
  /** Which provider actually answered, for attribution in the UI. */
  provider: ProviderId;
  /** Present where the provider reports it. Never fabricated. */
  usage?: { inputTokens?: number; outputTokens?: number };
}

/** A JSON Schema. Kept loose on purpose — every provider wants it slightly differently. */
export type JsonSchema = Record<string, unknown>;

export interface StructuredRequest<T> extends ChatRequest {
  /** Used as a tool name where the provider needs one. Must be identifier-safe. */
  name: string;
  schema: JsonSchema;
  /**
   * Throws with a readable message if the parsed value is wrong.
   *
   * Always runs, whatever the provider claimed about strict schema support.
   * A provider saying it enforced a schema is not a reason to skip checking —
   * and the message it throws is what gets fed back in the repair attempt.
   */
  validate: (value: unknown) => T;
}

export interface Provider {
  readonly id: ProviderId;
  /** Shown in the UI. "Ollama (llama3.2)" rather than "ollama". */
  readonly label: string;
  readonly tier: ProviderTier;

  /**
   * Cheap, cached by the registry, and must never throw — a provider that
   * explodes during detection would take the whole cascade with it.
   */
  detect(): Promise<Availability>;

  capabilities(): Capabilities;

  complete(req: ChatRequest): Promise<ChatResponse>;

  /** Returns validated `T`, or throws `AiError`. */
  completeStructured<T>(req: StructuredRequest<T>): Promise<T>;
}

/** What the user configured for one provider. Secrets are not stored here. */
export interface ProviderSettings {
  /** For OpenAI-compatible endpoints and local servers. */
  baseUrl?: string;
  /** The model id to request. Provider-specific. */
  model?: string;
  /** Set once the user has agreed to this provider sending data off-device. */
  consentedAt?: string;
  /** Explicitly turned on by the user, for providers that need opting into. */
  enabled?: boolean;
}

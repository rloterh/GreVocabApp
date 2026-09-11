/**
 * Which provider answers, and what happens when none can.
 *
 * The registry owns three things the adapters deliberately do not: building
 * them from user settings, probing them in parallel, and choosing one.
 *
 * Order is by cost to the user — privacy, then money, then effort — never by
 * guessed quality. See docs/adr/0001-provider-cascade.md.
 */

import { AiError } from "./errors";
import { AnthropicProvider } from "./providers/anthropic";
import { OpenAiCompatibleProvider } from "./providers/openai-compatible";
import { fetchTransport, type Transport } from "./transport";
import type {
  Availability,
  Provider,
  ProviderId,
  ProviderSettings,
  StructuredRequest,
  ChatRequest,
  ChatResponse,
} from "./types";

/** How long the whole detection sweep may take before we give up on stragglers. */
export const DETECT_BUDGET_MS = 1_500;

/** Secrets, passed in rather than read, so this module never touches storage. */
export interface ProviderSecrets {
  anthropicApiKey?: string | null;
  openaiApiKey?: string | null;
  groqApiKey?: string | null;
  openrouterApiKey?: string | null;
  customApiKey?: string | null;
}

export interface RegistryConfig {
  transport?: Transport;
  /** Per-provider configuration: base URL, model, enabled. */
  providers?: Partial<Record<ProviderId, ProviderSettings>>;
  secrets?: ProviderSecrets;
  /** When set, the cascade is skipped and this provider is used. */
  pinned?: ProviderId | null;
}

/** Defaults that make a provider usable without the user configuring anything. */
const LOCAL_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  ollama: { baseUrl: "http://127.0.0.1:11434/v1", model: "llama3.2" },
  lmstudio: { baseUrl: "http://127.0.0.1:1234/v1", model: "local-model" },
  llamacpp: { baseUrl: "http://127.0.0.1:8080/v1", model: "local-model" },
};

export class ProviderRegistry {
  private readonly transport: Transport;
  private readonly config: RegistryConfig;
  private cache: Map<ProviderId, Availability> | null = null;

  constructor(config: RegistryConfig = {}) {
    this.config = config;
    this.transport = config.transport ?? fetchTransport;
  }

  /** Every provider we could use, in cascade order. */
  list(): Provider[] {
    const settings = this.config.providers ?? {};
    const secrets = this.config.secrets ?? {};
    const providers: Provider[] = [];

    // Tier 2 — local servers. No key, and the defaults are the standard ports,
    // so a user running Ollama needs to configure nothing at all.
    for (const id of ["ollama", "lmstudio", "llamacpp"] as const) {
      const defaults = LOCAL_DEFAULTS[id];
      providers.push(
        new OpenAiCompatibleProvider(
          {
            id,
            label: LABELS[id],
            tier: 2,
            baseUrl: settings[id]?.baseUrl ?? defaults.baseUrl,
            model: settings[id]?.model ?? defaults.model,
            requiresKey: false,
            onDevice: true,
            // Local runtimes vary; the repair loop covers those that do not
            // honour a schema, so claiming support would only cause failures.
            supportsJsonSchema: false,
            contextTokens: 8_000,
          },
          this.transport,
        ),
      );
    }

    // Tier 6 — cloud, each needing the user's own key.
    if (secrets.anthropicApiKey) {
      providers.push(
        new AnthropicProvider(
          {
            apiKey: secrets.anthropicApiKey,
            model: settings.anthropic?.model,
          },
          this.transport,
        ),
      );
    }
    for (const id of ["openai", "groq", "openrouter"] as const) {
      const key = secrets[`${id}ApiKey` as keyof ProviderSecrets];
      if (!key) continue;
      providers.push(
        new OpenAiCompatibleProvider(
          {
            id,
            label: LABELS[id],
            tier: 6,
            baseUrl: settings[id]?.baseUrl ?? CLOUD_BASE_URLS[id],
            model: settings[id]?.model ?? CLOUD_DEFAULT_MODELS[id],
            apiKey: key,
            requiresKey: true,
            onDevice: false,
            supportsJsonSchema: id !== "openrouter",
          },
          this.transport,
        ),
      );
    }

    // A user-supplied OpenAI-compatible endpoint.
    const custom = settings.custom;
    if (custom?.baseUrl) {
      providers.push(
        new OpenAiCompatibleProvider(
          {
            id: "custom",
            label: "Custom endpoint",
            tier: 6,
            baseUrl: custom.baseUrl,
            model: custom.model ?? "local-model",
            apiKey: secrets.customApiKey ?? undefined,
            requiresKey: Boolean(secrets.customApiKey),
            onDevice: isLoopback(custom.baseUrl),
            supportsJsonSchema: false,
          },
          this.transport,
        ),
      );
    }

    return providers.sort((a, b) => a.tier - b.tier);
  }

  /**
   * Probe everything at once.
   *
   * Parallel and time-boxed: a local server that is not running takes a whole
   * connection timeout to say so, and three of those in series would be a
   * visible stall on every cold start. Stragglers are reported unavailable
   * rather than waited for.
   */
  async detectAll(force = false): Promise<Map<ProviderId, Availability>> {
    if (this.cache && !force) return this.cache;

    const providers = this.list();
    const results = await Promise.all(
      providers.map(async (provider) => {
        const availability = await Promise.race([
          provider.detect().catch((): Availability => "unavailable"),
          timeout<Availability>(DETECT_BUDGET_MS, "unavailable"),
        ]);
        return [provider.id, availability] as const;
      }),
    );

    this.cache = new Map(results);
    return this.cache;
  }

  /** Forget cached detection. Call when settings change. */
  invalidate(): void {
    this.cache = null;
  }

  /**
   * The provider to use, or an error explaining that there is none.
   *
   * A pinned provider is used even if detection is pessimistic about it — the
   * user asked for it explicitly, and a wrong "unavailable" should not override
   * an instruction.
   */
  async select(): Promise<Provider> {
    const providers = this.list();

    if (this.config.pinned) {
      const pinned = providers.find((p) => p.id === this.config.pinned);
      if (pinned) return pinned;
      throw AiError.notConfigured(
        `${LABELS[this.config.pinned] ?? this.config.pinned} is selected in Settings but is not configured.`,
      );
    }

    const availability = await this.detectAll();
    const usable = providers.find(
      (p) => availability.get(p.id) === "available",
    );
    if (usable) return usable;

    throw AiError.notConfigured(
      describeNothingAvailable(providers, availability),
    );
  }

  async complete(req: ChatRequest): Promise<ChatResponse> {
    return (await this.select()).complete(req);
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<T> {
    return (await this.select()).completeStructured(req);
  }
}

const LABELS: Record<string, string> = {
  ollama: "Ollama",
  lmstudio: "LM Studio",
  llamacpp: "llama.cpp",
  anthropic: "Anthropic",
  openai: "OpenAI",
  groq: "Groq",
  openrouter: "OpenRouter",
  custom: "Custom endpoint",
  browser: "Browser built-in",
  webgpu: "In-app model",
  cli: "Installed AI tool",
  google: "Google",
};

const CLOUD_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

const CLOUD_DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini",
  groq: "llama-3.3-70b-versatile",
  openrouter: "openrouter/auto",
};

function isLoopback(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/i.test(url);
}

function timeout<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/**
 * Say what would make this work, rather than only that it does not.
 *
 * "No AI provider is available" leaves a user with nowhere to go. Naming the
 * nearest fix — a key that is missing, a server that is not running — is the
 * difference between a dead end and a next step.
 */
function describeNothingAvailable(
  providers: Provider[],
  availability: Map<ProviderId, Availability>,
): string {
  const needsSetup = providers.filter(
    (p) => availability.get(p.id) === "needs-setup",
  );
  if (needsSetup.length > 0) {
    return `No AI is ready. ${needsSetup.map((p) => p.label).join(" and ")} just ${needsSetup.length === 1 ? "needs" : "need"} a key in Settings.`;
  }
  return (
    "No AI is available. You can run a local model such as Ollama, add an API " +
    "key in Settings, or use Generate elsewhere to run the prompt in any AI " +
    "you already have open."
  );
}

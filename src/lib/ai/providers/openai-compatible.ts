/**
 * One adapter for every OpenAI-shaped endpoint.
 *
 * OpenAI, Groq, OpenRouter, Together, DeepSeek, LM Studio, llama.cpp, Jan and
 * any custom base URL all speak `/v1/chat/completions`. They differ in the base
 * URL, whether a key is needed, and whether strict JSON schema is supported —
 * all configuration, not code.
 *
 * This is the highest-leverage file in the provider layer.
 */

import { AiError, errorFromStatus } from "../errors";
import { parseAndValidate, withRepair, withSchemaInstruction } from "../structured";
import { retryAfterSeconds, type Transport } from "../transport";
import type {
  Availability,
  Capabilities,
  ChatRequest,
  ChatResponse,
  Provider,
  ProviderId,
  StructuredRequest,
} from "../types";

export interface OpenAiCompatibleConfig {
  id: ProviderId;
  label: string;
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  baseUrl: string;
  model: string;
  /** Absent for local servers, which want no key. */
  apiKey?: string;
  /** Local servers need no key; cloud ones are unusable without one. */
  requiresKey: boolean;
  onDevice: boolean;
  /** Whether this endpoint honours `response_format: json_schema`. */
  supportsJsonSchema: boolean;
  maxOutputTokens?: number;
  contextTokens?: number;
  /** Extra headers, e.g. OpenRouter's attribution headers. */
  headers?: Record<string, string>;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export class OpenAiCompatibleProvider implements Provider {
  readonly id: ProviderId;
  readonly label: string;
  readonly tier: 1 | 2 | 3 | 4 | 5 | 6;

  constructor(
    private readonly config: OpenAiCompatibleConfig,
    private readonly transport: Transport,
  ) {
    this.id = config.id;
    this.label = config.label;
    this.tier = config.tier;
  }

  capabilities(): Capabilities {
    return {
      structuredOutput: this.config.supportsJsonSchema ? "schema" : "prompt-only",
      maxOutputTokens: this.config.maxOutputTokens ?? 8192,
      contextTokens: this.config.contextTokens ?? 32_000,
      onDevice: this.config.onDevice,
    };
  }

  /**
   * Cloud endpoints are judged by configuration alone — probing would spend the
   * user's money to answer "are you set up". Local ones are probed, because
   * "installed" and "running right now" are different things.
   */
  async detect(): Promise<Availability> {
    if (this.config.requiresKey) {
      return this.config.apiKey ? "available" : "needs-setup";
    }
    try {
      const response = await this.transport({
        url: `${this.trimmedBase()}/models`,
        method: "GET",
        headers: this.headers(),
        provider: this.id,
      });
      return response.ok ? "available" : "unavailable";
    } catch {
      // A local server that is not running is the normal case, not an error.
      return "unavailable";
    }
  }

  async complete(req: ChatRequest): Promise<ChatResponse> {
    const text = await this.send(req, undefined);
    return { text, provider: this.id };
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<T> {
    if (this.config.supportsJsonSchema) {
      // The endpoint enforces the shape, but we still validate: "schema-valid"
      // and "correct" are not the same thing.
      const text = await this.send(req, {
        type: "json_schema",
        json_schema: {
          name: req.name,
          strict: true,
          schema: req.schema,
        },
      });
      return parseAndValidate({
        provider: this.id,
        text,
        validate: req.validate,
      });
    }

    // No schema support: put the schema in the prompt and lean on the repair
    // loop. The repair itself is carried as message history by `send`, so the
    // prompt is the same on both attempts.
    const prompt = withSchemaInstruction(req.prompt, req.schema);
    return withRepair(this.id, req.validate, (repair) =>
      this.send({ ...req, prompt }, undefined, repair),
    );
  }

  private trimmedBase(): string {
    return this.config.baseUrl.replace(/\/+$/, "");
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...this.config.headers,
    };
    if (this.config.apiKey) {
      headers.authorization = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  private async send(
    req: ChatRequest,
    responseFormat: unknown,
    repair?: { previous: string; reason: string },
  ): Promise<string> {
    if (this.config.requiresKey && !this.config.apiKey) {
      throw AiError.unauthorized(this.id, `${this.label} needs an API key.`);
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (req.system) messages.push({ role: "system", content: req.system });
    messages.push({ role: "user", content: req.prompt });
    if (repair) {
      // The model must see its own reply to correct it.
      messages.push({ role: "assistant", content: repair.previous });
      messages.push({ role: "user", content: repair.reason });
    }

    const response = await this.transport({
      url: `${this.trimmedBase()}/chat/completions`,
      method: "POST",
      headers: this.headers(),
      signal: req.signal,
      provider: this.id,
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: req.maxOutputTokens ?? this.capabilities().maxOutputTokens,
        ...(req.temperature !== undefined && { temperature: req.temperature }),
        ...(responseFormat ? { response_format: responseFormat } : {}),
      }),
    });

    if (!response.ok) {
      throw errorFromStatus(
        this.id,
        response.status,
        response.text,
        retryAfterSeconds(response.headers),
      );
    }

    let body: ChatCompletionResponse;
    try {
      body = JSON.parse(response.text) as ChatCompletionResponse;
    } catch {
      throw AiError.malformed(this.id, "The provider returned a non-JSON body.");
    }

    const choice = body.choices?.[0];
    if (choice?.finish_reason === "length") {
      throw new AiError(
        "context-exceeded",
        "The reply was cut short. Ask for fewer words.",
        { provider: this.id },
      );
    }
    const text = choice?.message?.content;
    if (typeof text !== "string" || text === "") {
      throw AiError.malformed(this.id, "The provider returned no content.");
    }
    return text;
  }
}

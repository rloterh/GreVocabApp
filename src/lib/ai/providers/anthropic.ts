/**
 * Anthropic's Messages API.
 *
 * Not OpenAI-shaped: a separate `system` field rather than a system message,
 * `max_tokens` required, content as a block array, and structured output via a
 * strict tool rather than `response_format`.
 *
 * This is a port of the call that was previously inline in `generate.ts` — same
 * strict tool, same browser-access header, same `auto` tool choice. Behaviour
 * is deliberately unchanged so the existing generator tests keep their meaning.
 */

import { AiError, errorFromStatus } from "../errors";
import { parseAndValidate } from "../structured";
import { retryAfterSeconds, type Transport } from "../transport";
import type {
  Availability,
  Capabilities,
  ChatRequest,
  ChatResponse,
  Provider,
  StructuredRequest,
} from "../types";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export interface AnthropicConfig {
  apiKey?: string;
  model?: string;
  maxOutputTokens?: number;
  /** Lower effort for routine work; the caller may override. */
  effort?: "low" | "medium" | "high";
}

interface ContentBlock {
  type?: string;
  text?: string;
  name?: string;
  input?: unknown;
}

interface MessagesResponse {
  content?: ContentBlock[];
  stop_reason?: string;
  stop_details?: { explanation?: string };
  usage?: { input_tokens?: number; output_tokens?: number };
}

export class AnthropicProvider implements Provider {
  readonly id = "anthropic" as const;
  readonly label = "Anthropic";
  readonly tier = 6 as const;

  constructor(
    private readonly config: AnthropicConfig,
    private readonly transport: Transport,
  ) {}

  capabilities(): Capabilities {
    return {
      structuredOutput: "tool",
      maxOutputTokens: this.config.maxOutputTokens ?? 16_000,
      contextTokens: 200_000,
      onDevice: false,
    };
  }

  async detect(): Promise<Availability> {
    return this.config.apiKey ? "available" : "needs-setup";
  }

  async complete(req: ChatRequest): Promise<ChatResponse> {
    const body = await this.send(req);
    const text = this.textBlock(body);
    if (text === undefined) {
      throw AiError.malformed(this.id, "No text content in the reply.");
    }
    return {
      text,
      provider: this.id,
      usage: {
        inputTokens: body.usage?.input_tokens,
        outputTokens: body.usage?.output_tokens,
      },
    };
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<T> {
    const body = await this.send(req, {
      name: req.name,
      description: "Return the requested structured result.",
      strict: true,
      input_schema: req.schema,
    });

    const call = body.content?.find(
      (block) => block.type === "tool_use" && block.name === req.name,
    );
    if (!call) {
      if (body.stop_reason === "max_tokens") {
        throw new AiError(
          "context-exceeded",
          "Ran out of output space before finishing. Ask for less.",
          { provider: this.id },
        );
      }
      // Fall back to any text block: with `tool_choice: auto` the model may
      // answer in prose, and a parseable reply is better than a hard failure.
      const text = this.textBlock(body);
      if (text) {
        return parseAndValidate({
          provider: this.id,
          text,
          validate: req.validate,
        });
      }
      throw AiError.malformed(this.id, "The model returned no structured result.");
    }

    try {
      return req.validate(call.input);
    } catch (error) {
      throw AiError.malformed(
        this.id,
        error instanceof Error ? error.message : "The result did not validate.",
      );
    }
  }

  /** The first text block, rather than `content[0]` — a reply may lead with thinking. */
  private textBlock(body: MessagesResponse): string | undefined {
    return body.content?.find(
      (block) => block.type === "text" && typeof block.text === "string",
    )?.text;
  }

  private async send(
    req: ChatRequest,
    tool?: Record<string, unknown>,
  ): Promise<MessagesResponse> {
    if (!this.config.apiKey) {
      throw AiError.unauthorized(this.id, "Anthropic needs an API key.");
    }

    const response = await this.transport({
      url: API_URL,
      method: "POST",
      provider: this.id,
      signal: req.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": API_VERSION,
        // Required for calls made straight from a browser rather than a server.
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: this.config.model ?? "claude-opus-5",
        max_tokens: req.maxOutputTokens ?? this.capabilities().maxOutputTokens,
        output_config: { effort: this.config.effort ?? "medium" },
        ...(req.system ? { system: req.system } : {}),
        ...(tool
          ? { tools: [tool], tool_choice: { type: "auto" } }
          : {}),
        messages: [{ role: "user", content: req.prompt }],
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

    let body: MessagesResponse;
    try {
      body = JSON.parse(response.text) as MessagesResponse;
    } catch {
      throw AiError.malformed(this.id, "Anthropic returned a non-JSON body.");
    }

    if (body.stop_reason === "refusal") {
      throw new AiError(
        "refused",
        body.stop_details?.explanation ??
          "The model declined this request. Try a different topic.",
        { provider: this.id },
      );
    }
    return body;
  }
}

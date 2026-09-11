/**
 * A provider backed by an AI CLI the user already has installed.
 *
 * The tool authenticates itself; Lexicon never sees a credential. On the
 * machine this app was built on, this is the only zero-configuration
 * programmatic route that exists — the browser model reported "unavailable"
 * and no local server was running.
 *
 * Desktop only: a browser cannot spawn a process.
 *
 * See docs/adr/0009-installed-cli-providers.md.
 */

import { AiError } from "../errors";
import { withRepair, withSchemaInstruction } from "../structured";
import type {
  Availability,
  Capabilities,
  ChatRequest,
  ChatResponse,
  Provider,
  StructuredRequest,
} from "../types";

export interface DetectedCli {
  id: string;
  label: string;
  path: string;
}

/** Ask the Rust side which known tools are on PATH. Nothing is executed. */
export async function detectAiClis(): Promise<DetectedCli[]> {
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    return await invoke<DetectedCli[]>("detect_ai_clis");
  } catch {
    return [];
  }
}

export interface CliProviderConfig {
  tool: DetectedCli;
  /**
   * Whether the user has turned this tool on.
   *
   * Detection is not permission: running someone's subscription CLI spends
   * their quota, so an un-enabled tool reports `needs-setup` and is never
   * invoked by the cascade.
   */
  enabled: boolean;
}

export class CliProvider implements Provider {
  readonly id = "cli" as const;
  readonly tier = 3 as const;
  readonly label: string;

  constructor(private readonly config: CliProviderConfig) {
    this.label = config.tool.label;
  }

  capabilities(): Capabilities {
    return {
      // CLIs return prose. The repair loop is what makes this workable.
      structuredOutput: "prompt-only",
      maxOutputTokens: 16_000,
      contextTokens: 100_000,
      // The tool may well call a cloud API, but no data leaves *through us*
      // and no credential of ours is involved. Reported as off-device so the
      // privacy badge does not overclaim.
      onDevice: false,
    };
  }

  async detect(): Promise<Availability> {
    return this.config.enabled ? "available" : "needs-setup";
  }

  async complete(req: ChatRequest): Promise<ChatResponse> {
    const text = await this.run(
      req.system ? `${req.system}\n\n${req.prompt}` : req.prompt,
    );
    return { text, provider: this.id };
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<T> {
    const base = withSchemaInstruction(
      req.system ? `${req.system}\n\n${req.prompt}` : req.prompt,
      req.schema,
    );
    // A CLI is a one-shot: there is no message history to append a correction
    // to, so the repair is re-sent as a whole new prompt carrying the previous
    // attempt and what was wrong with it.
    return withRepair(this.id, req.validate, (repair) =>
      this.run(
        repair
          ? [
              base,
              "",
              "Your previous reply was not valid:",
              repair.reason,
              "",
              "It was:",
              repair.previous.slice(0, 4000),
              "",
              "Send only the corrected JSON.",
            ].join("\n")
          : base,
      ),
    );
  }

  private async run(prompt: string): Promise<string> {
    if (!this.config.enabled) {
      throw new AiError(
        "not-configured",
        `${this.label} is installed but not enabled. Turn it on in Settings.`,
        { provider: this.id },
      );
    }
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      const text = await invoke<string>("run_ai_cli", {
        tool: this.config.tool.id,
        prompt,
      });
      if (!text.trim()) {
        throw AiError.malformed(this.id, `${this.label} returned nothing.`);
      }
      return text;
    } catch (error) {
      if (error instanceof AiError) throw error;
      // The tool's own message is the useful one — it says "not logged in" or
      // "quota exceeded" far better than we could.
      throw AiError.unreachable(
        this.id,
        typeof error === "string" ? error : `${this.label} failed.`,
      );
    }
  }
}

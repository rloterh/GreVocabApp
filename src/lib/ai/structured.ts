/**
 * Getting valid JSON out of any model, however weak.
 *
 * Every feature that matters — generating vocabulary, checking sentences,
 * building distractors — needs structured output, and every provider offers a
 * different mechanism for it: a strict tool, a JSON schema, a grammar, or
 * nothing at all.
 *
 * Adapters implement whichever mechanism they have. This module owns the two
 * parts that must not be reimplemented per provider: extracting JSON from a
 * reply that was supposed to be only JSON, and the repair attempt that makes a
 * prompt-only provider usable at all.
 *
 * See docs/AI-PROVIDERS.md.
 */

import { AiError } from "./errors";
import type { JsonSchema, ProviderId } from "./types";

/**
 * Pull a JSON value out of a model's reply.
 *
 * Models wrap JSON in prose and code fences no matter how firmly they are told
 * not to, and a provider with no schema support will do it every time. Being
 * forgiving here is the difference between a local model working and not.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new SyntaxError("The reply was empty.");

  // Straightforward case first — a provider that honoured the schema.
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through to the salvage attempts.
  }

  // ```json ... ``` or bare ``` ... ```
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // Keep going; the fence may have held something else.
    }
  }

  // The outermost {...} or [...], for a reply padded with commentary.
  const start = trimmed.search(/[[{]/);
  if (start !== -1) {
    const opener = trimmed[start];
    const closer = opener === "{" ? "}" : "]";
    const end = trimmed.lastIndexOf(closer);
    if (end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // Genuinely malformed, not merely surrounded by noise.
      }
    }
  }

  throw new SyntaxError("The reply did not contain valid JSON.");
}

/** Ask for JSON in the prompt itself, for providers with no schema support. */
export function withSchemaInstruction(
  prompt: string,
  schema: JsonSchema,
): string {
  return [
    prompt,
    "",
    "Reply with JSON matching this schema, and nothing else.",
    "No commentary before or after, and no code fences.",
    "",
    JSON.stringify(schema, null, 2),
  ].join("\n");
}

/**
 * Build the follow-up that asks a model to fix its own output.
 *
 * The validator's message is the useful part: "day must be 1-31, got 40" is
 * something a model can act on, where "invalid" is not. This is why `validate`
 * is required to throw with a readable reason.
 */
export function repairPrompt(previous: string, reason: string): string {
  return [
    "That reply was not valid. The problem was:",
    "",
    reason,
    "",
    "Here is what you sent:",
    previous.slice(0, 4000),
    "",
    "Send the corrected JSON only. No commentary, no code fences.",
  ].join("\n");
}

export interface ParseAndValidateOptions<T> {
  provider: ProviderId;
  text: string;
  validate: (value: unknown) => T;
}

/**
 * Parse and validate one reply.
 *
 * Throws `AiError("malformed")` carrying a message fit to feed back to the
 * model, which is exactly what the repair attempt needs.
 */
export function parseAndValidate<T>({
  provider,
  text,
  validate,
}: ParseAndValidateOptions<T>): T {
  let value: unknown;
  try {
    value = extractJson(text);
  } catch (error) {
    throw AiError.malformed(
      provider,
      error instanceof Error ? error.message : "Unreadable reply.",
    );
  }

  try {
    return validate(value);
  } catch (error) {
    throw AiError.malformed(
      provider,
      error instanceof Error ? error.message : "The reply did not validate.",
    );
  }
}

/**
 * Run a structured request with one repair attempt.
 *
 * `send` is the adapter's own call — it has already applied whatever schema
 * mechanism it supports. This wrapper adds the retry that every provider
 * benefits from and a weak one depends on.
 *
 * One retry, not more: a model that cannot fix its output given the exact
 * error is not going to on the third attempt, and each try costs the user.
 */
export async function withRepair<T>(
  provider: ProviderId,
  validate: (value: unknown) => T,
  send: (repairOf?: { previous: string; reason: string }) => Promise<string>,
): Promise<T> {
  const first = await send();
  try {
    return parseAndValidate({ provider, text: first, validate });
  } catch (error) {
    if (!(error instanceof AiError) || error.kind !== "malformed") throw error;

    const second = await send({ previous: first, reason: error.message });
    try {
      return parseAndValidate({ provider, text: second, validate });
    } catch (retryError) {
      // Report the second failure — it is the more informative one, and
      // mentioning the repair tells the reader this was not a single fluke.
      const reason =
        retryError instanceof Error ? retryError.message : "unknown";
      throw AiError.malformed(
        provider,
        `The model could not produce valid output, even after being shown the error. Last problem: ${reason}`,
      );
    }
  }
}

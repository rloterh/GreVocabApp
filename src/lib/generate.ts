/**
 * Generate a month of vocabulary with Claude.
 *
 * Uses the user's own Anthropic key from Settings — the same key and the same
 * raw-fetch call shape as `src/lib/verify.ts`, so there is one way this app
 * talks to the API and no SDK in the browser bundle.
 *
 * Output is constrained with a strict tool schema rather than by asking for
 * JSON in prose: `strict: true` guarantees the arguments validate against the
 * schema, which is the difference between parsing a response and hoping.
 *
 * The result still goes through `parseVocabMonth`, exactly like a JSON or CSV
 * import. Generated content is not trusted more than a file the user supplied.
 *
 * See ROADMAP.md, Phase 3.
 */

import type { VocabMonth } from "@/types";
import { formatMonthKey, slugify } from "@/lib/date-utils";

/** Default words per day, matching the seed data. */
export const WORDS_PER_DAY = 3;

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MODEL = "claude-opus-5";

const TOOL_NAME = "emit_vocabulary";

const WORD_SCHEMA = {
  type: "object",
  properties: {
    word: { type: "string", description: "The vocabulary word itself." },
    partOfSpeech: {
      type: "string",
      description: "noun, verb, adjective, adverb, etc.",
    },
    definition: {
      type: "string",
      description: "One clear sentence. No more than about 20 words.",
    },
    example: {
      type: "string",
      description:
        "A natural sentence using the word, which makes the meaning inferable.",
    },
    mnemonic: {
      type: "string",
      description:
        "A short memory hook — sound-alike, root breakdown, or vivid image.",
    },
    synonyms: {
      type: "array",
      items: { type: "string" },
      description: "Two or three synonyms. May be empty.",
    },
    antonyms: {
      type: "array",
      items: { type: "string" },
      description: "Two or three antonyms. May be empty.",
    },
  },
  required: [
    "word",
    "partOfSpeech",
    "definition",
    "example",
    "mnemonic",
    "synonyms",
    "antonyms",
  ],
  additionalProperties: false,
} as const;

export interface GenerateOptions {
  apiKey: string;
  /** What the month should be about, e.g. "GRE high-frequency verbs". */
  topic: string;
  /** How many words to produce. */
  wordCount: number;
  /** Month key the generated words belong to, "YYYY-MM". */
  monthKey: string;
  /** Words the user already has, so the model does not repeat them. */
  existingWords?: string[];
  signal?: AbortSignal;
}

interface RawWord {
  word: string;
  partOfSpeech: string;
  definition: string;
  example: string;
  mnemonic: string;
  synonyms?: string[];
  antonyms?: string[];
}

/** Anthropic error bodies are `{ error: { message } }`; fall back gracefully. */
function messageFromErrorBody(body: unknown, status: number): string {
  const err = (body as { error?: { message?: unknown } } | null)?.error;
  if (err && typeof err.message === "string") return err.message;
  if (status === 401) return "API key rejected. Check it in Settings.";
  if (status === 429) return "Rate limited by the API. Try again shortly.";
  return `API returned ${status}.`;
}

function buildPrompt(options: GenerateOptions): string {
  const { topic, wordCount, existingWords } = options;
  // Cap the avoid-list: it is a nudge, not a contract, and it is pure input cost.
  const avoid = (existingWords ?? []).slice(0, 300);

  return [
    `Produce exactly ${wordCount} vocabulary words on this theme: ${topic}.`,
    "",
    "Requirements:",
    "- Words should be genuinely useful to learn, not obscure trivia.",
    `- Vary difficulty across the set; do not give ${wordCount} near-synonyms.`,
    "- Definitions must be one clear sentence in plain English.",
    "- The example sentence must make the meaning inferable from context, and",
    "  must not simply restate the definition.",
    "- The mnemonic must be a real memory hook — a sound-alike, a root",
    "  breakdown, or a vivid image. Never restate the definition.",
    "- Every word must be distinct. No repeats.",
    avoid.length > 0
      ? `\nDo not use any of these words, which the learner already has:\n${avoid.join(", ")}`
      : "",
    "",
    `Call the ${TOOL_NAME} tool exactly once with all ${wordCount} words.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Ask Claude for a month of vocabulary.
 *
 * Returns a month-shaped object — the caller passes it to `loadMonth` so it
 * goes through the same validation as an imported file.
 *
 * Throws an Error with a message fit to show the user.
 */
export async function generateMonth(
  options: GenerateOptions,
): Promise<VocabMonth> {
  const { apiKey, wordCount, monthKey, signal } = options;

  if (!apiKey.trim()) {
    throw new Error("No Anthropic API key set. Add one in Settings.");
  }
  if (!Number.isInteger(wordCount) || wordCount < 1 || wordCount > 90) {
    throw new Error("Word count must be between 1 and 90.");
  }
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error("Month must look like 2026-07.");
  }

  const res = await fetch(API_URL, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
      // Required for calls made straight from a browser rather than a server.
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      // Vocabulary writing is not a reasoning-heavy task; medium effort keeps
      // the user's own bill down without visibly hurting the mnemonics.
      output_config: { effort: "medium" },
      tools: [
        {
          name: TOOL_NAME,
          description: "Return the generated vocabulary words.",
          strict: true,
          input_schema: {
            type: "object",
            properties: {
              words: {
                type: "array",
                items: WORD_SCHEMA,
                description: "The generated words, in teaching order.",
              },
            },
            required: ["words"],
            additionalProperties: false,
          },
        },
      ],
      // `auto` plus an explicit instruction rather than a forced tool_choice:
      // forced tool use is rejected on some current models, and this shape
      // behaves the same everywhere.
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: buildPrompt(options) }],
    }),
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Fall through to the status-based message below.
  }

  if (!res.ok) {
    throw new Error(messageFromErrorBody(body, res.status));
  }

  const data = body as {
    stop_reason?: string;
    stop_details?: { explanation?: string };
    content?: Array<{ type: string; name?: string; input?: unknown }>;
  };

  if (data.stop_reason === "refusal") {
    throw new Error(
      data.stop_details?.explanation ??
        "The model declined this request. Try a different topic.",
    );
  }

  const call = data.content?.find(
    (b) => b.type === "tool_use" && b.name === TOOL_NAME,
  );
  if (!call) {
    if (data.stop_reason === "max_tokens") {
      throw new Error(
        "Ran out of output space before finishing. Ask for fewer words.",
      );
    }
    throw new Error("The model did not return any vocabulary. Try again.");
  }

  const words = (call.input as { words?: RawWord[] } | undefined)?.words;
  if (!Array.isArray(words) || words.length === 0) {
    throw new Error("The model returned an empty word list. Try again.");
  }

  return toMonth(words, monthKey, options.topic);
}

/**
 * Lay generated words out across days and shape them like a vocab file.
 *
 * Day assignment happens here rather than in the prompt: it is bookkeeping,
 * and asking a model to do bookkeeping is how you get day 7 twice.
 */
export function toMonth(
  words: RawWord[],
  monthKey: string,
  topic: string,
): VocabMonth {
  const days: VocabMonth["days"] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_DAY) {
    const day = days.length + 1;
    if (day > 31) break; // A month is 31 days; anything past that has nowhere to go.
    days.push({
      day,
      words: words.slice(i, i + WORDS_PER_DAY).map((w) => ({
        // Same id rule parseVocabMonth uses, so a regenerated word keeps its
        // progress instead of starting over.
        id: `${monthKey}-${slugify(String(w.word ?? ""))}`,
        word: String(w.word ?? "").trim(),
        partOfSpeech: String(w.partOfSpeech ?? "").trim(),
        definition: String(w.definition ?? "").trim(),
        example: String(w.example ?? "").trim(),
        mnemonic: String(w.mnemonic ?? "").trim(),
        synonyms: Array.isArray(w.synonyms) ? w.synonyms : undefined,
        antonyms: Array.isArray(w.antonyms) ? w.antonyms : undefined,
      })),
    });
  }

  return {
    month: monthKey,
    displayName: formatMonthKey(monthKey),
    days,
    description: `Generated: ${topic}`,
    createdAt: new Date().toISOString(),
  };
}

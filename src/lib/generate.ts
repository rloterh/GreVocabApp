/**
 * Generate a month of vocabulary with whatever AI is available.
 *
 * This module knows about vocabulary, not about providers. It hands a schema
 * and a prompt to `src/lib/ai/` and gets back a validated result; which model
 * answered, whether it was on-device, and how JSON was constrained are all
 * somebody else's problem.
 *
 * The result still goes through `parseVocabMonth`, exactly like a JSON or CSV
 * import. Generated content is not trusted more than a file the user supplied.
 *
 * See ROADMAP.md, Phase 3; docs/AI-PROVIDERS.md.
 */

import type { VocabMonth, VocabWord } from "@/types";
import { slugify } from "@/lib/date-utils";
import { parseMonthKey, wordId } from "@/lib/track";
import type { Provider } from "@/lib/ai/types";

/** Default words per day, matching the seed data. */
export const WORDS_PER_DAY = 3;

/** Tool/schema name. Referenced in the prompt, so it must match. */
const TOOL_NAME = "emit_vocabulary";

/** The shape a generated batch must have. */
export const VOCAB_SCHEMA = {
  type: "object",
  properties: {
    words: {
      type: "array",
      description: "The generated words, in teaching order.",
      items: undefined as unknown, // filled in below from WORD_SCHEMA
    },
  },
  required: ["words"],
  additionalProperties: false,
} as Record<string, unknown>;

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

// Assembled after WORD_SCHEMA is defined, so the item shape is shared rather
// than written twice.
(VOCAB_SCHEMA.properties as Record<string, Record<string, unknown>>).words.items =
  WORD_SCHEMA;

export interface GenerateOptions {
  /** Whoever is going to answer. Chosen by the registry, or pinned by the user. */
  provider: Provider;
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
  const { provider, wordCount, monthKey, signal } = options;

  if (!Number.isInteger(wordCount) || wordCount < 1 || wordCount > 90) {
    throw new Error("Word count must be between 1 and 90.");
  }
  if (!parseMonthKey(monthKey)) {
    throw new Error("Month must look like gre/07.");
  }

  const words = await provider.completeStructured<RawWord[]>({
    name: TOOL_NAME,
    prompt: buildPrompt(options),
    schema: VOCAB_SCHEMA,
    signal,
    maxOutputTokens: 16_000,
    validate: validateWords,
  });

  return toMonth(words, monthKey, options.topic);
}

/**
 * Check a generated batch.
 *
 * The message thrown here is not only for the user: it is fed back to the
 * model as the repair prompt, so it has to say what was actually wrong.
 */
export function validateWords(value: unknown): RawWord[] {
  const words = (value as { words?: unknown } | undefined)?.words;
  if (!Array.isArray(words)) {
    throw new Error("Expected an object with a `words` array.");
  }
  if (words.length === 0) {
    throw new Error("The `words` array was empty.");
  }
  words.forEach((word, i) => {
    const w = word as Record<string, unknown>;
    for (const field of ["word", "partOfSpeech", "definition", "example", "mnemonic"]) {
      if (typeof w?.[field] !== "string" || !(w[field] as string).trim()) {
        throw new Error(`words[${i}].${field} must be a non-empty string.`);
      }
    }
  });
  return words as RawWord[];
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
  const target = parseMonthKey(monthKey);
  if (!target) throw new Error(`Not a month key: ${monthKey}`);
  const days: VocabMonth["days"] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_DAY) {
    const day = days.length + 1;
    if (day > 31) break; // A month is 31 days; anything past that has nowhere to go.
    days.push({
      day,
      words: words.slice(i, i + WORDS_PER_DAY).map((w) => ({
        // Same id rule parseVocabMonth uses, so a regenerated word keeps its
        // progress instead of starting over.
        id: wordId(target.track, slugify(String(w.word ?? ""))),
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
    track: target.track,
    ordinal: target.ordinal,
    title: topic,
    days,
    description: `Generated: ${topic}`,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Card content for words that are already chosen.
 *
 * Two callers, same need: repairing a card that failed a quality check, and
 * adding a word the user named to a month they already have. Neither is
 * choosing words — the words are given — so this asks only for the definition,
 * example and mnemonic.
 *
 * `notes` carry per-word instructions, which is what makes a repair targeted
 * rather than a reroll: the model is told what was wrong with the last attempt.
 */
export async function generateCards(options: {
  provider: Provider;
  words: string[];
  monthKey: string;
  /** What to fix, where the words are being regenerated. */
  notes?: string[];
  signal?: AbortSignal;
}): Promise<VocabWord[]> {
  const { provider, words, monthKey, notes = [], signal } = options;
  if (words.length === 0) return [];

  const prompt = [
    `Write a vocabulary card for each of these ${words.length} words:`,
    words.map((w) => `- ${w}`).join("\n"),
    "",
    "Use exactly these words. Do not substitute, add or omit any.",
    "",
    "Requirements:",
    "- The definition must be one clear sentence in plain English, and must",
    "  never contain the word being defined or any form of it.",
    "- The example must contain the word, and must make the meaning inferable",
    "  from the situation rather than restating the definition.",
    "- The mnemonic must be a sound-alike, a root breakdown, or a vivid image.",
    "  Never a paraphrase of the definition.",
    notes.length > 0
      ? `\nFix these specific problems with the previous attempt:\n${notes.map((n) => `- ${n}`).join("\n")}`
      : "",
    "",
    `Call the ${TOOL_NAME} tool exactly once with all ${words.length} cards.`,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await provider.completeStructured<RawWord[]>({
    name: TOOL_NAME,
    prompt,
    schema: VOCAB_SCHEMA,
    signal,
    maxOutputTokens: 8_000,
    validate: validateWords,
  });

  // Reuse the same shaping as a generated month, then take the words back out:
  // day layout is the caller's business here, not ours.
  return toMonth(raw, monthKey, "cards").days.flatMap((day) => day.words);
}

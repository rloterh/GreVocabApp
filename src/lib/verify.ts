import type { SentenceVerification, VocabWord } from "@/types";
import type { Provider } from "@/lib/ai/types";

/**
 * Heuristic sentence check.
 * Signals:
 *  - Does the sentence actually contain the word (or a simple morphological variant)?
 *  - Is it a plausible sentence (starts with capital, ends with punctuation, has a verb-ish structure)?
 *  - Word count in a reasonable range?
 *  - Not obviously copy-pasted from the provided example.
 */
export function heuristicVerify(
  word: VocabWord,
  sentences: string[],
): SentenceVerification {
  const perSentence = sentences.map((raw) => {
    const s = raw.trim();
    const feedback: string[] = [];
    let usesWord = containsWord(s, word.word);
    let grammar = true;

    if (!usesWord) {
      feedback.push(
        `Sentence does not appear to use "${word.word}" or a form of it.`,
      );
    }

    if (s.length < 12) {
      feedback.push("Sentence is very short — try to add more context.");
      grammar = false;
    }

    if (!/^[A-Z"']/.test(s)) {
      feedback.push("Sentence should start with a capital letter.");
      grammar = false;
    }

    if (!/[.!?]"?$/.test(s)) {
      feedback.push("Sentence should end with punctuation (. ! ?).");
      grammar = false;
    }

    const words = s.split(/\s+/).filter(Boolean);
    if (words.length < 5) {
      feedback.push("Try for at least a few more words of context.");
      grammar = false;
    }

    // Discourage copying the provided example
    if (looksLikeExample(s, word.example)) {
      feedback.push(
        "This sentence looks too close to the provided example — try your own.",
      );
      usesWord = false;
    }

    const correct = usesWord && grammar;
    return {
      sentence: s,
      correct,
      usesWordCorrectly: usesWord,
      grammaticallyValid: grammar,
      feedback: feedback.length
        ? feedback.join(" ")
        : "Looks good — clear use of the word in a well-formed sentence.",
    };
  });

  const correctCount = perSentence.filter((s) => s.correct).length;
  const overall =
    correctCount === perSentence.length
      ? "excellent"
      : correctCount >= Math.ceil(perSentence.length / 2)
        ? "good"
        : "needs-work";

  return {
    method: "heuristic",
    overall,
    perSentence,
    timestamp: new Date().toISOString(),
  };
}

function containsWord(sentence: string, word: string): boolean {
  const stem = word.toLowerCase().replace(/(ing|ed|es|s|ly|ion|tion)$/, "");
  const pattern = new RegExp(`\\b${escapeRe(stem)}[a-z]*\\b`, "i");
  return pattern.test(sentence);
}

function looksLikeExample(sentence: string, example: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/["'.,!?;:—-]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const a = norm(sentence);
  const b = norm(example);
  if (!a || !b) return false;
  // Very high overlap = probably copied
  const words = new Set(a.split(" "));
  const exWords = b.split(" ");
  const shared = exWords.filter((w) => words.has(w)).length;
  return shared / Math.max(exWords.length, 1) > 0.75;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * AI-backed verification, through whichever provider is available.
 *
 * Falls back to the heuristic on any failure, which is what makes this safe to
 * attempt at all: a user writing sentences always gets feedback, even with no
 * model, a rate limit, or a reply we cannot parse.
 */
export async function apiVerify(
  word: VocabWord,
  sentences: string[],
  provider: Provider,
): Promise<SentenceVerification> {
  try {
    const parsed = await provider.completeStructured({
      name: "grade_sentences",
      prompt: buildVerifyPrompt(word, sentences),
      schema: VERIFY_SCHEMA,
      maxOutputTokens: 4096,
      validate: (value) => validateVerification(value, sentences),
    });

    return {
      method: "api",
      overall: parsed.overall,
      perSentence: parsed.perSentence,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    // Any failure at all falls back rather than surfacing. Sentence checking
    // is a background nicety; blocking on it would be worse than a weaker
    // answer.
    console.warn("AI verification failed, using heuristic:", err);
    return heuristicVerify(word, sentences);
  }
}

/** The shape a grading reply must have. */
export const VERIFY_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    overall: { type: "string", enum: ["excellent", "good", "needs-work"] },
    perSentence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sentence: { type: "string" },
          usesWordCorrectly: { type: "boolean" },
          grammaticallyValid: { type: "boolean" },
          correct: { type: "boolean" },
          feedback: { type: "string" },
          suggestion: { type: "string" },
        },
        required: [
          "sentence",
          "usesWordCorrectly",
          "grammaticallyValid",
          "correct",
          "feedback",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["overall", "perSentence"],
  additionalProperties: false,
};

/**
 * Check a grading reply, and keep the user's own sentences.
 *
 * The model's echo of a sentence is not authoritative — it paraphrases, and
 * showing someone feedback attached to a sentence they did not write is worse
 * than no feedback.
 */
export function validateVerification(
  value: unknown,
  originalSentences: string[],
): {
  overall: "excellent" | "good" | "needs-work";
  perSentence: SentenceVerification["perSentence"];
} {
  const parsed = value as {
    overall?: unknown;
    perSentence?: Array<Record<string, unknown>>;
  };

  const overall = parsed?.overall;
  if (overall !== "excellent" && overall !== "good" && overall !== "needs-work") {
    throw new Error(
      'overall must be "excellent", "good" or "needs-work".',
    );
  }
  if (!Array.isArray(parsed.perSentence)) {
    throw new Error("perSentence must be an array.");
  }

  const perSentence = originalSentences.map((sentence, i) => {
    const p = parsed.perSentence?.[i] ?? {};
    return {
      sentence,
      correct: Boolean(p.correct),
      usesWordCorrectly: Boolean(p.usesWordCorrectly),
      grammaticallyValid: p.grammaticallyValid !== false,
      feedback:
        typeof p.feedback === "string" && p.feedback.trim()
          ? p.feedback
          : "No feedback provided.",
      suggestion: typeof p.suggestion === "string" ? p.suggestion : undefined,
    };
  });

  return { overall, perSentence };
}

function buildVerifyPrompt(word: VocabWord, sentences: string[]): string {
  const list = sentences
    .map((s, i) => `${i + 1}. "${s.trim()}"`)
    .join("\n");
  return `You are a strict but encouraging English teacher evaluating a student's use of a vocabulary word.

Word: "${word.word}" (${word.partOfSpeech})
Definition: ${word.definition}

The student wrote these sentences using the word:
${list}

Evaluate each sentence. For each, decide:
- usesWordCorrectly: Does it use "${word.word}" in a way that matches the definition? (true/false)
- grammaticallyValid: Is the sentence grammatically correct English? (true/false)
- correct: overall correct (both above true)
- feedback: 1-2 sentences of specific, actionable feedback
- suggestion: (optional) a suggested revision if needed

Also give an overall rating: "excellent" (all correct), "good" (most correct), or "needs-work" (multiple issues).

Respond ONLY with valid JSON in this exact shape, no prose before or after, no markdown fences:
{
  "overall": "excellent" | "good" | "needs-work",
  "perSentence": [
    {
      "sentence": "...",
      "usesWordCorrectly": true,
      "grammaticallyValid": true,
      "correct": true,
      "feedback": "...",
      "suggestion": "..."
    }
  ]
}`;
}

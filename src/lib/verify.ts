import type { SentenceVerification, VocabWord } from "@/types";

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
 * API-backed verification via Anthropic.
 * Sends word + definition + user sentences, expects JSON back.
 * Falls back to heuristic on any failure.
 */
export async function apiVerify(
  word: VocabWord,
  sentences: string[],
  apiKey: string,
): Promise<SentenceVerification> {
  const prompt = buildVerifyPrompt(word, sentences);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    const text = data?.content?.[0]?.text;
    if (!text) throw new Error("No content in API response");

    const parsed = parseApiResponse(text, sentences);
    return {
      method: "api",
      overall: parsed.overall,
      perSentence: parsed.perSentence,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    // Fall back to heuristic on any failure
    console.warn("API verification failed, using heuristic:", err);
    return heuristicVerify(word, sentences);
  }
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

function parseApiResponse(
  text: string,
  originalSentences: string[],
): {
  overall: "excellent" | "good" | "needs-work";
  perSentence: SentenceVerification["perSentence"];
} {
  // Strip potential markdown fences
  const cleaned = text
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();
  const parsed = JSON.parse(cleaned) as {
    overall: "excellent" | "good" | "needs-work";
    perSentence: Array<{
      sentence?: string;
      usesWordCorrectly?: boolean;
      grammaticallyValid?: boolean;
      correct?: boolean;
      feedback?: string;
      suggestion?: string;
    }>;
  };

  const perSentence = originalSentences.map((s, i) => {
    const p = parsed.perSentence?.[i] ?? {};
    return {
      sentence: s,
      correct: p.correct ?? false,
      usesWordCorrectly: p.usesWordCorrectly ?? false,
      grammaticallyValid: p.grammaticallyValid ?? true,
      feedback: p.feedback ?? "No feedback provided.",
      suggestion: p.suggestion,
    };
  });

  return {
    overall: parsed.overall ?? "needs-work",
    perSentence,
  };
}

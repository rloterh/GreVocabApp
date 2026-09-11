import { describe, expect, it } from "vitest";
import {
  BRIDGE_COLUMNS,
  buildBridgePrompt,
  countDiscardedRows,
  extractCsv,
  parsePastedVocab,
} from "@/lib/prompt-bridge";
import { parseVocabMonth } from "@/lib/vocabulary";
import type { VocabMonth } from "@/types";

const HEADER = BRIDGE_COLUMNS.join(",");
const ROWS = [
  `abate,verb,To lessen in intensity.,The storm abated by dawn.,"a-BATE, like bait shrinking",1`,
  `cogent,adjective,Clear and convincing.,She made a cogent argument.,co-agent,1`,
  `dearth,noun,A scarcity of something.,There was a dearth of options.,death of supply,1`,
  `laconic,adjective,Using very few words.,His laconic reply ended it.,lacking words,2`,
];
const CLEAN = [HEADER, ...ROWS].join("\n");

describe("buildBridgePrompt", () => {
  const base = { topic: "GRE verbs", wordCount: 12 };

  it("states the task and the count", () => {
    const prompt = buildBridgePrompt(base);
    expect(prompt).toContain("GRE verbs");
    expect(prompt).toContain("exactly 12");
  });

  it("spells out the exact header and a worked example", () => {
    // The model gets no schema and no second chance, so the format has to be
    // unambiguous in the prompt itself.
    const prompt = buildBridgePrompt(base);
    expect(prompt).toContain(HEADER);
    expect(prompt).toContain("abate,verb,");
  });

  it("carries the same quality rules the API path enforces in code", () => {
    const prompt = buildBridgePrompt(base);
    expect(prompt).toMatch(/must not.*contain the word/is);
    expect(prompt).toMatch(/must not simply restate the definition/i);
    expect(prompt).toMatch(/never a paraphrase/i);
  });

  it("lists words to avoid, capped", () => {
    const prompt = buildBridgePrompt({
      ...base,
      existingWords: Array.from({ length: 500 }, (_, i) => `w${i}`),
    });
    expect(prompt).toContain("w0");
    expect(prompt).toContain("w199");
    expect(prompt).not.toContain("w200");
  });

  it("puts must-include words first when there are any", () => {
    const prompt = buildBridgePrompt({ ...base, mustInclude: ["perspicacious"] });
    expect(prompt).toContain("perspicacious");
    expect(prompt).toMatch(/Include these words first/i);
  });

  it("omits the avoid and must-include sections when empty", () => {
    const prompt = buildBridgePrompt(base);
    expect(prompt).not.toMatch(/Include these words first/i);
    expect(prompt).not.toMatch(/Do not use any of these/i);
  });

  it("asks for CSV rather than JSON", () => {
    // Deliberate: chat models malform long JSON, and one missing brace kills
    // the whole batch where a bad CSV line kills one word.
    const prompt = buildBridgePrompt(base);
    expect(prompt).toMatch(/CSV and nothing else/i);
    expect(prompt).not.toMatch(/\bJSON\b/);
  });
});

describe("extractCsv — forgiving, because the user cannot see the other side", () => {
  it("accepts a clean reply", () => {
    expect(extractCsv(CLEAN)).toBe(CLEAN);
  });

  it("strips markdown fences", () => {
    expect(extractCsv("```csv\n" + CLEAN + "\n```")).toBe(CLEAN);
    expect(extractCsv("```\n" + CLEAN + "\n```")).toBe(CLEAN);
  });

  it("drops a preamble before the header", () => {
    const pasted = `Sure! Here are 4 words for you:\n\n${CLEAN}`;
    expect(extractCsv(pasted)).toBe(CLEAN);
  });

  it("drops trailing commentary", () => {
    // The failure this prevents: "Let me know if you'd like more!" becoming a
    // word with no definition.
    const pasted = `${CLEAN}\n\nLet me know if you would like more!`;
    expect(extractCsv(pasted)).toBe(CLEAN);
  });

  it("drops commentary both sides at once", () => {
    const pasted = `Here you go:\n\n${CLEAN}\n\nHope that helps.`;
    expect(extractCsv(pasted)).toBe(CLEAN);
  });

  it("normalises CRLF", () => {
    expect(extractCsv(CLEAN.replace(/\n/g, "\r\n"))).toBe(CLEAN);
  });

  it("keeps quoted fields containing commas intact", () => {
    expect(extractCsv(CLEAN)).toContain('"a-BATE, like bait shrinking"');
  });

  it("counts what it discarded", () => {
    expect(countDiscardedRows(`${CLEAN}\n\nHope that helps.`)).toBe(1);
    expect(countDiscardedRows(CLEAN)).toBe(0);
  });

  it.each([
    ["nothing", "", /Nothing was pasted/],
    ["only prose", "I could not do that, sorry.", /Could not find the CSV header/],
    ["a header with no rows", HEADER, /no word rows/],
  ])("rejects %s with a message that says what to fix", (_n, input, message) => {
    expect(() => extractCsv(input)).toThrow(message);
  });
});

describe("parsePastedVocab", () => {
  it("produces months that pass the same validation as a file", () => {
    const months = parsePastedVocab(CLEAN, "2026-10") as VocabMonth[];
    expect(months).toHaveLength(1);
    const validated = parseVocabMonth(months[0]);
    expect(validated.month).toBe("2026-10");
    expect(validated.days.map((d) => d.day)).toEqual([1, 2]);
    expect(validated.days[0].words).toHaveLength(3);
    expect(validated.days[0].words[0].word).toBe("abate");
  });

  it("survives a realistically messy reply", () => {
    const messy = [
      "Of course! Here's your vocabulary list:",
      "",
      "```csv",
      CLEAN,
      "```",
      "",
      "Would you like me to generate more?",
    ].join("\n");
    const months = parsePastedVocab(messy, "2026-10") as VocabMonth[];
    expect(parseVocabMonth(months[0]).days.flatMap((d) => d.words)).toHaveLength(4);
  });

  it("rejects a malformed month key before doing any work", () => {
    expect(() => parsePastedVocab(CLEAN, "October")).toThrow(/2026-07/);
  });

  it("surfaces the CSV parser's own error for a bad row", () => {
    const bad = [HEADER, "abate,verb,def,example,mnemonic,not-a-day"].join("\n");
    expect(() => parsePastedVocab(bad, "2026-10")).toThrow(/Line 2/);
  });

  it("lets the shared validator reject a blank required field", () => {
    // prompt-bridge does not re-implement validation; parseVocabMonth owns it.
    const blank = [HEADER, "abate,verb,,example,mnemonic,1"].join("\n");
    const months = parsePastedVocab(blank, "2026-10") as VocabMonth[];
    expect(() => parseVocabMonth(months[0])).toThrow(/definition/);
  });
});

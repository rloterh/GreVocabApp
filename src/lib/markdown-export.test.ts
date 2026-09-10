import { describe, expect, it } from "vitest";
import {
  markdownFilename,
  progressToMarkdown,
} from "@/lib/markdown-export";
import type { DayActivity, VocabMonth, WordProgress } from "@/types";

const NOW = new Date("2026-09-10T12:00:00.000Z");

const MONTHS: Record<string, VocabMonth> = {
  "2026-04": {
    month: "2026-04",
    displayName: "April 2026",
    days: [
      {
        day: 1,
        words: [
          {
            id: "a",
            word: "abate",
            partOfSpeech: "verb",
            definition: "d",
            example: "e",
            mnemonic: "m",
          },
          {
            id: "b",
            word: "cogent",
            partOfSpeech: "adjective",
            definition: "d",
            example: "e",
            mnemonic: "m",
          },
        ],
      },
    ],
  },
};

function progress(over: Partial<WordProgress>): WordProgress {
  return {
    wordId: "x",
    monthKey: "2026-04",
    mastered: false,
    timesReviewed: 0,
    quizAttempts: 0,
    quizCorrect: 0,
    lastReviewed: null,
    masteredAt: null,
    ...over,
  };
}

const PROGRESS: Record<string, WordProgress> = {
  a: progress({
    wordId: "a",
    mastered: true,
    timesReviewed: 4,
    quizAttempts: 4,
    quizCorrect: 3,
    easeFactor: 2.36,
    intervalDays: 10,
    reps: 3,
    dueAt: "2026-09-09T12:00:00.000Z", // overdue
  }),
};

const ACTIVITY: Record<string, DayActivity> = {
  "2026-09-10": {
    date: "2026-09-10",
    wordsReviewed: 3,
    wordsMastered: 1,
    quizzesTaken: 1,
    sentencesWritten: 2,
  },
  "2026-09-09": {
    date: "2026-09-09",
    wordsReviewed: 2,
    wordsMastered: 0,
    quizzesTaken: 0,
    sentencesWritten: 0,
  },
  "2026-09-08": {
    date: "2026-09-08",
    wordsReviewed: 0,
    wordsMastered: 0,
    quizzesTaken: 0,
    sentencesWritten: 0,
  },
};

const render = (over: Partial<Parameters<typeof progressToMarkdown>[0]> = {}) =>
  progressToMarkdown({
    months: MONTHS,
    progress: PROGRESS,
    activity: ACTIVITY,
    now: NOW,
    ...over,
  });

describe("progressToMarkdown", () => {
  it("leads with a title and the export date", () => {
    const md = render();
    expect(md.startsWith("# Lexicon study log")).toBe(true);
    expect(md).toContain("10 September 2026");
  });

  it("summarises counts and percentages", () => {
    const md = render();
    expect(md).toContain("| Words loaded | 2 |");
    expect(md).toContain("| Mastered | 1 (50%) |");
    expect(md).toContain("| Reviewed at least once | 1 (50%) |");
    expect(md).toContain("| Due for review | 1 |");
    expect(md).toContain("75% (3/4)");
  });

  it("breaks the totals down by month", () => {
    const md = render();
    expect(md).toContain("## By month");
    expect(md).toContain("| April 2026 | 2 | 1 (50%) | 1 |");
  });

  it("lists due words with their scheduling state", () => {
    const md = render();
    expect(md).toContain("## Due for review");
    expect(md).toContain("| abate | 10d | 2.36 | 9 Sep 2026 |");
  });

  it("lists recent activity newest first and marks today", () => {
    const md = render();
    const dayA = md.indexOf("2026-09-10");
    const dayB = md.indexOf("2026-09-09");
    expect(dayA).toBeGreaterThan(-1);
    expect(dayA).toBeLessThan(dayB);
    expect(md).toContain("2026-09-10 (today)");
  });

  it("omits days with no activity at all", () => {
    expect(render()).not.toContain("2026-09-08");
  });

  it("omits empty sections rather than printing empty tables", () => {
    const md = render({ progress: {}, activity: {} });
    expect(md).not.toContain("## Due for review");
    expect(md).not.toContain("## Recent activity");
    // The summary still renders, with dashes where there is no data.
    expect(md).toContain("| Quiz accuracy | — |");
  });

  it("renders with nothing loaded at all", () => {
    const md = render({ months: {}, progress: {}, activity: {} });
    expect(md).toContain("| Words loaded | 0 |");
    expect(md).toContain("| Mastered | 0 (—) |");
    expect(md).not.toContain("## By month");
  });

  it("escapes pipes so a word cannot break the table", () => {
    const md = render({
      months: {
        "2026-04": {
          ...MONTHS["2026-04"],
          displayName: "April | 2026",
        },
      },
    });
    expect(md).toContain("April \\| 2026");
  });

  it("caps the due list and says how many were left out", () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      id: `w${i}`,
      word: `word${i}`,
      partOfSpeech: "noun",
      definition: "d",
      example: "e",
      mnemonic: "m",
    }));
    const md = render({
      months: {
        "2026-04": {
          month: "2026-04",
          displayName: "April 2026",
          days: [{ day: 1, words: many }],
        },
      },
      progress: Object.fromEntries(
        many.map((w) => [
          w.id,
          progress({
            wordId: w.id,
            intervalDays: 5,
            dueAt: "2026-09-01T00:00:00.000Z",
          }),
        ]),
      ),
    });
    expect(md).toContain("| word0 |");
    expect(md).not.toContain("| word100 |");
    expect(md).toContain("+ 20 more");
  });
});

describe("markdownFilename", () => {
  it("dates the file", () => {
    expect(markdownFilename(new Date(2026, 8, 10))).toBe(
      "lexicon-progress-2026-09-10.md",
    );
  });
});

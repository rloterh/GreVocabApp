import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { allWordsInMonth, parseVocabMonth } from "@/lib/vocabulary";
import { stem } from "@/lib/stem";
import { buildDailyRound, dailyResults, dailySeed, dailyShareText, DAILY_LENGTH, recentDates } from "./daily";
import { tierOrdinals } from "./pool";
import { buildRelationIndex } from "./relations";
import { parseRelationsFile } from "./relations-file";
import type { GameRoundSummary } from "./types";

const ROOT = join(process.cwd(), "public", "vocab");
const index = buildRelationIndex(
  parseRelationsFile(JSON.parse(readFileSync(join(ROOT, "relations.json"), "utf-8"))),
);
const months = readdirSync(join(ROOT, "gre"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => parseVocabMonth(JSON.parse(readFileSync(join(ROOT, "gre", f), "utf-8")), { track: "gre" }));
const wanted = new Set(tierOrdinals(months.map((m) => m.ordinal), "standard"));
const words = months.filter((m) => wanted.has(m.ordinal)).flatMap(allWordsInMonth);

const daily = (date: string) =>
  buildDailyRound({ date, track: "gre", prompts: words, pool: words, monthOf: {}, index });

describe("buildDailyRound", () => {
  it("is the same round for everyone on the same day and track", () => {
    expect(daily("2026-10-14").questions).toEqual(daily("2026-10-14").questions);
    expect(dailySeed("2026-10-14", "gre")).not.toBe(dailySeed("2026-10-14", "sat"));
  });

  it("is a different round tomorrow", () => {
    const a = daily("2026-10-14").questions.map((q) => q.wordId);
    const b = daily("2026-10-15").questions.map((q) => q.wordId);
    expect(b).not.toEqual(a);
  });

  it("asks ten questions from four games, each with its own instruction, no word twice", () => {
    const round = daily("2026-10-14");
    expect(round.questions).toHaveLength(DAILY_LENGTH);
    expect(round.shortfall).toBe(0);
    const kinds = round.questions.map((q) => (q.kind === "verdict" ? "fact" : q.kind === "choice" && q.sentence ? "gap" : q.kind));
    expect(kinds.filter((k) => k === "fact")).toHaveLength(3);
    expect(kinds.filter((k) => k === "gap")).toHaveLength(2);
    for (const q of round.questions) {
      if (q.kind === "choice" || q.kind === "verdict") expect(q.instruction).toBeTruthy();
    }
    expect(new Set(round.questions.map((q) => stem(q.word))).size).toBe(DAILY_LENGTH);
  });
});

describe("the daily record", () => {
  const r = (over: Partial<GameRoundSummary>): GameRoundSummary => ({
    id: "x", game: "daily", track: "gre", tier: "standard", timing: "timed", daily: "2026-10-14",
    finishedAt: "", score: 0, right: 0, total: 10, ms: 0, missed: [], ...over,
  });

  it("takes each day's first completed round, never a practice replay", () => {
    // History is newest first: the practice replay came after the result.
    const rounds = [
      r({ id: "replay", right: 10, practice: true }),
      r({ id: "first", right: 6 }),
      r({ id: "other-track", track: "sat", right: 9 }),
      r({ id: "yesterday", daily: "2026-10-13", right: 4 }),
    ];
    const res = dailyResults(rounds, "gre", ["2026-10-13", "2026-10-14"]);
    expect(res["2026-10-14"]?.id).toBe("first");
    expect(res["2026-10-13"]?.id).toBe("yesterday");
  });

  it("lists fourteen days ending today, across a month boundary", () => {
    const days = recentDates(new Date(2026, 10, 3), 14);
    expect(days).toHaveLength(14);
    expect(days[0]).toBe("2026-10-21");
    expect(days.at(-1)).toBe("2026-11-03");
  });

  it("shares one line and a row of squares, with no link", () => {
    const text = dailyShareText("2026-10-14", "Advanced", [true, true, false, true]);
    expect(text).toMatch(/^Lexicon Daily · 14 Oct · Advanced\n3\/4 🟩🟩⬜🟩$/);
    expect(text).not.toMatch(/https?:/);
  });
});

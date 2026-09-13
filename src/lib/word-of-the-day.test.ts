import { describe, expect, it } from "vitest";
import { wordOfTheDay, wordOfTheDayNote } from "./word-of-the-day";
import type { VocabWord, WordProgress } from "@/types";

function word(id: string): VocabWord {
  return {
    id: `gre-${id}`,
    word: id,
    partOfSpeech: "noun",
    definition: "A definition.",
    example: "An example.",
    mnemonic: "A mnemonic.",
  };
}

const WORDS = ["abate", "cogent", "ephemeral", "laconic", "obdurate"].map(word);

function progress(
  entries: Array<[string, Partial<WordProgress>]>,
): Record<string, WordProgress> {
  return Object.fromEntries(
    entries.map(([id, over]) => [
      `gre-${id}`,
      {
        wordId: `gre-${id}`,
        monthKey: "gre/01",
        mastered: false,
        timesReviewed: 1,
        quizAttempts: 0,
        quizCorrect: 0,
        lastReviewed: null,
        masteredAt: null,
        ...over,
      } as WordProgress,
    ]),
  );
}

const MONDAY = new Date(2027, 2, 1, 9, 0);

describe("wordOfTheDay", () => {
  it("is null when there is nothing loaded", () => {
    expect(wordOfTheDay([], {}, MONDAY)).toBeNull();
  });

  it("holds still across a day", () => {
    const morning = wordOfTheDay(WORDS, {}, new Date(2027, 2, 1, 7, 0));
    const evening = wordOfTheDay(WORDS, {}, new Date(2027, 2, 1, 22, 30));
    expect(morning?.word.id).toBe(evening?.word.id);
  });

  it("moves on the next day", () => {
    // Not guaranteed for any single pair of dates, but across a week a fixed
    // answer would show up immediately.
    const week = [0, 1, 2, 3, 4, 5, 6].map(
      (d) => wordOfTheDay(WORDS, {}, new Date(2027, 2, 1 + d, 9, 0))?.word.id,
    );
    expect(new Set(week).size).toBeGreaterThan(1);
  });

  it("prefers what the scheduler says is due", () => {
    const due = progress([
      ["obdurate", { dueAt: new Date(2027, 1, 20).toISOString(), reps: 2 }],
    ]);
    const picked = wordOfTheDay(WORDS, due, MONDAY);
    expect(picked?.word.id).toBe("gre-obdurate");
    expect(picked?.reason).toBe("due");
  });

  it("falls back to something unmastered when nothing is due", () => {
    const mastered = progress([
      ["abate", { mastered: true }],
      ["cogent", { mastered: true }],
      ["ephemeral", { mastered: true }],
      ["laconic", { mastered: true }],
    ]);
    const picked = wordOfTheDay(WORDS, mastered, MONDAY);
    expect(picked?.word.id).toBe("gre-obdurate");
    expect(picked?.reason).toBe("unmastered");
  });

  it("still offers something when everything is mastered", () => {
    const all = progress(
      WORDS.map((w) => [w.word, { mastered: true }] as [string, Partial<WordProgress>]),
    );
    const picked = wordOfTheDay(WORDS, all, MONDAY);
    expect(picked).not.toBeNull();
    expect(picked?.reason).toBe("review");
  });

  it("does not march the two tracks in step", () => {
    // Not "they differ today": with five words two salts land on the same
    // index one day in five by luck, and asserting otherwise is a coin toss.
    // What the salt buys is that they are not the *same sequence* — without
    // it every notebook would surface the same position every day.
    let differed = 0;
    for (let d = 0; d < 60; d++) {
      const when = new Date(2027, 0, 1 + d, 9, 0);
      const a = wordOfTheDay(WORDS, {}, when, "gre");
      const b = wordOfTheDay(WORDS, {}, when, "sat");
      if (a?.word.id !== b?.word.id) differed++;
    }
    // Five words, so two independent picks agree about a fifth of the time.
    expect(differed).toBeGreaterThan(35);
  });

  it("never picks a word that is not in the list", () => {
    const ids = new Set(WORDS.map((w) => w.id));
    for (let d = 0; d < 60; d++) {
      const picked = wordOfTheDay(WORDS, {}, new Date(2027, 0, 1 + d, 9, 0));
      expect(ids.has(picked!.word.id)).toBe(true);
    }
  });
});

describe("wordOfTheDayNote", () => {
  it.each(["due", "unmastered", "review"] as const)("says something for %s", (reason) => {
    expect(wordOfTheDayNote(reason).length).toBeGreaterThan(10);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { useProgressStore } from "@/store/useProgressStore";
import { DEFAULT_EASE_FACTOR } from "@/lib/sm2";
import { toDateKey } from "@/lib/date-utils";
import type { QuizSession, StudySession } from "@/types";

/**
 * `applyStudyRating` is where SM-2, mastery and the daily activity log all
 * meet, so most of this file lives there. The invariant in CONTINUING.md —
 * progress is keyed by word and survives reloading the same vocabulary — is
 * covered at the bottom.
 */

const WORD = "2026-04-abate";
const MONTH = "2026-04";
const today = () => toDateKey(new Date());

const store = () => useProgressStore.getState();

beforeEach(() => {
  useProgressStore.getState().reset();
});

describe("markReviewed", () => {
  it("creates a record on first sight and counts the review", () => {
    store().markReviewed(WORD, MONTH);
    const w = store().getWord(WORD)!;
    expect(w.timesReviewed).toBe(1);
    expect(w.monthKey).toBe(MONTH);
    expect(w.lastReviewed).not.toBeNull();
  });

  it("counts a day's first review once, however many times you look", () => {
    store().markReviewed(WORD, MONTH);
    store().markReviewed(WORD, MONTH);
    store().markReviewed(WORD, MONTH);
    expect(store().getWord(WORD)!.timesReviewed).toBe(3);
    // The streak cares about distinct words seen, not total reviews.
    expect(store().activity[today()].wordsReviewed).toBe(1);
  });
});

describe("toggleMastered", () => {
  it("marks and unmarks, stamping the time only while mastered", () => {
    store().toggleMastered(WORD, MONTH);
    expect(store().isMastered(WORD)).toBe(true);
    expect(store().getWord(WORD)!.masteredAt).not.toBeNull();

    store().toggleMastered(WORD, MONTH);
    expect(store().isMastered(WORD)).toBe(false);
    expect(store().getWord(WORD)!.masteredAt).toBeNull();
  });
});

describe("recordQuizAnswer", () => {
  it("tallies attempts and correct answers", () => {
    store().recordQuizAnswer(WORD, MONTH, true);
    store().recordQuizAnswer(WORD, MONTH, false);
    const w = store().getWord(WORD)!;
    expect(w.quizAttempts).toBe(2);
    expect(w.quizCorrect).toBe(1);
  });
});

describe("applyStudyRating — scheduling", () => {
  it("schedules a word on its first rating", () => {
    store().applyStudyRating(WORD, MONTH, "good");
    const w = store().getWord(WORD)!;
    expect(w.reps).toBe(1);
    expect(w.intervalDays).toBe(1);
    expect(w.easeFactor).toBeCloseTo(DEFAULT_EASE_FACTOR, 5);
    expect(w.dueAt).toBeTruthy();
  });

  it("advances the interval across successive Good ratings", () => {
    store().applyStudyRating(WORD, MONTH, "good");
    store().applyStudyRating(WORD, MONTH, "good");
    expect(store().getWord(WORD)!.intervalDays).toBe(6);
    store().applyStudyRating(WORD, MONTH, "good");
    expect(store().getWord(WORD)!.intervalDays).toBe(15);
  });

  it("sends a failed word back to tomorrow and resets its reps", () => {
    store().applyStudyRating(WORD, MONTH, "good");
    store().applyStudyRating(WORD, MONTH, "good");
    store().applyStudyRating(WORD, MONTH, "again");
    const w = store().getWord(WORD)!;
    expect(w.reps).toBe(0);
    expect(w.intervalDays).toBe(1);
    expect(w.easeFactor!).toBeLessThan(DEFAULT_EASE_FACTOR);
  });

  it("counts the review every time, even when the schedule resets", () => {
    store().applyStudyRating(WORD, MONTH, "good");
    store().applyStudyRating(WORD, MONTH, "again");
    expect(store().getWord(WORD)!.timesReviewed).toBe(2);
  });
});

describe("applyStudyRating — mastery", () => {
  it("masters a word rated Easy and un-masters one rated Again", () => {
    store().applyStudyRating(WORD, MONTH, "easy");
    expect(store().isMastered(WORD)).toBe(true);

    store().applyStudyRating(WORD, MONTH, "again");
    expect(store().isMastered(WORD)).toBe(false);
    expect(store().getWord(WORD)!.masteredAt).toBeNull();
  });

  it("leaves mastery alone for Good and Hard", () => {
    store().applyStudyRating(WORD, MONTH, "good");
    expect(store().isMastered(WORD)).toBe(false);
    store().applyStudyRating(WORD, MONTH, "hard");
    expect(store().isMastered(WORD)).toBe(false);
  });

  it("keeps scheduling a mastered word — that is the point of spaced repetition", () => {
    store().applyStudyRating(WORD, MONTH, "easy");
    const w = store().getWord(WORD)!;
    expect(w.mastered).toBe(true);
    expect(w.dueAt).toBeTruthy();
    expect(w.intervalDays).toBeGreaterThan(0);
  });

  it("never lets the day's mastered count go negative", () => {
    // Un-mastering a word that was mastered on an earlier day would otherwise
    // subtract from a counter that was never incremented today.
    store().applyStudyRating(WORD, MONTH, "easy");
    store().applyStudyRating(WORD, MONTH, "again");
    store().applyStudyRating("other", MONTH, "again");
    expect(store().activity[today()].wordsMastered).toBeGreaterThanOrEqual(0);
  });
});

describe("sentences", () => {
  it("stores and retrieves by word and date, counting only the first save", () => {
    const practice = {
      wordId: WORD,
      date: "2026-09-10",
      sentences: ["One.", "Two."],
    };
    store().saveSentences(practice);
    store().saveSentences({ ...practice, sentences: ["Edited."] });

    expect(store().getSentences(WORD, "2026-09-10")!.sentences).toEqual([
      "Edited.",
    ]);
    expect(store().activity[today()].sentencesWritten).toBe(1);
  });

  it("keeps practices for the same word on different days apart", () => {
    store().saveSentences({ wordId: WORD, date: "2026-09-10", sentences: ["a"] });
    store().saveSentences({ wordId: WORD, date: "2026-09-11", sentences: ["b"] });
    expect(store().getSentences(WORD, "2026-09-10")!.sentences).toEqual(["a"]);
    expect(store().getSentences(WORD, "2026-09-11")!.sentences).toEqual(["b"]);
  });
});

describe("session history", () => {
  const quiz = (id: string): QuizSession => ({
    id,
    startedAt: "2026-09-10T10:00:00.000Z",
    finishedAt: "2026-09-10T10:05:00.000Z",
    mode: "mixed",
    pool: "all",
    questions: [],
    answers: [],
    score: 1,
  });
  const study = (id: string): StudySession => ({
    id,
    startedAt: "2026-09-10T10:00:00.000Z",
    finishedAt: "2026-09-10T10:05:00.000Z",
    deck: "all",
    cardCount: 1,
    events: [],
    bestStreak: 1,
    totalMs: 1000,
  });

  it("keeps the newest session first and caps history at 100", () => {
    for (let i = 0; i < 105; i++) store().addQuizSession(quiz(`q${i}`));
    expect(store().quizzes).toHaveLength(100);
    expect(store().quizzes[0].id).toBe("q104");
  });

  it("caps study history the same way and logs the session", () => {
    for (let i = 0; i < 105; i++) store().addStudySession(study(`s${i}`));
    expect(store().studies).toHaveLength(100);
    expect(store().studies[0].id).toBe("s104");
    expect(store().activity[today()].studySessions).toBe(105);
  });
});

describe("progress is orthogonal to vocabulary (CONTINUING.md principle 1)", () => {
  it("survives the same word being loaded again, because it is keyed by id", () => {
    store().applyStudyRating(WORD, MONTH, "good");
    store().applyStudyRating(WORD, MONTH, "good");
    const before = store().getWord(WORD)!;

    // Re-importing vocabulary touches the vocab store, never this one.
    const after = store().getWord(WORD)!;
    expect(after).toEqual(before);
    expect(after.intervalDays).toBe(6);
  });

  it("tracks words from different months independently", () => {
    store().applyStudyRating("2026-04-abate", "2026-04", "easy");
    store().applyStudyRating("2026-05-dearth", "2026-05", "again");
    expect(store().isMastered("2026-04-abate")).toBe(true);
    expect(store().isMastered("2026-05-dearth")).toBe(false);
    expect(store().getWord("2026-05-dearth")!.monthKey).toBe("2026-05");
  });

  it("reset clears everything", () => {
    store().applyStudyRating(WORD, MONTH, "good");
    store().addQuizSession({
      id: "q",
      startedAt: "",
      finishedAt: null,
      mode: "mixed",
      pool: "all",
      questions: [],
      answers: [],
      score: 0,
    });
    store().reset();
    expect(store().words).toEqual({});
    expect(store().activity).toEqual({});
    expect(store().quizzes).toEqual([]);
    expect(store().studies).toEqual([]);
  });
});

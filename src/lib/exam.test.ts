import { describe, expect, it } from "vitest";
import {
  advance,
  answerQuestion,
  atSectionBreak,
  createExam,
  currentQuestion,
  DEFAULT_EXAM_CONFIG,
  examProgress,
  isResumable,
  missedWordIds,
  scoreExam,
} from "@/lib/exam";
import type { QuizQuestion } from "@/types";

function question(n: number): QuizQuestion {
  return {
    wordId: `w${n}`,
    mode: "word-to-def",
    prompt: `word${n}`,
    correct: `right${n}`,
    options: [`right${n}`, `wrong${n}a`, `wrong${n}b`, `wrong${n}c`],
  };
}

const NOW = new Date("2026-09-12T10:00:00Z");

/** A full exam: 5 sections of 20. */
function fullExam() {
  return createExam(
    Array.from({ length: 100 }, (_, i) => question(i)),
    DEFAULT_EXAM_CONFIG,
    undefined,
    NOW,
  );
}

/** A small exam, for tests that care about reaching the end. */
function smallExam(sections = 2, perSection = 2) {
  return createExam(
    Array.from({ length: sections * perSection }, (_, i) => question(i)),
    { sections, perSection, timerSeconds: null },
    undefined,
    NOW,
  );
}

/** Answer every question, correctly or not, until the exam finishes. */
function answerAll(session: ReturnType<typeof smallExam>, correctly: boolean) {
  let current = session;
  for (let guard = 0; guard < 500 && !current.finishedAt; guard++) {
    const q = currentQuestion(current);
    if (!q) break;
    current = answerQuestion(current, correctly ? q.correct : q.options[1], 1000, NOW);
  }
  return current;
}

describe("building an exam", () => {
  it("is a hundred questions in five sections of twenty", () => {
    const exam = fullExam();
    expect(exam.sections).toHaveLength(5);
    expect(exam.sections.every((s) => s.questions.length === 20)).toBe(true);
    expect(examProgress(exam).total).toBe(100);
  });

  it("null-pads answers so a part-answered section is representable", () => {
    // This is what makes resume possible at all.
    const exam = fullExam();
    expect(exam.sections[0].answers).toHaveLength(20);
    expect(exam.sections[0].answers.every((a) => a === null)).toBe(true);
  });

  it("is untimed by default", () => {
    // Pacing is a preference, not an imposition.
    expect(DEFAULT_EXAM_CONFIG.timerSeconds).toBeNull();
  });

  it("stops short rather than padding when questions run out", () => {
    const exam = createExam([question(1), question(2)], DEFAULT_EXAM_CONFIG, undefined, NOW);
    expect(exam.sections).toHaveLength(1);
    expect(exam.sections[0].questions).toHaveLength(2);
  });

  it("accepts a title for each section", () => {
    const exam = createExam(
      Array.from({ length: 4 }, (_, i) => question(i)),
      { sections: 2, perSection: 2, timerSeconds: null },
      (i) => `April, part ${i + 1}`,
      NOW,
    );
    expect(exam.sections.map((s) => s.title)).toEqual([
      "April, part 1",
      "April, part 2",
    ]);
  });

  it("starts unfinished, at the first question", () => {
    const exam = fullExam();
    expect(exam.finishedAt).toBeNull();
    expect(exam.currentSection).toBe(0);
    expect(currentQuestion(exam)?.wordId).toBe("w0");
  });
});

describe("answering", () => {
  it("records the answer and moves on", () => {
    const exam = smallExam();
    const next = answerQuestion(exam, "right0", 1200, NOW);
    expect(next.sections[0].answers[0]).toEqual({
      chosen: "right0",
      correct: true,
      msToAnswer: 1200,
    });
    expect(next.currentQuestion).toBe(1);
  });

  it("marks a wrong answer wrong", () => {
    const next = answerQuestion(smallExam(), "wrong0a", 900, NOW);
    expect(next.sections[0].answers[0]?.correct).toBe(false);
  });

  it("never mutates the session it was given", () => {
    const exam = smallExam();
    const before = JSON.stringify(exam);
    answerQuestion(exam, "right0", 100, NOW);
    expect(JSON.stringify(exam)).toBe(before);
  });

  it("moves to the next section at the end of one", () => {
    let exam = smallExam(2, 2);
    exam = answerQuestion(exam, "right0", 100, NOW);
    exam = answerQuestion(exam, "right1", 100, NOW);
    expect(exam.currentSection).toBe(1);
    expect(exam.currentQuestion).toBe(0);
    expect(exam.sections[0].finishedAt).toBeTruthy();
  });

  it("finishes after the last question of the last section", () => {
    const finished = answerAll(smallExam(2, 2), true);
    expect(finished.finishedAt).toBeTruthy();
    expect(currentQuestion(finished)).toBeNull();
  });

  it("ignores further answers once finished", () => {
    // A double-tap on the last question must not throw or corrupt the score.
    const finished = answerAll(smallExam(2, 2), true);
    expect(answerQuestion(finished, "right0", 100, NOW)).toBe(finished);
  });

  it("lets a timer expire a section without an answer", () => {
    const exam = smallExam(1, 3);
    const skipped = advance(advance(exam, NOW), NOW);
    expect(skipped.currentQuestion).toBe(2);
    expect(skipped.sections[0].answers.filter(Boolean)).toHaveLength(0);
  });
});

describe("resuming — the property that matters", () => {
  it("survives a round trip through storage part-way through", () => {
    // Forty minutes of someone's attention. Losing it is worse than never
    // having offered the exam.
    let exam = fullExam();
    for (let i = 0; i < 37; i++) {
      const q = currentQuestion(exam)!;
      exam = answerQuestion(exam, q.correct, 800, NOW);
    }

    const restored = JSON.parse(JSON.stringify(exam));
    expect(isResumable(restored)).toBe(true);
    expect(restored.currentSection).toBe(exam.currentSection);
    expect(restored.currentQuestion).toBe(exam.currentQuestion);
    expect(currentQuestion(restored)?.wordId).toBe(currentQuestion(exam)?.wordId);
    expect(examProgress(restored).answered).toBe(37);
  });

  it("carries on from exactly where it stopped", () => {
    let exam = fullExam();
    for (let i = 0; i < 25; i++) {
      exam = answerQuestion(exam, currentQuestion(exam)!.correct, 800, NOW);
    }
    const restored: typeof exam = JSON.parse(JSON.stringify(exam));
    const continued = answerQuestion(
      restored,
      currentQuestion(restored)!.correct,
      800,
      NOW,
    );
    expect(examProgress(continued).answered).toBe(26);
  });

  it("refuses to resume a finished exam", () => {
    expect(isResumable(answerAll(smallExam(1, 2), true))).toBe(false);
  });

  it.each([
    ["null", null],
    ["a string", "exam"],
    ["an empty object", {}],
    ["no sections", { sections: [], finishedAt: null }],
    [
      "answers out of step with questions",
      {
        finishedAt: null,
        sections: [{ questions: [question(1), question(2)], answers: [null] }],
      },
    ],
  ])("refuses to resume %s", (_name, value) => {
    // Storage holds whatever a previous version wrote; the failure mode for
    // trusting it is a crash on launch.
    expect(isResumable(value)).toBe(false);
  });
});

describe("scoring", () => {
  it("scores a perfect exam at 100", () => {
    expect(scoreExam(answerAll(smallExam(2, 2), true)).percent).toBe(100);
  });

  it("scores everything wrong at 0", () => {
    expect(scoreExam(answerAll(smallExam(2, 2), false)).percent).toBe(0);
  });

  it("counts unanswered questions against the score", () => {
    // Scoring only what was attempted would reward abandoning the exam.
    let exam = smallExam(2, 2);
    exam = answerQuestion(exam, currentQuestion(exam)!.correct, 100, NOW);
    const score = scoreExam(exam);
    expect(score.answered).toBe(1);
    expect(score.total).toBe(4);
    expect(score.percent).toBe(25);
  });

  it("breaks the score down by section", () => {
    let exam = smallExam(2, 2);
    exam = answerQuestion(exam, currentQuestion(exam)!.correct, 100, NOW);
    exam = answerQuestion(exam, "nope", 100, NOW);
    const score = scoreExam(exam);
    expect(score.perSection[0]).toEqual({
      title: "Section 1",
      correct: 1,
      total: 2,
    });
  });

  it("reports zero for an exam with no questions", () => {
    const empty = createExam([], DEFAULT_EXAM_CONFIG, undefined, NOW);
    expect(scoreExam(empty).percent).toBe(0);
  });
});

describe("feeding the scheduler", () => {
  it("names every word answered wrongly", () => {
    // An exam is a study session, not only a measurement.
    const missed = missedWordIds(answerAll(smallExam(2, 2), false));
    expect(missed).toEqual(["w0", "w1", "w2", "w3"]);
  });

  it("names nothing when everything was right", () => {
    expect(missedWordIds(answerAll(smallExam(2, 2), true))).toEqual([]);
  });

  it("ignores unanswered questions", () => {
    // Not answered is not the same as answered wrongly.
    let exam = smallExam(2, 2);
    exam = answerQuestion(exam, "nope", 100, NOW);
    expect(missedWordIds(exam)).toEqual(["w0"]);
  });
});

describe("progress does not leak the score", () => {
  it("reports how far through, not how well", () => {
    let exam = smallExam(2, 2);
    exam = answerQuestion(exam, "nope", 100, NOW);
    // Knowing your running score changes how you answer the next question.
    expect(examProgress(exam)).toEqual({ answered: 1, total: 4 });
    expect(Object.keys(examProgress(exam))).toEqual(["answered", "total"]);
  });
});

describe("section breaks", () => {
  it("is at a break before a section has been started", () => {
    let exam = smallExam(2, 2);
    exam = answerQuestion(exam, "right0", 100, NOW);
    exam = answerQuestion(exam, "right1", 100, NOW);
    expect(atSectionBreak(exam)).toBe(true);
  });

  it("is not at a break once the section is under way", () => {
    const exam = answerQuestion(smallExam(2, 2), "right0", 100, NOW);
    expect(atSectionBreak(exam)).toBe(false);
  });

  it("is not at a break when the exam is over", () => {
    expect(atSectionBreak(answerAll(smallExam(2, 2), true))).toBe(false);
  });
});

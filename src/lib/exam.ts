/**
 * A 100-question exam: five sections of twenty, resumable.
 *
 * The property that matters most here is the dull one. **An exam must survive
 * the app closing.** A hundred questions is forty minutes of someone's
 * attention, and losing it because a tab was closed is worse than never having
 * offered the exam — they will not start a second one.
 *
 * So the session is a plain serialisable value with no behaviour of its own:
 * every function here takes one and returns a new one, and the store persists
 * whatever it is handed. `answers` is sparse and null-padded so a
 * partly-answered section is representable, which is what makes resume work at
 * all.
 *
 * See docs/QUIZ-AND-EXAMS.md.
 */

import type { QuizQuestion } from "@/types";

export interface ExamAnswer {
  chosen: string;
  correct: boolean;
  msToAnswer: number;
}

export interface ExamSection {
  title: string;
  questions: QuizQuestion[];
  /** Sparse: `null` means not yet answered. Same length as `questions`. */
  answers: Array<ExamAnswer | null>;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ExamConfig {
  sections: number;
  perSection: number;
  /** Per-section limit. `null` means untimed, which is the default. */
  timerSeconds: number | null;
}

export interface ExamSession {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  config: ExamConfig;
  sections: ExamSection[];
  currentSection: number;
  currentQuestion: number;
}

export const DEFAULT_EXAM_CONFIG: ExamConfig = {
  sections: 5,
  perSection: 20,
  // Off by default: GRE-style pacing is a preference, not an imposition.
  timerSeconds: null,
};

/**
 * Build a session from questions already chosen.
 *
 * Question selection is the caller's business; this is the bookkeeping, and
 * keeping them apart is what lets the whole exam model be tested without a
 * vocabulary.
 */
export function createExam(
  questions: readonly QuizQuestion[],
  config: ExamConfig = DEFAULT_EXAM_CONFIG,
  titleFor: (index: number, questions: QuizQuestion[]) => string = defaultTitle,
  now: Date = new Date(),
): ExamSession {
  const sections: ExamSection[] = [];
  for (let i = 0; i < config.sections; i++) {
    const slice = questions.slice(
      i * config.perSection,
      (i + 1) * config.perSection,
    );
    if (slice.length === 0) break;
    sections.push({
      title: titleFor(i, slice),
      questions: slice,
      answers: new Array(slice.length).fill(null),
      startedAt: null,
      finishedAt: null,
    });
  }

  return {
    id: `exam-${now.getTime()}`,
    startedAt: now.toISOString(),
    finishedAt: null,
    config,
    sections,
    currentSection: 0,
    currentQuestion: 0,
  };
}

function defaultTitle(index: number): string {
  return `Section ${index + 1}`;
}

/** The question the user is looking at, or null if the exam is over. */
export function currentQuestion(session: ExamSession): QuizQuestion | null {
  const section = session.sections[session.currentSection];
  return section?.questions[session.currentQuestion] ?? null;
}

/**
 * Record an answer and advance.
 *
 * Returns a new session; the caller persists it. Answering out of range, or
 * after the exam has finished, is a no-op rather than an error — a double-tap
 * on the last question of a section should not throw.
 */
export function answerQuestion(
  session: ExamSession,
  chosen: string,
  msToAnswer: number,
  now: Date = new Date(),
): ExamSession {
  if (session.finishedAt) return session;
  const section = session.sections[session.currentSection];
  const question = section?.questions[session.currentQuestion];
  if (!section || !question) return session;

  const answers = [...section.answers];
  answers[session.currentQuestion] = {
    chosen,
    correct: chosen === question.correct,
    msToAnswer,
  };

  const sections = [...session.sections];
  sections[session.currentSection] = {
    ...section,
    answers,
    startedAt: section.startedAt ?? now.toISOString(),
  };

  return advance({ ...session, sections }, now);
}

/**
 * Move to the next question, ending the section or the exam as needed.
 *
 * Exported so a timer can expire a section without an answer.
 */
export function advance(session: ExamSession, now: Date = new Date()): ExamSession {
  const section = session.sections[session.currentSection];
  if (!section) return session;

  const nextQuestion = session.currentQuestion + 1;
  if (nextQuestion < section.questions.length) {
    return { ...session, currentQuestion: nextQuestion };
  }

  // Section over.
  const sections = [...session.sections];
  sections[session.currentSection] = {
    ...section,
    finishedAt: section.finishedAt ?? now.toISOString(),
  };

  const nextSection = session.currentSection + 1;
  if (nextSection < session.sections.length) {
    return {
      ...session,
      sections,
      currentSection: nextSection,
      currentQuestion: 0,
    };
  }

  return {
    ...session,
    sections,
    finishedAt: now.toISOString(),
    currentQuestion: section.questions.length,
  };
}

/** Is the user between sections, waiting on a break screen? */
export function atSectionBreak(session: ExamSession): boolean {
  if (session.finishedAt) return false;
  const section = session.sections[session.currentSection];
  if (!section) return false;
  return session.currentQuestion === 0 && section.startedAt === null;
}

export interface ExamScore {
  answered: number;
  correct: number;
  total: number;
  /** 0–100, of the whole exam rather than of what was answered. */
  percent: number;
  perSection: Array<{ title: string; correct: number; total: number }>;
}

/**
 * The score.
 *
 * Deliberately **not** shown during the exam: knowing your running score
 * changes how you answer the next question, which makes the result measure
 * something other than vocabulary.
 */
export function scoreExam(session: ExamSession): ExamScore {
  let answered = 0;
  let correct = 0;
  let total = 0;
  const perSection: ExamScore["perSection"] = [];

  for (const section of session.sections) {
    let sectionCorrect = 0;
    for (const answer of section.answers) {
      if (!answer) continue;
      answered++;
      if (answer.correct) {
        correct++;
        sectionCorrect++;
      }
    }
    total += section.questions.length;
    perSection.push({
      title: section.title,
      correct: sectionCorrect,
      total: section.questions.length,
    });
  }

  return {
    answered,
    correct,
    total,
    // Unanswered counts against you: an exam scored only on what you attempted
    // rewards abandoning it.
    percent: total === 0 ? 0 : Math.round((correct / total) * 100),
    perSection,
  };
}

/** Word ids answered wrongly — what the scheduler needs to know. */
export function missedWordIds(session: ExamSession): string[] {
  const missed: string[] = [];
  for (const section of session.sections) {
    section.answers.forEach((answer, i) => {
      if (answer && !answer.correct) missed.push(section.questions[i].wordId);
    });
  }
  return missed;
}

/** How far through, for a progress bar that does not leak the score. */
export function examProgress(session: ExamSession): {
  answered: number;
  total: number;
} {
  let answered = 0;
  let total = 0;
  for (const section of session.sections) {
    answered += section.answers.filter(Boolean).length;
    total += section.questions.length;
  }
  return { answered, total };
}

/**
 * Is this value a session we can resume?
 *
 * Storage can hold anything a previous version wrote, and the failure mode for
 * getting this wrong is a crash on launch rather than a lost exam — so it is
 * checked structurally rather than trusted.
 */
export function isResumable(value: unknown): value is ExamSession {
  const session = value as ExamSession | null;
  if (!session || typeof session !== "object") return false;
  if (session.finishedAt) return false;
  if (!Array.isArray(session.sections) || session.sections.length === 0) {
    return false;
  }
  return session.sections.every(
    (section) =>
      Array.isArray(section?.questions) &&
      Array.isArray(section?.answers) &&
      section.questions.length === section.answers.length,
  );
}

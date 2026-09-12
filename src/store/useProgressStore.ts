import { toSummary, type ExamSession, type ExamSummary } from "@/lib/exam";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  DayActivity,
  QuizSession,
  SentencePractice,
  StudyRating,
  StudySession,
  WordProgress,
} from "@/types";
import { toDateKey } from "@/lib/date-utils";
import { schedule, schedulingStateOf } from "@/lib/sm2";
import { TRACKS_SCHEMA_VERSION } from "@/lib/migrations/tracks";

interface ProgressState {
  /** Per-word progress by wordId */
  words: Record<string, WordProgress>;
  /** Daily activity by "YYYY-MM-DD" */
  activity: Record<string, DayActivity>;
  /** Sentence practices by `${wordId}:${date}` */
  sentences: Record<string, SentencePractice>;
  /** Recent quiz sessions (capped at 100) */
  quizzes: QuizSession[];
  /**
   * The exam in progress, if any.
   *
   * Persisted on every answer. A hundred questions is forty minutes of
   * someone's attention, and an exam that evaporates when a tab closes is
   * worse than no exam — they will not start a second one.
   */
  activeExam: ExamSession | null;
  /**
   * Finished exams as compact summaries, newest first.
   *
   * Summaries rather than sessions: a full one is ~37 KB, so a hundred would
   * be 3.6 MB and would overrun the localStorage quota the corpus and progress
   * records already share. docs/QUIZ-AND-EXAMS.md specified ids, not text.
   */
  exams: ExamSummary[];
  /** The most recent finished exam, in full, because its review is on screen. */
  lastExam: ExamSession | null;
  /** Recent study sessions (capped at 100) */
  studies: StudySession[];

  toggleMastered: (wordId: string, monthKey: string) => void;
  markReviewed: (wordId: string, monthKey: string) => void;
  /** Persist the exam in progress. Called on every answer. */
  saveExam: (session: ExamSession) => void;
  /** Move a finished exam into history. */
  finishExam: (session: ExamSession) => void;
  /** Throw away the exam in progress. */
  abandonExam: () => void;
  recordQuizAnswer: (
    wordId: string,
    monthKey: string,
    correct: boolean,
  ) => void;
  /** Apply a flashcard rating to word progress */
  applyStudyRating: (
    wordId: string,
    monthKey: string,
    rating: StudyRating,
  ) => void;
  saveSentences: (practice: SentencePractice) => void;
  addQuizSession: (session: QuizSession) => void;
  addStudySession: (session: StudySession) => void;
  reset: () => void;

  // Selectors
  isMastered: (wordId: string) => boolean;
  getWord: (wordId: string) => WordProgress | undefined;
  getSentences: (wordId: string, date: string) => SentencePractice | undefined;
}

function ensureWord(
  words: Record<string, WordProgress>,
  wordId: string,
  monthKey: string,
): WordProgress {
  return (
    words[wordId] ?? {
      wordId,
      monthKey,
      mastered: false,
      timesReviewed: 0,
      quizAttempts: 0,
      quizCorrect: 0,
      lastReviewed: null,
      masteredAt: null,
    }
  );
}

function ensureDay(
  activity: Record<string, DayActivity>,
  date: string,
): DayActivity {
  return (
    activity[date] ?? {
      date,
      wordsReviewed: 0,
      wordsMastered: 0,
      quizzesTaken: 0,
      sentencesWritten: 0,
    }
  );
}

const todayKey = () => toDateKey(new Date());

export const useProgressStore = create<ProgressState>()(
  persist(
    (setStore, get) => ({
      words: {},
      activity: {},
      sentences: {},
      quizzes: [],
      activeExam: null,
      exams: [],
      lastExam: null,
      studies: [],

      toggleMastered: (wordId, monthKey) => {
        setStore((state) => {
          const w = ensureWord(state.words, wordId, monthKey);
          const nextMastered = !w.mastered;
          const now = new Date().toISOString();
          const today = todayKey();
          const day = ensureDay(state.activity, today);
          return {
            words: {
              ...state.words,
              [wordId]: {
                ...w,
                mastered: nextMastered,
                masteredAt: nextMastered ? now : null,
                lastReviewed: now,
              },
            },
            activity: {
              ...state.activity,
              [today]: {
                ...day,
                wordsMastered: day.wordsMastered + (nextMastered ? 1 : 0),
                wordsReviewed: day.wordsReviewed + (w.timesReviewed === 0 ? 1 : 0),
              },
            },
          };
        });
      },

      markReviewed: (wordId, monthKey) => {
        setStore((state) => {
          const w = ensureWord(state.words, wordId, monthKey);
          const wasFirstToday =
            !w.lastReviewed ||
            toDateKey(new Date(w.lastReviewed)) !== todayKey();
          const now = new Date().toISOString();
          const today = todayKey();
          const day = ensureDay(state.activity, today);
          return {
            words: {
              ...state.words,
              [wordId]: {
                ...w,
                timesReviewed: w.timesReviewed + 1,
                lastReviewed: now,
              },
            },
            activity: {
              ...state.activity,
              [today]: {
                ...day,
                wordsReviewed: day.wordsReviewed + (wasFirstToday ? 1 : 0),
              },
            },
          };
        });
      },

      saveExam: (session) => setStore({ activeExam: session }),

      finishExam: (session) => {
        setStore((state) => ({
          activeExam: null,
          lastExam: session,
          exams: [toSummary(session), ...state.exams].slice(0, 100),
        }));
      },

      abandonExam: () => setStore({ activeExam: null }),

      recordQuizAnswer: (wordId, monthKey, correct) => {
        setStore((state) => {
          const w = ensureWord(state.words, wordId, monthKey);
          return {
            words: {
              ...state.words,
              [wordId]: {
                ...w,
                quizAttempts: w.quizAttempts + 1,
                quizCorrect: w.quizCorrect + (correct ? 1 : 0),
              },
            },
          };
        });
      },

      saveSentences: (practice) => {
        setStore((state) => {
          const key = `${practice.wordId}:${practice.date}`;
          const today = todayKey();
          const day = ensureDay(state.activity, today);
          const wasNew = !state.sentences[key];
          return {
            sentences: { ...state.sentences, [key]: practice },
            activity: wasNew
              ? {
                  ...state.activity,
                  [today]: {
                    ...day,
                    sentencesWritten: day.sentencesWritten + 1,
                  },
                }
              : state.activity,
          };
        });
      },

      addQuizSession: (session) => {
        setStore((state) => {
          const today = todayKey();
          const day = ensureDay(state.activity, today);
          const nextQuizzes = [session, ...state.quizzes].slice(0, 100);
          return {
            quizzes: nextQuizzes,
            activity: {
              ...state.activity,
              [today]: {
                ...day,
                quizzesTaken: day.quizzesTaken + 1,
              },
            },
          };
        });
      },

      applyStudyRating: (wordId, monthKey, rating) => {
        setStore((state) => {
          const w = ensureWord(state.words, wordId, monthKey);
          const now = new Date().toISOString();
          const today = todayKey();
          const day = ensureDay(state.activity, today);
          // Rating -> mastery change
          let nextMastered = w.mastered;
          let masteredAt = w.masteredAt;
          if (rating === "easy" && !w.mastered) {
            nextMastered = true;
            masteredAt = now;
          } else if (rating === "again" && w.mastered) {
            nextMastered = false;
            masteredAt = null;
          }
          const gained = nextMastered && !w.mastered ? 1 : 0;
          const lost = !nextMastered && w.mastered ? 1 : 0;
          const wasFirstToday =
            !w.lastReviewed ||
            toDateKey(new Date(w.lastReviewed)) !== todayKey();
          // SM-2 scheduling is independent of the mastery flag above: a word
          // can be "mastered" and still come up for review, which is the whole
          // point of spaced repetition.
          const prior = schedulingStateOf(w);
          const next = schedule(
            rating,
            prior.easeFactor,
            prior.intervalDays,
            prior.reps,
          );
          return {
            words: {
              ...state.words,
              [wordId]: {
                ...w,
                mastered: nextMastered,
                masteredAt,
                lastReviewed: now,
                timesReviewed: w.timesReviewed + 1,
                easeFactor: next.easeFactor,
                intervalDays: next.intervalDays,
                reps: next.reps,
                dueAt: next.dueAt,
              },
            },
            activity: {
              ...state.activity,
              [today]: {
                ...day,
                wordsReviewed: day.wordsReviewed + (wasFirstToday ? 1 : 0),
                wordsMastered: Math.max(0, day.wordsMastered + gained - lost),
              },
            },
          };
        });
      },

      addStudySession: (session) => {
        setStore((state) => {
          const today = todayKey();
          const day = ensureDay(state.activity, today);
          const nextStudies = [session, ...state.studies].slice(0, 100);
          return {
            studies: nextStudies,
            activity: {
              ...state.activity,
              [today]: {
                ...day,
                studySessions: (day.studySessions ?? 0) + 1,
              },
            },
          };
        });
      },

      reset: () =>
        setStore({
          words: {},
          activity: {},
          sentences: {},
          quizzes: [],
          activeExam: null,
          exams: [],
          studies: [],
        }),

      isMastered: (wordId) => get().words[wordId]?.mastered ?? false,
      getWord: (wordId) => get().words[wordId],
      getSentences: (wordId, date) => get().sentences[`${wordId}:${date}`],
    }),
    {
      name: "lexicon.progress.v1",
      // The tracks migration rewrites this blob and stamps the version on it.
      // Without a matching version here, zustand decides the stored state is
      // from a future it cannot read and **discards every progress record** —
      // which is the exact data loss the migration exists to prevent. A
      // browser found this; no unit test could, because none of them hydrate.
      version: TRACKS_SCHEMA_VERSION,
      migrate: (persisted) => persisted as ProgressState,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

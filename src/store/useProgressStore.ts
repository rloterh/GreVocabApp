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

interface ProgressState {
  /** Per-word progress by wordId */
  words: Record<string, WordProgress>;
  /** Daily activity by "YYYY-MM-DD" */
  activity: Record<string, DayActivity>;
  /** Sentence practices by `${wordId}:${date}` */
  sentences: Record<string, SentencePractice>;
  /** Recent quiz sessions (capped at 100) */
  quizzes: QuizSession[];
  /** Recent study sessions (capped at 100) */
  studies: StudySession[];

  toggleMastered: (wordId: string, monthKey: string) => void;
  markReviewed: (wordId: string, monthKey: string) => void;
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
          studies: [],
        }),

      isMastered: (wordId) => get().words[wordId]?.mastered ?? false,
      getWord: (wordId) => get().words[wordId],
      getSentences: (wordId, date) => get().sentences[`${wordId}:${date}`],
    }),
    {
      name: "lexicon.progress.v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

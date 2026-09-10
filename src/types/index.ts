/**
 * Core domain types — the contract everything else follows.
 *
 * When extending: prefer adding an optional field over widening an existing one,
 * and update src/lib/vocabulary.ts (parser) plus any consuming page/component.
 * See /CONTINUING.md for the full data-model map.
 *
 * A single vocabulary word.
 */
export interface VocabWord {
  /** Slugified, stable identifier — used as progress key */
  id: string;
  word: string;
  partOfSpeech: string;
  definition: string;
  example: string;
  mnemonic: string;
  /** Optional synonyms and antonyms for enrichment */
  synonyms?: string[];
  antonyms?: string[];
}

/** A single day's assignment (usually 3 words) */
export interface VocabDay {
  /** Day of month, 1-based */
  day: number;
  words: VocabWord[];
}

/**
 * One month's worth of vocabulary — this is what a JSON file contains.
 * The `month` field is ISO year-month ("2026-04").
 */
export interface VocabMonth {
  month: string; // "YYYY-MM"
  displayName: string; // "April 2026"
  days: VocabDay[];
  /** Optional metadata */
  author?: string;
  description?: string;
  createdAt?: string;
}

/** Per-word progress record */
export interface WordProgress {
  wordId: string;
  monthKey: string; // "YYYY-MM"
  mastered: boolean;
  timesReviewed: number;
  quizAttempts: number;
  quizCorrect: number;
  lastReviewed: string | null; // ISO date
  masteredAt: string | null;
}

/** User-written practice sentences with verification */
export interface SentencePractice {
  wordId: string;
  date: string; // ISO date
  sentences: string[];
  verification?: SentenceVerification;
}

export interface SentenceVerification {
  method: "api" | "heuristic";
  overall: "excellent" | "good" | "needs-work";
  perSentence: Array<{
    sentence: string;
    correct: boolean;
    usesWordCorrectly: boolean;
    grammaticallyValid: boolean;
    feedback: string;
    suggestion?: string;
  }>;
  timestamp: string;
}

/** Quiz question types */
export type QuizMode = "word-to-def" | "def-to-word" | "mixed";
export type QuizPool = "mastered" | "all" | "month" | "day";

export interface QuizQuestion {
  wordId: string;
  mode: "word-to-def" | "def-to-word";
  prompt: string; // word or definition
  correct: string; // definition or word
  options: string[]; // 4 options including correct
}

export interface QuizSession {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  mode: QuizMode;
  pool: QuizPool;
  poolContext?: string; // e.g. month key
  questions: QuizQuestion[];
  answers: Array<{ questionIdx: number; chosen: string; correct: boolean }>;
  score: number;
}

/** Daily activity used for streak calculation */
export interface DayActivity {
  date: string; // "YYYY-MM-DD"
  wordsReviewed: number;
  wordsMastered: number;
  quizzesTaken: number;
  sentencesWritten: number;
  studySessions?: number;
}

/** How the user rated their recall on a flashcard */
export type StudyRating = "again" | "hard" | "good" | "easy";

/** Deck-selection scope for a study session */
export type StudyDeck = "all" | "month" | "day" | "mastered" | "unmastered";

/** A single rated card in a study session */
export interface StudyEvent {
  wordId: string;
  rating: StudyRating;
  msToRate: number;
}

/** A completed flashcard study session */
export interface StudySession {
  id: string;
  startedAt: string;
  finishedAt: string;
  deck: StudyDeck;
  deckContext?: string;
  cardCount: number;
  events: StudyEvent[];
  bestStreak: number;
  totalMs: number;
}

/** App settings */
export interface Settings {
  theme: "light" | "dark" | "system";
  dataDirectory: string | null; // Tauri filesystem path
  anthropicApiKey: string | null;
  preferApiVerification: boolean;
  reduceMotion: boolean;
  fontSize: "sm" | "md" | "lg";
}

/** Aggregate stats for progress views */
export interface ProgressStats {
  totalWords: number;
  masteredWords: number;
  totalDaysWithActivity: number;
  currentStreak: number;
  longestStreak: number;
  averageAccuracy: number; // 0..1
  wordsThisWeek: number;
  wordsThisMonth: number;
  wordsThisQuarter: number;
  wordsThisYear: number;
}

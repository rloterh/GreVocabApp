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

  // SM-2 scheduling state. All optional: a progress record written before
  // spaced repetition shipped simply has none, and `src/lib/sm2.ts` fills in
  // defaults on the word's first flashcard rating. Never widen these to
  // required — that would invalidate everything already in localStorage.

  /** Ease factor, >= 1.3. Higher means the interval grows faster. */
  easeFactor?: number;
  /** Days between the last review and the next one. */
  intervalDays?: number;
  /** Consecutive successful repetitions; resets to 0 on an "again" rating. */
  reps?: number;
  /** ISO timestamp of the next scheduled review. */
  dueAt?: string | null;
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
export type StudyDeck =
  | "all"
  | "month"
  | "day"
  | "mastered"
  | "unmastered"
  /** Words the SM-2 scheduler says are due for review today or earlier. */
  | "due";

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

/** Palettes the app can render. "system" resolves to light or dark. */
export type Theme =
  | "light"
  | "dark"
  | "system"
  | "sepia"
  | "solarized"
  | "high-contrast";

/** App settings */
export interface Settings {
  theme: Theme;
  dataDirectory: string | null; // Tauri filesystem path
  anthropicApiKey: string | null;
  preferApiVerification: boolean;
  reduceMotion: boolean;
  fontSize: "sm" | "md" | "lg";
  /** Set once the user has dismissed the spaced-repetition explainer. */
  hasSeenSrsIntro: boolean;
  /** Opt-in daily nudge. Only fires while the app is open. */
  studyReminderEnabled: boolean;
  /** Local time for the nudge, "HH:mm". */
  studyReminderTime: string;
  /** Date key of the last reminder shown, so it fires at most once a day. */
  lastReminderDate: string | null;
  /** Folder the desktop build watches for new vocabulary files. */
  watchedFolder: string | null;
  /** Set once the first-run walkthrough has been seen or skipped. */
  hasOnboarded: boolean;
  /** Opt-in interface sounds. */
  soundEnabled: boolean;
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

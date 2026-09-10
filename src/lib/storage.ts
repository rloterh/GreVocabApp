/**
 * Storage abstraction.
 * In browser: localStorage.
 * In Tauri: could later use fs plugin for a JSON file in appDataDir.
 * For now both use localStorage for simplicity; the interface allows switching.
 */

export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

class LocalStorageAdapter implements StorageAdapter {
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    localStorage.setItem(key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
  }

  async keys(): Promise<string[]> {
    return Object.keys(localStorage);
  }
}

export const storage: StorageAdapter = new LocalStorageAdapter();

/** Keys used across the app */
export const StorageKeys = {
  progress: "lexicon.progress.v1",
  sentences: "lexicon.sentences.v1",
  activity: "lexicon.activity.v1",
  quizHistory: "lexicon.quizHistory.v1",
  settings: "lexicon.settings.v1",
  vocabIndex: "lexicon.vocabIndex.v1",
  vocabData: (monthKey: string) => `lexicon.vocab.${monthKey}`,
} as const;

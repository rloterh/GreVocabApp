import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { SettingsState as PersistedSettings } from "@/types";

/**
 * The store holds preferences and credentials together for convenience, but
 * the two are distinct types. Anything that persists or transmits state should
 * take `Settings` and go through `stripSecrets` — see
 * docs/adr/0010-secrets-handling.md.
 */
interface SettingsStore extends PersistedSettings {
  set: (partial: Partial<PersistedSettings>) => void;
  reset: () => void;
}

const DEFAULT_SETTINGS: PersistedSettings = {
  theme: "dark",
  dataDirectory: null,
  anthropicApiKey: null,
  preferApiVerification: true,
  reduceMotion: false,
  fontSize: "md",
  hasSeenSrsIntro: false,
  studyReminderEnabled: false,
  studyReminderTime: "19:00",
  lastReminderDate: null,
  watchedFolder: null,
  hasOnboarded: false,
  soundEnabled: false,
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (setStore) => ({
      ...DEFAULT_SETTINGS,
      set: (partial) => setStore(partial),
      reset: () => setStore(DEFAULT_SETTINGS),
    }),
    {
      name: "lexicon.settings.v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

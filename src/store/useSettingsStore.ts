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
  wordOrder: "authored",
  lastQuizPool: "due",
  lastQuizCount: 10,
  fontSize: "md",
  hasSeenSrsIntro: false,
  studyReminderEnabled: false,
  studyReminderTime: "19:00",
  lastReminderDate: null,
  watchedFolder: null,
  hasOnboarded: false,
  soundEnabled: false,
  speechVoice: null,
  speechRate: 0.9,
  // Off: a card that starts talking the moment it is flipped is startling in
  // a library and in a shared room, and the speaker button is right there.
  autoPronounce: false,
  showWordRelations: true,
  enabledAiTools: [],
  pinnedProvider: null,
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

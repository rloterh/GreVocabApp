import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Settings } from "@/types";

interface SettingsState extends Settings {
  set: (partial: Partial<Settings>) => void;
  reset: () => void;
}

const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  dataDirectory: null,
  anthropicApiKey: null,
  preferApiVerification: true,
  reduceMotion: false,
  fontSize: "md",
};

export const useSettingsStore = create<SettingsState>()(
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

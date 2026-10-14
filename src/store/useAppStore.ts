import { create } from "zustand";

export type Page =
  | "dashboard"
  | "practice"
  | "flashcards"
  | "quiz"
  | "exam"
  | "games"
  | "sentences"
  | "calendar"
  | "archive"
  | "progress"
  | "search"
  | "settings";

interface AppState {
  page: Page;
  navigate: (page: Page) => void;
  /**
   * Counts every navigation, including to the page already open — so a page
   * can tell "the user tapped my nav item again", which means "take me back
   * to your start". Games uses it to leave a results screen.
   */
  visits: number;
  toast: { id: number; title: string; description?: string; variant?: "default" | "success" | "error" } | null;
  showToast: (t: { title: string; description?: string; variant?: "default" | "success" | "error" }) => void;
  clearToast: () => void;
  /**
   * Set while a game round has the screen.
   *
   * Global shortcuts stand down — "g d" mid-question would throw a round away
   * — and the system back gesture is offered to `backHandler` first.
   */
  immersive: boolean;
  setImmersive: (on: boolean) => void;
  /**
   * Given first refusal on the system back gesture. Return true to say it was
   * handled (a game pauses rather than being left). One at a time.
   */
  backHandler: (() => boolean) | null;
  setBackHandler: (handler: (() => boolean) | null) => void;
  /**
   * Something another page asked Games to open on arrival — the Dashboard's
   * Daily Round card. Games consumes it and clears it.
   */
  gamesIntent: "daily" | null;
  setGamesIntent: (intent: "daily" | null) => void;
}

let toastId = 0;

export const useAppStore = create<AppState>((set) => ({
  page: "dashboard",
  visits: 0,
  navigate: (page) => set((s) => ({ page, visits: s.visits + 1 })),
  toast: null,
  showToast: (t) => {
    toastId++;
    const id = toastId;
    set({ toast: { id, ...t } });
    setTimeout(() => {
      set((s) => (s.toast?.id === id ? { toast: null } : s));
    }, 3500);
  },
  clearToast: () => set({ toast: null }),
  immersive: false,
  setImmersive: (on) => set({ immersive: on }),
  backHandler: null,
  setBackHandler: (handler) => set({ backHandler: handler }),
  gamesIntent: null,
  setGamesIntent: (intent) => set({ gamesIntent: intent }),
}));

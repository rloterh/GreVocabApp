import { create } from "zustand";

export type Page =
  | "dashboard"
  | "practice"
  | "flashcards"
  | "quiz"
  | "sentences"
  | "calendar"
  | "archive"
  | "progress"
  | "search"
  | "settings";

interface AppState {
  page: Page;
  navigate: (page: Page) => void;
  toast: { id: number; title: string; description?: string; variant?: "default" | "success" | "error" } | null;
  showToast: (t: { title: string; description?: string; variant?: "default" | "success" | "error" }) => void;
  clearToast: () => void;
}

let toastId = 0;

export const useAppStore = create<AppState>((set) => ({
  page: "dashboard",
  navigate: (page) => set({ page }),
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
}));

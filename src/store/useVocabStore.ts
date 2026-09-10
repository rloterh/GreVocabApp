import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { VocabMonth, VocabWord } from "@/types";
import { parseVocabMonth, wordsForDay } from "@/lib/vocabulary";

interface VocabState {
  /** All loaded months keyed by month key ("YYYY-MM") */
  months: Record<string, VocabMonth>;
  /** Currently viewed month key */
  activeMonthKey: string | null;
  /** Selected day within active month (1-based) */
  selectedDay: number;

  loadMonth: (raw: unknown) => { ok: true; monthKey: string } | { ok: false; error: string };
  removeMonth: (monthKey: string) => void;
  setActiveMonth: (monthKey: string) => void;
  setSelectedDay: (day: number) => void;

  // Selectors (computed getters)
  getActiveMonth: () => VocabMonth | null;
  getWordsForSelectedDay: () => VocabWord[];
  getAllMonths: () => VocabMonth[];
  hasMonthKey: (monthKey: string) => boolean;
  hasDayInMonth: (monthKey: string, day: number) => boolean;
}

export const useVocabStore = create<VocabState>()(
  persist(
    (setStore, get) => ({
      months: {},
      activeMonthKey: null,
      selectedDay: 1,

      loadMonth: (raw) => {
        try {
          const parsed = parseVocabMonth(raw);
          setStore((state) => ({
            months: { ...state.months, [parsed.month]: parsed },
            // If nothing active yet, set this one
            activeMonthKey: state.activeMonthKey ?? parsed.month,
          }));
          return { ok: true as const, monthKey: parsed.month };
        } catch (e) {
          const message = e instanceof Error ? e.message : "Unknown parse error";
          return { ok: false as const, error: message };
        }
      },

      removeMonth: (monthKey) => {
        setStore((state) => {
          const { [monthKey]: _removed, ...rest } = state.months;
          void _removed;
          const nextActive =
            state.activeMonthKey === monthKey
              ? (Object.keys(rest)[0] ?? null)
              : state.activeMonthKey;
          return { months: rest, activeMonthKey: nextActive };
        });
      },

      setActiveMonth: (monthKey) => {
        setStore({ activeMonthKey: monthKey, selectedDay: 1 });
      },

      setSelectedDay: (day) => setStore({ selectedDay: day }),

      getActiveMonth: () => {
        const { months, activeMonthKey } = get();
        return activeMonthKey ? (months[activeMonthKey] ?? null) : null;
      },

      getWordsForSelectedDay: () => {
        const month = get().getActiveMonth();
        if (!month) return [];
        return wordsForDay(month, get().selectedDay);
      },

      getAllMonths: () => {
        return Object.values(get().months).sort((a, b) =>
          a.month.localeCompare(b.month),
        );
      },

      hasMonthKey: (monthKey) => Boolean(get().months[monthKey]),

      hasDayInMonth: (monthKey, day) => {
        const m = get().months[monthKey];
        if (!m) return false;
        return m.days.some((d) => d.day === day);
      },
    }),
    {
      name: "lexicon.vocab.v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        months: state.months,
        activeMonthKey: state.activeMonthKey,
        selectedDay: state.selectedDay,
      }),
    },
  ),
);

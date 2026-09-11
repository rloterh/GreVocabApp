import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { VocabMonth, VocabWord } from "@/types";
import { parseVocabMonth, wordsForDay } from "@/lib/vocabulary";
import { VocabIndex, type VocabIndexEntry } from "@/lib/vocab-index";

interface VocabState {
  /** All loaded months keyed by month key ("YYYY-MM") */
  months: Record<string, VocabMonth>;
  /**
   * Words from months the user removed.
   *
   * Removing a month does not free its words: regenerating would otherwise
   * hand back words already studied, and progress records — which are keyed by
   * word id and survive independently — would silently reattach to "new"
   * words. Persisted because the months these came from are gone, so nothing
   * else remembers them. See docs/adr/0005-dedup-by-stem-with-retirement.md.
   */
  retiredWords: VocabIndexEntry[];
  /** Currently viewed month key */
  activeMonthKey: string | null;
  /** Selected day within active month (1-based) */
  selectedDay: number;

  loadMonth: (raw: unknown) => { ok: true; monthKey: string } | { ok: false; error: string };
  removeMonth: (monthKey: string) => void;
  /** Let retired words be generated again. Explicit, never automatic. */
  releaseRetired: (monthKey?: string) => number;
  /**
   * Append words to a month that already exists.
   *
   * Existing days are left exactly as they are — a user part-way through a
   * month should not find yesterday's words rearranged. New words fill the
   * last day up to `wordsPerDay` and then start new ones.
   */
  addWordsToMonth: (
    monthKey: string,
    words: VocabWord[],
    wordsPerDay?: number,
  ) => { ok: true; added: number } | { ok: false; error: string };
  setActiveMonth: (monthKey: string) => void;
  setSelectedDay: (day: number) => void;

  // Selectors (computed getters)
  getActiveMonth: () => VocabMonth | null;
  getWordsForSelectedDay: () => VocabWord[];
  getAllMonths: () => VocabMonth[];
  /** Every word known, loaded or retired. Derived; never persisted. */
  getVocabIndex: () => VocabIndex;
  hasMonthKey: (monthKey: string) => boolean;
  hasDayInMonth: (monthKey: string, day: number) => boolean;
}

export const useVocabStore = create<VocabState>()(
  persist(
    (setStore, get) => ({
      months: {},
      retiredWords: [],
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
          const { [monthKey]: removed, ...rest } = state.months;
          const nextActive =
            state.activeMonthKey === monthKey
              ? (Object.keys(rest)[0] ?? null)
              : state.activeMonthKey;

          // Retire rather than forget. Only words that are not already
          // retired and not still present in another loaded month.
          let retiredWords = state.retiredWords;
          if (removed) {
            const index = VocabIndex.from([removed]);
            const known = new Set(state.retiredWords.map((e) => e.stem));
            const newlyRetired = index
              .retireMonth(monthKey)
              .filter((entry) => !known.has(entry.stem));
            if (newlyRetired.length > 0) {
              retiredWords = [...state.retiredWords, ...newlyRetired];
            }
          }

          return { months: rest, retiredWords, activeMonthKey: nextActive };
        });
      },

      addWordsToMonth: (monthKey, words, wordsPerDay = 3) => {
        const month = get().months[monthKey];
        if (!month) return { ok: false as const, error: "That month is not loaded." };
        if (words.length === 0) return { ok: true as const, added: 0 };

        const days = month.days.map((day) => ({ ...day, words: [...day.words] }));
        let remaining = [...words];

        // Top up the last day before opening a new one, so a month does not
        // end with a day of one word and a day of three.
        const last = days[days.length - 1];
        if (last && last.words.length < wordsPerDay) {
          last.words.push(...remaining.splice(0, wordsPerDay - last.words.length));
        }

        let nextDay = (days[days.length - 1]?.day ?? 0) + 1;
        while (remaining.length > 0 && nextDay <= 31) {
          days.push({ day: nextDay, words: remaining.splice(0, wordsPerDay) });
          nextDay++;
        }

        setStore((state) => ({
          months: { ...state.months, [monthKey]: { ...month, days } },
        }));

        // A month is 31 days; anything past that has nowhere to go.
        return { ok: true as const, added: words.length - remaining.length };
      },

      releaseRetired: (monthKey) => {
        const before = get().retiredWords;
        const after = monthKey
          ? before.filter((entry) => entry.monthKey !== monthKey)
          : [];
        setStore({ retiredWords: after });
        return before.length - after.length;
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

      getVocabIndex: () => {
        // Derived on demand rather than stored: the months are the source of
        // truth, and a stale index would be worse than no index.
        const { months, retiredWords } = get();
        return VocabIndex.from(Object.values(months), retiredWords);
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
        retiredWords: state.retiredWords,
        activeMonthKey: state.activeMonthKey,
        selectedDay: state.selectedDay,
      }),
    },
  ),
);

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Schedule, Track, VocabMonth, VocabWord } from "@/types";
import {
  disambiguate,
  firstFreeOrdinal,
  parseVocabMonth,
  wordsForDay,
} from "@/lib/vocabulary";
import { VocabIndex, type VocabIndexEntry } from "@/lib/vocab-index";
import { monthsInTeachingOrder } from "@/lib/months-in-order";
import {
  DEFAULT_TRACK,
  keyOf,
  monthKey as buildMonthKey,
  trackOfKey,
} from "@/lib/track";
import {
  calendarMonthOfDate,
  identitySchedule,
  ordinalForCalendarMonth,
  reconcile,
  redistributeWords,
  shuffledSchedule,
  type CalendarMonth,
} from "@/lib/schedule";
import { TRACKS_SCHEMA_VERSION } from "@/lib/migrations/tracks";

interface LoadOptions {
  /** Track to file the month under when the file does not name one. */
  track?: Track;
  /** Teaching position to use when the file does not carry one. */
  ordinal?: number;
}

interface VocabState {
  /** All loaded months keyed by `"gre/01"` — track and teaching position. */
  months: Record<string, VocabMonth>;
  /**
   * When each track's months fall on the calendar.
   *
   * A track with content and no schedule has not been set up yet; the store
   * writes an identity schedule starting this month rather than leaving the
   * app unable to say what is due. See docs/SCHEDULE.md.
   */
  schedules: Partial<Record<Track, Schedule>>;
  /**
   * Which notebook is open.
   *
   * Lives here rather than in settings because every selector below needs it,
   * and a preference the vocabulary store has to reach across to another store
   * for is a preference that will eventually be read stale.
   */
  activeTrack: Track;
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
  /**
   * Where the user was in each track, so switching away and back returns them.
   *
   * Two tracks are two accounts belonging to one person: either is always
   * there, and coming back to one should find it as it was left. A single
   * shared `activeMonthKey` could not express that — the key always belonged
   * to the track just left, so the guard rejected it and dropped the user on
   * month one, day one. Leaving GRE at month 2 day 7 to glance at SAT lost
   * both.
   */
  trackPositions: Partial<Record<Track, { monthKey: string; day: number }>>;

  loadMonth: (
    raw: unknown,
    options?: LoadOptions,
  ) => { ok: true; monthKey: string } | { ok: false; error: string };
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

  /** Open a different notebook. Nothing is lost, so nothing asks first. */
  setActiveTrack: (track: Track) => void;
  /** Write a track's schedule, creating one if it has none. */
  setSchedule: (track: Track, schedule: Schedule) => void;
  /** Start (or restart) a track on a given calendar month. */
  setStartMonth: (track: Track, startMonth: CalendarMonth) => void;
  /** Put a track's months in a seeded random order. Moves no words. */
  shuffleMonths: (track: Track, seed?: string) => void;
  /** Put a track's months back in the order the corpus teaches them. */
  resetMonthOrder: (track: Track) => void;
  /** Deal a track's words back out across its months. Moves words; keeps ids. */
  redistribute: (track: Track, seed?: string) => void;

  // Selectors (computed getters)
  getActiveMonth: () => VocabMonth | null;
  getWordsForSelectedDay: () => VocabWord[];
  /** Months of the active track, in the order the schedule teaches them. */
  getAllMonths: () => VocabMonth[];
  getMonthsForTrack: (track: Track) => VocabMonth[];
  /** The active track's schedule, created on demand if it has none. */
  getSchedule: (track?: Track) => Schedule;
  /** Every word known in a track, loaded or retired. Derived; never persisted. */
  getVocabIndex: (track?: Track) => VocabIndex;
  hasMonthKey: (monthKey: string) => boolean;
  hasDayInMonth: (monthKey: string, day: number) => boolean;
  /** The first teaching position in a track with nothing in it. */
  nextOrdinal: (track: Track) => number;
  /**
   * Where new vocabulary should land: `"gre/07"`.
   *
   * The replacement for `firstFreeMonthKey`, which asked the same question in
   * calendar months and so could not be asked at all once content stopped
   * having dates.
   */
  nextMonthKey: (track?: Track) => string;
  /**
   * The month the schedule says is studied on a given date, if any.
   *
   * The replacement for "the month whose key matches that date", which is a
   * question the store can no longer answer directly and, for a user who
   * started last March, was never the right question.
   */
  monthKeyForDate: (when?: Date, track?: Track) => string | null;
}

/** Months belonging to one track, ordinal order. */
function monthsOf(
  months: Record<string, VocabMonth>,
  track: Track,
): VocabMonth[] {
  return Object.values(months)
    .filter((m) => m.track === track)
    .sort((a, b) => a.ordinal - b.ordinal);
}

export const useVocabStore = create<VocabState>()(
  persist(
    (setStore, get) => ({
      months: {},
      schedules: {},
      trackPositions: {},
      activeTrack: DEFAULT_TRACK,
      retiredWords: [],
      activeMonthKey: null,
      selectedDay: 1,

      loadMonth: (raw, options = {}) => {
        try {
          const state = get();
          const track = options.track ?? state.activeTrack;
          const ordinal =
            options.ordinal ?? state.nextOrdinal(track);
          const parsed = parseVocabMonth(raw, { track, ordinal });

          // Uniqueness used to come free from ids naming their own month. It
          // does not any more, so a word arriving with an id another month in
          // this track already uses is renamed here, at the door.
          const taken = new Set<string>();
          for (const month of monthsOf(state.months, parsed.track)) {
            if (month.ordinal === parsed.ordinal) continue;
            for (const day of month.days) {
              for (const word of day.words) taken.add(word.id);
            }
          }
          const month = disambiguate(parsed, taken);
          const key = keyOf(month);

          setStore((current) => {
            const months = { ...current.months, [key]: month };
            return {
              months,
              schedules: {
                ...current.schedules,
                [month.track]: reconcile(
                  scheduleFor(current, month.track),
                  monthsOf(months, month.track).map((m) => m.ordinal),
                ),
              },
              // If nothing active yet, set this one
              activeMonthKey: current.activeMonthKey ?? key,
            };
          });
          return { ok: true as const, monthKey: key };
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

          const schedules = { ...state.schedules };
          if (removed) {
            schedules[removed.track] = reconcile(
              scheduleFor(state, removed.track),
              monthsOf(rest, removed.track).map((m) => m.ordinal),
            );
          }

          return {
            months: rest,
            retiredWords,
            schedules,
            activeMonthKey: nextActive,
          };
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
        // Following a month into another track switches notebooks rather than
        // showing a month the rest of the app has filtered out from under it.
        const track = trackOfKey(monthKey);
        setStore((state) => ({
          activeMonthKey: monthKey,
          selectedDay: 1,
          activeTrack: track ?? state.activeTrack,
        }));
      },

      setSelectedDay: (day) => setStore({ selectedDay: day }),

      setActiveTrack: (track) => {
        setStore((state) => {
          if (state.activeTrack === track) return state;

          // Put the outgoing track down where it stands, so returning to it
          // later finds it there.
          const positions = { ...state.trackPositions };
          if (state.activeMonthKey) {
            positions[state.activeTrack] = {
              monthKey: state.activeMonthKey,
              day: state.selectedDay,
            };
          }

          // Pick the incoming track back up. A remembered month may since have
          // been unloaded, and a remembered day may be past the end of a month
          // that was redistributed, so both are checked rather than trusted.
          const remembered = positions[track];
          const months = monthsOf(state.months, track);
          const valid =
            remembered && months.some((m) => keyOf(m) === remembered.monthKey)
              ? remembered
              : null;
          const first = months[0];
          const monthKey = valid ? valid.monthKey : first ? keyOf(first) : null;
          const month = monthKey ? state.months[monthKey] : undefined;
          const day =
            valid && month?.days.some((d) => d.day === valid.day)
              ? valid.day
              : 1;

          return {
            activeTrack: track,
            activeMonthKey: monthKey,
            selectedDay: day,
            trackPositions: positions,
          };
        });
      },

      setSchedule: (track, schedule) => {
        setStore((state) => ({
          schedules: { ...state.schedules, [track]: schedule },
        }));
      },

      setStartMonth: (track, startMonth) => {
        setStore((state) => ({
          schedules: {
            ...state.schedules,
            [track]: { ...scheduleFor(state, track), startMonth },
          },
        }));
      },

      shuffleMonths: (track, seed = String(Date.now())) => {
        setStore((state) => ({
          schedules: {
            ...state.schedules,
            [track]: shuffledSchedule(
              track,
              scheduleFor(state, track).startMonth,
              monthsOf(state.months, track).map((m) => m.ordinal),
              seed,
            ),
          },
        }));
      },

      resetMonthOrder: (track) => {
        setStore((state) => ({
          schedules: {
            ...state.schedules,
            [track]: identitySchedule(
              track,
              scheduleFor(state, track).startMonth,
              monthsOf(state.months, track).map((m) => m.ordinal),
            ),
          },
        }));
      },

      redistribute: (track, seed = String(Date.now())) => {
        setStore((state) => {
          const shuffled = redistributeWords(
            monthsOf(state.months, track),
            seed,
          );
          const months = { ...state.months };
          for (const month of shuffled) months[keyOf(month)] = month;
          return {
            months,
            schedules: {
              ...state.schedules,
              [track]: { ...scheduleFor(state, track), shuffleSeed: seed },
            },
          };
        });
      },

      getActiveMonth: () => {
        const { months, activeMonthKey } = get();
        return activeMonthKey ? (months[activeMonthKey] ?? null) : null;
      },

      getWordsForSelectedDay: () => {
        const month = get().getActiveMonth();
        if (!month) return [];
        return wordsForDay(month, get().selectedDay);
      },

      getAllMonths: () => get().getMonthsForTrack(get().activeTrack),

      // Delegates, so the store and `useAllMonths` cannot drift apart. React
      // callers should prefer the hook: this reads three pieces of state
      // through `get()`, which no dependency array can see.
      getMonthsForTrack: (track) => {
        const state = get();
        return monthsInTeachingOrder(state.months, state.schedules, track);
      },

      getSchedule: (track) => scheduleFor(get(), track ?? get().activeTrack),

      getVocabIndex: (track) => {
        // Derived on demand rather than stored: the months are the source of
        // truth, and a stale index would be worse than no index.
        //
        // Per track, deliberately. A word may appear in both the SAT and GRE
        // corpora — they are separate curricula, not two halves of one — so
        // consulting one track's index while generating the other's would
        // strip out exactly the overlap that belongs there.
        // See docs/adr/0013-cross-track-overlap.md.
        const state = get();
        const which = track ?? state.activeTrack;
        return VocabIndex.from(
          monthsOf(state.months, which),
          state.retiredWords.filter(
            (entry) => trackOfKey(entry.monthKey) === which,
          ),
        );
      },

      hasMonthKey: (monthKey) => Boolean(get().months[monthKey]),

      hasDayInMonth: (monthKey, day) => {
        const m = get().months[monthKey];
        if (!m) return false;
        return m.days.some((d) => d.day === day);
      },

      nextOrdinal: (track) =>
        firstFreeOrdinal(monthsOf(get().months, track).map((m) => m.ordinal)),

      nextMonthKey: (track) => {
        const which = track ?? get().activeTrack;
        return buildMonthKey(which, get().nextOrdinal(which));
      },

      monthKeyForDate: (when = new Date(), track) => {
        const state = get();
        const which = track ?? state.activeTrack;
        const ordinal = ordinalForCalendarMonth(
          scheduleFor(state, which),
          calendarMonthOfDate(when),
        );
        if (ordinal === null) return null;
        const key = buildMonthKey(which, ordinal);
        return key in state.months ? key : null;
      },
    }),
    {
      name: "lexicon.vocab.v1",
      version: TRACKS_SCHEMA_VERSION,
      storage: createJSONStorage(() => localStorage),
      // The real work happens in `runMigrations` before this store is even
      // imported — the id map it builds is needed by the progress store too.
      // This exists so that a blob which somehow arrives unmigrated is handed
      // through rather than silently discarded, which is zustand's default.
      migrate: (persisted) => persisted as VocabState,
      partialize: (state) => ({
        months: state.months,
        schedules: state.schedules,
        activeTrack: state.activeTrack,
        trackPositions: state.trackPositions,
        retiredWords: state.retiredWords,
        activeMonthKey: state.activeMonthKey,
        selectedDay: state.selectedDay,
      }),
    },
  ),
);

/**
 * A track's schedule, or the one it should have.
 *
 * Created rather than returned null: every caller wants an answer to "when is
 * this studied", and the honest default — start this month, months as taught —
 * is one the first-run screen then offers to change.
 */
function scheduleFor(
  state: Pick<VocabState, "months" | "schedules">,
  track: Track,
): Schedule {
  const existing = state.schedules[track];
  if (existing) return existing;
  return identitySchedule(
    track,
    calendarMonthOfDate(new Date()),
    monthsOf(state.months, track).map((m) => m.ordinal),
  );
}

/** `"gre/01"` for a track and teaching position. Re-exported for convenience. */
export { buildMonthKey as monthKeyFor };

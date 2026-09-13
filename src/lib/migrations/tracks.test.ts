/**
 * The migration that either keeps or throws away months of somebody's work.
 *
 * ADR 0011 says this plainly: "A migration that loses progress is worse than
 * not shipping the feature. If the tests cannot demonstrate it holds, this ADR
 * is wrong." These are those tests.
 *
 * The load-bearing one is `the acceptance test` at the bottom: a store taken
 * before the migration, read after it, shows the same words on the same days
 * with the same progress.
 */

import { describe, expect, it } from "vitest";
import {
  PROGRESS_KEY,
  VOCAB_KEY,
  findOrphans,
  planMigration,
  rewriteIds,
  runTracksMigration,
  scheduleFor,
  type MigrationStorage,
} from "./tracks";
import { ordinalForCalendarMonth } from "@/lib/schedule";
import type { VocabMonth } from "@/types";

// --- Fixtures ----------------------------------------------------------------

function legacyWord(month: string, word: string) {
  return {
    id: `${month}-${word}`,
    word,
    partOfSpeech: "verb",
    definition: `To ${word}.`,
    example: `They ${word}.`,
    mnemonic: `Think of ${word}.`,
  };
}

function legacyMonth(month: string, words: string[]) {
  return {
    month,
    displayName: month,
    days: words.map((w, i) => ({ day: i + 1, words: [legacyWord(month, w)] })),
  };
}

/** A store as it looked before tracks: calendar keys, calendar ids. */
function legacyStorage(
  months: Record<string, ReturnType<typeof legacyMonth>>,
  progress: Record<string, unknown> = {},
): MigrationStorage & { read(key: string): any } {
  const data = new Map<string, string>();
  data.set(
    VOCAB_KEY,
    JSON.stringify({
      state: {
        months,
        retiredWords: [],
        activeMonthKey: Object.keys(months)[0] ?? null,
        selectedDay: 1,
      },
      version: 0,
    }),
  );
  data.set(PROGRESS_KEY, JSON.stringify({ state: progress, version: 0 }));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    read: (key) => JSON.parse(data.get(key)!),
  };
}

const APRIL = legacyMonth("2026-04", ["abate", "cogent"]);
const MAY = legacyMonth("2026-05", ["laconic"]);

function progressFor(ids: string[], monthKey: string) {
  return {
    words: Object.fromEntries(
      ids.map((id) => [
        id,
        {
          wordId: id,
          monthKey,
          mastered: true,
          timesReviewed: 4,
          quizAttempts: 2,
          quizCorrect: 2,
          lastReviewed: "2026-08-01",
          masteredAt: "2026-08-01",
          easeFactor: 2.6,
          intervalDays: 12,
          reps: 3,
          dueAt: "2026-08-13T00:00:00.000Z",
        },
      ]),
    ),
    activity: {},
    sentences: {},
    quizzes: [],
    exams: [],
    studies: [],
    activeExam: null,
    lastExam: null,
  };
}

// --- Ordinals and keys -------------------------------------------------------

describe("planMigration", () => {
  it("numbers months chronologically, whatever order they are stored in", () => {
    const plan = planMigration(
      { "2026-05": MAY, "2026-04": APRIL },
      ["2026-05", "2026-04"],
    );
    expect(plan.monthKeys).toEqual({ "2026-04": "gre/01", "2026-05": "gre/02" });
    expect(plan.months["gre/01"].ordinal).toBe(1);
    expect(plan.months["gre/02"].ordinal).toBe(2);
  });

  it("files everything that existed before tracks under GRE", () => {
    const plan = planMigration({ "2026-04": APRIL }, ["2026-04"]);
    expect(plan.months["gre/01"].track).toBe("gre");
  });

  it("strips the calendar out of every word id", () => {
    const plan = planMigration({ "2026-04": APRIL }, ["2026-04"]);
    expect(plan.wordIds).toEqual({
      "2026-04-abate": "gre-abate",
      "2026-04-cogent": "gre-cogent",
    });
  });

  it("keeps the old month name as the title, so nothing looks renamed", () => {
    const plan = planMigration({ "2026-04": APRIL }, ["2026-04"]);
    expect(plan.months["gre/01"].title).toBe("2026-04");
  });

  it("resolves a word two months both contained", () => {
    // `2026-04-abate` and `2026-05-abate` were distinct. `gre-abate` cannot be
    // both, and letting one win would mean mastering either marked both.
    const plan = planMigration(
      { "2026-04": legacyMonth("2026-04", ["abate"]), "2026-05": legacyMonth("2026-05", ["abate"]) },
      ["2026-04", "2026-05"],
    );
    expect(plan.wordIds["2026-04-abate"]).toBe("gre-abate");
    expect(plan.wordIds["2026-05-abate"]).toBe("gre-abate-2");
    expect(new Set(Object.values(plan.wordIds)).size).toBe(2);
  });

  it("derives an id from the word when the old one was foreign", () => {
    const odd = {
      month: "2026-04",
      displayName: "April",
      days: [{ day: 1, words: [{ ...legacyWord("2026-04", "abate"), id: "" }] }],
    };
    const plan = planMigration({ "2026-04": odd }, ["2026-04"]);
    expect(plan.months["gre/01"].days[0].words[0].id).toBe("gre-abate");
  });
});

// --- The schedule reproduces the calendar the user already had ---------------

describe("scheduleFor", () => {
  it("starts on the user's earliest month", () => {
    expect(scheduleFor(["2026-04", "2026-05"]).startMonth).toBe("2026-04");
  });

  it("is the identity permutation for consecutive months", () => {
    expect(scheduleFor(["2026-04", "2026-05", "2026-06"]).order).toEqual([1, 2, 3]);
  });

  it("holds a gap open rather than sliding later months forward", () => {
    // April and September, nothing between. A dense schedule would teach
    // September in May — moving somebody's work without saying so.
    const schedule = scheduleFor(["2026-04", "2026-09"]);
    expect(schedule.order).toEqual([1, 0, 0, 0, 0, 2]);
    expect(ordinalForCalendarMonth(schedule, "2026-04")).toBe(1);
    expect(ordinalForCalendarMonth(schedule, "2026-06")).toBeNull();
    expect(ordinalForCalendarMonth(schedule, "2026-09")).toBe(2);
  });

  it("puts every month back on the calendar month it was already on", () => {
    const keys = ["2026-04", "2026-07", "2026-08", "2027-02"];
    const schedule = scheduleFor(keys);
    keys.forEach((key, i) => {
      expect(ordinalForCalendarMonth(schedule, key)).toBe(i + 1);
    });
  });
});

// --- Rewriting ---------------------------------------------------------------

describe("rewriteIds", () => {
  const ids = { "2026-04-abate": "gre-abate" };
  const keys = { "2026-04": "gre/01" };

  it("rewrites a record's keys and its fields together", () => {
    expect(
      rewriteIds(
        { words: { "2026-04-abate": { wordId: "2026-04-abate", monthKey: "2026-04" } } },
        ids,
        keys,
      ),
    ).toEqual({
      words: { "gre-abate": { wordId: "gre-abate", monthKey: "gre/01" } },
    });
  });

  it("rewrites the head of a composite key", () => {
    // Sentences are keyed `${wordId}:${date}`.
    expect(
      rewriteIds({ sentences: { "2026-04-abate:2026-08-01": { wordId: "2026-04-abate" } } }, ids, keys),
    ).toEqual({ sentences: { "gre-abate:2026-08-01": { wordId: "gre-abate" } } });
  });

  it("reaches ids buried in arrays", () => {
    expect(rewriteIds({ exams: [{ missed: ["2026-04-abate"] }] }, ids, keys)).toEqual({
      exams: [{ missed: ["gre-abate"] }],
    });
  });

  it("leaves prose alone, even when it contains an id-shaped string", () => {
    const prose = "See 2026-04-abate for context";
    expect(rewriteIds({ note: prose }, ids, keys)).toEqual({ note: prose });
  });

  it("leaves unrelated values untouched", () => {
    expect(rewriteIds({ n: 3, b: true, z: null }, ids, keys)).toEqual({
      n: 3,
      b: true,
      z: null,
    });
  });
});

// --- End to end --------------------------------------------------------------

describe("runTracksMigration", () => {
  it("does nothing when there is nothing stored", () => {
    const empty: MigrationStorage = { getItem: () => null, setItem: () => {} };
    expect(runTracksMigration(empty).ran).toBe(false);
  });

  it("is idempotent — a second run is a no-op", () => {
    const storage = legacyStorage({ "2026-04": APRIL });
    expect(runTracksMigration(storage).ran).toBe(true);
    const second = runTracksMigration(storage);
    expect(second.ran).toBe(false);
    expect(second.reason).toBe("already on tracks");
  });

  it("rewrites vocabulary, progress and the active month together", () => {
    const storage = legacyStorage(
      { "2026-04": APRIL, "2026-05": MAY },
      progressFor(["2026-04-abate", "2026-05-laconic"], "2026-04"),
    );
    const result = runTracksMigration(storage);

    expect(result.ran).toBe(true);
    expect(result.monthsMigrated).toBe(2);
    expect(result.orphans).toEqual([]);

    const vocab = storage.read(VOCAB_KEY).state;
    expect(Object.keys(vocab.months).sort()).toEqual(["gre/01", "gre/02"]);
    expect(vocab.activeTrack).toBe("gre");
    expect(vocab.activeMonthKey).toBe("gre/01");
    expect(vocab.schedules.gre.startMonth).toBe("2026-04");

    const progress = storage.read(PROGRESS_KEY).state;
    expect(Object.keys(progress.words).sort()).toEqual(["gre-abate", "gre-laconic"]);
  });

  it("survives having no progress at all", () => {
    const storage = legacyStorage({ "2026-04": APRIL }, {});
    expect(runTracksMigration(storage).ran).toBe(true);
    expect(storage.read(VOCAB_KEY).state.months["gre/01"]).toBeDefined();
  });

  it("leaves storage untouched when the state is not JSON", () => {
    const data = new Map([[VOCAB_KEY, "{not json"]]);
    const storage: MigrationStorage = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
    };
    expect(runTracksMigration(storage).ran).toBe(false);
    expect(data.get(VOCAB_KEY)).toBe("{not json");
  });

  it("moves a retired word's ledger entry with its month", () => {
    const storage = legacyStorage({ "2026-04": APRIL });
    const blob = storage.read(VOCAB_KEY);
    blob.state.retiredWords = [
      { stem: "obdur", word: "obdurate", monthKey: "2026-04", source: "generated" },
      { stem: "ephemer", word: "ephemeral", monthKey: "2025-01", source: "generated" },
    ];
    storage.setItem(VOCAB_KEY, JSON.stringify(blob));

    runTracksMigration(storage);
    const retired = storage.read(VOCAB_KEY).state.retiredWords;
    expect(retired[0].monthKey).toBe("gre/01");
    // Its month is long gone, but it must keep blocking regeneration.
    expect(retired[1].monthKey).toBe("gre/retired");
  });
});

describe("findOrphans", () => {
  it("names a progress record pointing at no word", () => {
    const months: Record<string, VocabMonth> = {
      "gre/01": {
        track: "gre",
        ordinal: 1,
        title: "One",
        days: [
          {
            day: 1,
            words: [
              {
                id: "gre-abate",
                word: "abate",
                partOfSpeech: "verb",
                definition: "d",
                example: "e",
                mnemonic: "m",
              },
            ],
          },
        ],
      },
    };
    expect(
      findOrphans({ words: { "gre-abate": {}, "gre-ghost": {} } }, months),
    ).toEqual(["gre-ghost"]);
  });
});

// --- The acceptance test -----------------------------------------------------

describe("the acceptance test", () => {
  /**
   * Stated three times across ADR 0011, ADR 0012 and docs/SCHEDULE.md, and
   * this is it: everything a user had, they still have, in the same places.
   */
  it("shows the same words on the same days with the same progress", () => {
    const before = {
      "2026-04": legacyMonth("2026-04", ["abate", "cogent", "ephemeral"]),
      "2026-05": legacyMonth("2026-05", ["laconic", "obdurate"]),
      "2026-08": legacyMonth("2026-08", ["truculent"]), // a gap, on purpose
    };
    const ids = Object.values(before).flatMap((m) =>
      m.days.flatMap((d) => d.words.map((w) => w.id)),
    );
    const storage = legacyStorage(before, progressFor(ids, "2026-04"));
    const progressBefore = storage.read(PROGRESS_KEY).state;

    const result = runTracksMigration(storage);
    expect(result.ran).toBe(true);
    expect(result.orphans).toEqual([]);

    const vocab = storage.read(VOCAB_KEY).state;
    const progress = storage.read(PROGRESS_KEY).state;
    const schedule = vocab.schedules.gre;

    // 1. Every calendar month the user had still resolves to the month that
    //    was in it, with the same words on the same days.
    for (const [calendar, legacy] of Object.entries(before)) {
      const ordinal = ordinalForCalendarMonth(schedule, calendar);
      expect(ordinal).not.toBeNull();
      const migrated: VocabMonth =
        vocab.months[`gre/${String(ordinal).padStart(2, "0")}`];
      expect(migrated.days.map((d) => d.day)).toEqual(
        legacy.days.map((d) => d.day),
      );
      expect(migrated.days.map((d) => d.words.map((w) => w.word))).toEqual(
        legacy.days.map((d) => d.words.map((w) => w.word)),
      );
    }

    // 2. The gap is still a gap. June and July taught nothing before and
    //    teach nothing now.
    expect(ordinalForCalendarMonth(schedule, "2026-06")).toBeNull();
    expect(ordinalForCalendarMonth(schedule, "2026-07")).toBeNull();

    // 3. Every progress record survived, attached to the same word, with
    //    every scheduling field intact.
    expect(Object.keys(progress.words)).toHaveLength(ids.length);
    for (const oldId of ids) {
      // "2026-05-laconic" → "gre-laconic". Exact, with no fallback: a
      // fallback here would let a mismatched rewrite pass as a match.
      const newId = `gre-${oldId.slice("2026-05-".length)}`;
      const record = progress.words[newId];
      expect(record, `no progress for ${oldId} (looked for ${newId})`).toBeDefined();
      expect(record.mastered).toBe(progressBefore.words[oldId].mastered);
      expect(record.easeFactor).toBe(progressBefore.words[oldId].easeFactor);
      expect(record.intervalDays).toBe(progressBefore.words[oldId].intervalDays);
      expect(record.dueAt).toBe(progressBefore.words[oldId].dueAt);
    }

    // 4. Nothing points anywhere that does not exist.
    expect(findOrphans(progress, vocab.months)).toEqual([]);
  });
});

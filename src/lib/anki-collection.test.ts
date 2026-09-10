import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { zipSync, unzipSync } from "fflate";
import {
  buildAnkiCollection,
  type AnkiCollectionResult,
} from "@/lib/anki-collection";
import type { VocabMonth, WordProgress } from "@/types";

/**
 * These tests build a real Anki collection and read it back with real SQLite.
 * They cannot prove Anki accepts the file — no Anki here — but they do pin the
 * schema, the referential integrity, and every field Anki's scheduler reads.
 */

const NOW = new Date("2026-09-10T12:00:00.000Z");
/** Anki's unit separator between note fields. */
const FIELD_SEP = String.fromCharCode(31);

const MONTHS: VocabMonth[] = [
  {
    month: "2026-04",
    displayName: "April 2026",
    days: [
      {
        day: 1,
        words: [
          {
            id: "2026-04-abate",
            word: "abate",
            partOfSpeech: "verb",
            definition: "To lessen <in> intensity & force.",
            example: "The storm abated.",
            mnemonic: "a-BATE",
          },
          {
            id: "2026-04-cogent",
            word: "cogent",
            partOfSpeech: "adjective",
            definition: "Clear and convincing.",
            example: "A cogent argument.",
            mnemonic: "co-agent",
          },
        ],
      },
    ],
  },
  {
    month: "2026-05",
    displayName: "May 2026",
    days: [
      {
        day: 2,
        words: [
          {
            id: "2026-05-dearth",
            word: "dearth",
            partOfSpeech: "noun",
            definition: "A scarcity.",
            example: "A dearth of options.",
            mnemonic: "death of supply",
          },
        ],
      },
    ],
  },
];

function progress(over: Partial<WordProgress>): WordProgress {
  return {
    wordId: "x",
    monthKey: "2026-04",
    mastered: false,
    timesReviewed: 0,
    quizAttempts: 0,
    quizCorrect: 0,
    lastReviewed: null,
    masteredAt: null,
    ...over,
  };
}

// abate is scheduled; cogent has no record at all; dearth has a record but was
// never rated on a flashcard, so it has no schedule.
const PROGRESS: Record<string, WordProgress> = {
  "2026-04-abate": progress({
    wordId: "2026-04-abate",
    mastered: true,
    timesReviewed: 5,
    easeFactor: 2.36,
    intervalDays: 10,
    reps: 4,
    dueAt: "2026-09-20T12:00:00.000Z",
  }),
  "2026-05-dearth": progress({ wordId: "2026-05-dearth", monthKey: "2026-05" }),
};

let SQL: SqlJsStatic;
let result: AnkiCollectionResult;
let db: Database;

/** Every value of the first column of a one-column query. */
const col = <T = unknown,>(database: Database, sql: string): T[] => {
  const res = database.exec(sql);
  return res.length ? (res[0].values.map((r) => r[0]) as T[]) : [];
};
/** The first row of a query, as an array of cells. */
const row = (database: Database, sql: string): unknown[] =>
  database.exec(sql)[0].values[0];

beforeAll(async () => {
  SQL = await initSqlJs();
  result = await buildAnkiCollection(SQL, {
    months: MONTHS,
    progress: PROGRESS,
    grouping: "month",
    deckName: "Lexicon",
    now: NOW,
  });
  db = new SQL.Database(result.bytes);
});

describe("counts reported back to the caller", () => {
  it("reports notes, decks and how many carried scheduling", () => {
    expect(result.noteCount).toBe(3);
    expect(result.deckCount).toBe(2);
    expect(result.scheduledCount).toBe(1);
  });
});

describe("schema 11", () => {
  it("creates every table Anki expects", () => {
    expect(
      col(db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"),
    ).toEqual(["cards", "col", "graves", "notes", "revlog"]);
  });

  it("creates the scheduler indexes", () => {
    expect(
      col(
        db,
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'ix_%' ORDER BY name",
      ),
    ).toEqual([
      "ix_cards_nid",
      "ix_cards_sched",
      "ix_cards_usn",
      "ix_notes_csum",
      "ix_notes_usn",
      "ix_revlog_cid",
      "ix_revlog_usn",
    ]);
  });

  it("writes exactly one col row, at version 11", () => {
    expect(col(db, "SELECT count(*) FROM col")[0]).toBe(1);
    expect(col(db, "SELECT ver FROM col")[0]).toBe(11);
  });
});

describe("referential integrity", () => {
  it("gives every card a real note", () => {
    expect(
      col(
        db,
        "SELECT count(*) FROM cards c LEFT JOIN notes n ON n.id=c.nid WHERE n.id IS NULL",
      )[0],
    ).toBe(0);
  });

  it("keeps note ids, card ids and guids unique", () => {
    expect(col(db, "SELECT count(DISTINCT id) FROM notes")[0]).toBe(3);
    expect(col(db, "SELECT count(DISTINCT id) FROM cards")[0]).toBe(3);
    expect(col(db, "SELECT count(DISTINCT guid) FROM notes")[0]).toBe(3);
  });

  it("points every card and note at a deck and model that exist", () => {
    const [confJson, modelsJson, decksJson] = row(
      db,
      "SELECT conf, models, decks FROM col",
    ) as string[];
    const models = JSON.parse(modelsJson);
    const decks = JSON.parse(decksJson);
    expect(
      col<number>(db, "SELECT DISTINCT did FROM cards").every(
        (d) => String(d) in decks,
      ),
    ).toBe(true);
    expect(
      col<number>(db, "SELECT DISTINCT mid FROM notes").every(
        (m) => String(m) in models,
      ),
    ).toBe(true);
    // conf must point at the model we actually wrote
    expect(JSON.parse(confJson).curModel).toBe(Object.keys(models)[0]);
  });
});

describe("the note type", () => {
  it("declares the five fields in order, with one template", () => {
    const models = JSON.parse(row(db, "SELECT models FROM col")[0] as string);
    const model = Object.values(models)[0] as {
      flds: Array<{ name: string; ord: number }>;
      tmpls: Array<{ qfmt: string; afmt: string }>;
      req: unknown;
    };
    expect(model.flds.map((f) => f.name)).toEqual([
      "Word",
      "PartOfSpeech",
      "Definition",
      "Example",
      "Mnemonic",
    ]);
    expect(model.flds.map((f) => f.ord)).toEqual([0, 1, 2, 3, 4]);
    expect(model.tmpls).toHaveLength(1);
    expect(model.tmpls[0].qfmt).toContain("{{Word}}");
    expect(model.tmpls[0].afmt).toContain("{{FrontSide}}");
    expect(model.req).toEqual([[0, "any", [0]]]);
  });
});

describe("decks", () => {
  it("nests one subdeck per month under the chosen name", () => {
    const decks = JSON.parse(row(db, "SELECT decks FROM col")[0] as string);
    expect(
      Object.values(decks)
        .map((d) => (d as { name: string }).name)
        .sort(),
    ).toEqual(["Default", "Lexicon::April 2026", "Lexicon::May 2026"]);
  });

  it("puts everything in one deck when asked to", async () => {
    const single = await buildAnkiCollection(SQL, {
      months: MONTHS,
      progress: PROGRESS,
      grouping: "single",
      deckName: "My Vocab",
      now: NOW,
    });
    const db2 = new SQL.Database(single.bytes);
    const decks = JSON.parse(row(db2, "SELECT decks FROM col")[0] as string);
    expect(
      Object.values(decks)
        .map((d) => (d as { name: string }).name)
        .sort(),
    ).toEqual(["Default", "My Vocab"]);
    expect(single.deckCount).toBe(1);
    expect(col(db2, "SELECT count(DISTINCT did) FROM cards")[0]).toBe(1);
    db2.close();
  });
});

describe("note fields", () => {
  it("stores five separator-joined fields with the word as sort field", () => {
    const [flds, sfld] = row(
      db,
      "SELECT flds, sfld FROM notes WHERE sfld = 'abate'",
    ) as [string, string];
    expect(flds.split(FIELD_SEP)).toHaveLength(5);
    expect(sfld).toBe("abate");
  });

  it("escapes HTML that would otherwise render as markup", () => {
    const [flds] = row(
      db,
      "SELECT flds FROM notes WHERE sfld = 'abate'",
    ) as [string];
    expect(flds.split(FIELD_SEP)[2]).toBe(
      "To lessen &lt;in&gt; intensity &amp; force.",
    );
  });

  it("computes the checksum the way Anki does", () => {
    const [csum] = row(
      db,
      "SELECT csum FROM notes WHERE sfld = 'abate'",
    ) as [number];
    const expected = parseInt(
      createHash("sha1").update("abate").digest("hex").slice(0, 8),
      16,
    );
    expect(csum).toBe(expected);
  });
});

describe("scheduling carried across", () => {
  const cardFor = (word: string) =>
    row(
      db,
      `SELECT type, queue, due, ivl, factor, reps FROM cards c JOIN notes n ON n.id=c.nid WHERE n.sfld='${word}'`,
    ) as number[];

  it("turns a reviewed word into an Anki review card", () => {
    const [type, queue, , ivl, factor, reps] = cardFor("abate");
    expect([type, queue]).toEqual([2, 2]);
    expect(ivl).toBe(10);
    expect(factor).toBe(2360); // ease stored as permille
    expect(reps).toBe(4);
  });

  it("expresses the due date as days since collection creation", () => {
    const [, , due] = cardFor("abate");
    const crt = col<number>(db, "SELECT crt FROM col")[0];
    expect(due).toBe(
      Math.floor((Date.parse("2026-09-20T12:00:00.000Z") - crt * 1000) / 86_400_000),
    );
    // A timestamp leaking into this column would be astronomically large.
    expect(due).toBeGreaterThan(0);
    expect(due).toBeLessThan(1000);
  });

  it("leaves unrated words as new cards", () => {
    expect(cardFor("cogent").slice(0, 2)).toEqual([0, 0]);
    expect(cardFor("cogent").slice(3)).toEqual([0, 0, 0]);
  });

  it("treats a progress record without a due date as unscheduled", () => {
    expect(cardFor("dearth").slice(0, 2)).toEqual([0, 0]);
  });

  it("gives new cards sequential positions and leaves nextPos just past them", () => {
    expect(col(db, "SELECT due FROM cards WHERE type=0 ORDER BY due")).toEqual([
      0, 1,
    ]);
    const conf = JSON.parse(row(db, "SELECT conf FROM col")[0] as string);
    // Regression: this was once newPosition + 1, which skipped a slot.
    expect(conf.nextPos).toBe(2);
  });
});

describe("the .apkg envelope", () => {
  it("round-trips the collection through a zip", () => {
    const zipped = zipSync({
      "collection.anki2": result.bytes,
      media: new TextEncoder().encode("{}"),
    });
    const unzipped = unzipSync(zipped);

    expect(Object.keys(unzipped).sort()).toEqual(["collection.anki2", "media"]);
    expect(new TextDecoder().decode(unzipped.media)).toBe("{}");
    expect(
      new TextDecoder().decode(unzipped["collection.anki2"].slice(0, 15)),
    ).toBe("SQLite format 3");

    const reopened = new SQL.Database(unzipped["collection.anki2"]);
    expect(col(reopened, "SELECT count(*) FROM notes")[0]).toBe(3);
    reopened.close();
  });
});

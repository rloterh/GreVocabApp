import { beforeAll, describe, expect, it } from "vitest";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { zipSync } from "fflate";
import { importApkg, mapFields, stripAnkiHtml } from "@/lib/anki-import";
import { buildAnkiCollection } from "@/lib/anki-collection";
import { parseVocabMonth } from "@/lib/vocabulary";
import type { VocabMonth } from "@/types";

let SQL: SqlJsStatic;

beforeAll(async () => {
  SQL = await initSqlJs();
});

/** Wrap collection bytes in the zip envelope Anki expects. */
const apkg = (bytes: Uint8Array) =>
  zipSync({
    "collection.anki2": bytes,
    media: new TextEncoder().encode("{}"),
  });

const MONTHS: VocabMonth[] = [
  {
    track: "gre",
    ordinal: 1,
    title: "April 2026",
    days: [
      {
        day: 1,
        words: [
          {
            id: "2026-04-abate",
            word: "abate",
            partOfSpeech: "verb",
            definition: "To lessen in intensity.",
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
          {
            id: "2026-04-dearth",
            word: "dearth",
            partOfSpeech: "noun",
            definition: "A scarcity.",
            example: "A dearth of options.",
            mnemonic: "death of supply",
          },
          {
            id: "2026-04-laconic",
            word: "laconic",
            partOfSpeech: "adjective",
            definition: "Using few words.",
            example: "A laconic reply.",
            mnemonic: "lacking words",
          },
        ],
      },
    ],
  },
];

describe("stripAnkiHtml", () => {
  it.each([
    ["<b>abate</b>", "abate"],
    ["line<br>break", "line break"],
    ["<div>one</div><div>two</div>", "one two"],
    ["a &amp; b", "a & b"],
    ["&lt;tag&gt;", "<tag>"],
    ["it&#39;s", "it's"],
    ["say &quot;hi&quot;", 'say "hi"'],
    ["word [sound:audio.mp3]", "word"],
    ["  spaced   out  ", "spaced out"],
    ["a&nbsp;b", "a b"],
  ])("%s -> %s", (raw, expected) => {
    expect(stripAnkiHtml(raw)).toBe(expected);
  });
});

describe("mapFields", () => {
  it("matches Lexicon's own field names exactly", () => {
    expect(
      mapFields(["Word", "PartOfSpeech", "Definition", "Example", "Mnemonic"]),
    ).toEqual({
      word: 0,
      partOfSpeech: 1,
      definition: 2,
      example: 3,
      mnemonic: 4,
    });
  });

  it("reads a plain Front/Back note type", () => {
    const m = mapFields(["Front", "Back"]);
    expect(m.word).toBe(0);
    expect(m.definition).toBe(1);
  });

  it("handles fields in an unexpected order", () => {
    const m = mapFields(["Meaning", "Term"]);
    expect(m.word).toBe(1);
    expect(m.definition).toBe(0);
  });

  it("tolerates spacing and casing in field names", () => {
    const m = mapFields(["The Word", "part of speech", "MEANING"]);
    expect(m.word).toBe(0);
    expect(m.partOfSpeech).toBe(1);
    expect(m.definition).toBe(2);
  });

  it("falls back to position when nothing matches by name", () => {
    const m = mapFields(["Col1", "Col2", "Col3"]);
    expect(m.word).toBe(0);
    expect(m.definition).toBe(1);
    expect(m.example).toBeNull();
  });

  it("never maps two roles to the same field", () => {
    const m = mapFields(["Word", "Definition", "Example", "Mnemonic"]);
    const used = [m.word, m.definition, m.example, m.mnemonic].filter(
      (i): i is number => i !== null,
    );
    expect(new Set(used).size).toBe(used.length);
  });
});

describe("round trip — export then import", () => {
  it("brings every word back", async () => {
    const built = await buildAnkiCollection(SQL, {
      months: MONTHS,
      progress: {},
      grouping: "single",
      deckName: "Lexicon",
    });

    const result = await importApkg(SQL, {
      bytes: apkg(built.bytes),
      monthKey: "gre/09",
    });

    expect(result.noteCount).toBe(4);
    expect(result.skipped).toBe(0);

    const words = result.month.days.flatMap((d) => d.words);
    expect(words.map((w) => w.word).sort()).toEqual([
      "abate",
      "cogent",
      "dearth",
      "laconic",
    ]);
  });

  it("preserves every field, including the escaped ones", async () => {
    const withMarkup: VocabMonth[] = [
      {
        ...MONTHS[0],
        days: [
          {
            day: 1,
            words: [
              {
                id: "x",
                word: "abate",
                partOfSpeech: "verb",
                definition: "To lessen <in> intensity & force.",
                example: "The storm abated.",
                mnemonic: "a-BATE",
              },
            ],
          },
        ],
      },
    ];
    const built = await buildAnkiCollection(SQL, {
      months: withMarkup,
      progress: {},
      grouping: "single",
      deckName: "Lexicon",
    });
    const result = await importApkg(SQL, {
      bytes: apkg(built.bytes),
      monthKey: "gre/09",
    });
    const word = result.month.days[0].words[0];
    // Export escaped the angle brackets; import must give them back.
    expect(word.definition).toBe("To lessen <in> intensity & force.");
    expect(word.partOfSpeech).toBe("verb");
    expect(word.example).toBe("The storm abated.");
    expect(word.mnemonic).toBe("a-BATE");
  });

  it("lays words out three to a day and validates like any import", async () => {
    const built = await buildAnkiCollection(SQL, {
      months: MONTHS,
      progress: {},
      grouping: "single",
      deckName: "Lexicon",
    });
    const result = await importApkg(SQL, {
      bytes: apkg(built.bytes),
      monthKey: "gre/09",
    });

    expect(result.month.days.map((d) => d.words.length)).toEqual([3, 1]);
    expect(result.month.ordinal).toBe(9);
    const validated = parseVocabMonth(result.month);
    expect(validated.days.flatMap((d) => d.words)).toHaveLength(4);
    expect(validated.days[0].words[0].id).toMatch(/^gre-/);
  });

  it("respects the note limit", async () => {
    const built = await buildAnkiCollection(SQL, {
      months: MONTHS,
      progress: {},
      grouping: "single",
      deckName: "Lexicon",
    });
    const result = await importApkg(SQL, {
      bytes: apkg(built.bytes),
      monthKey: "gre/09",
      limit: 2,
    });
    expect(result.month.days.flatMap((d) => d.words)).toHaveLength(2);
  });
});

describe("failures are explained rather than thrown raw", () => {
  it("rejects something that is not a zip", async () => {
    await expect(
      importApkg(SQL, {
        bytes: new TextEncoder().encode("not a zip at all"),
        monthKey: "gre/09",
      }),
    ).rejects.toThrow(/not a readable .apkg/);
  });

  it("names the newer compressed format and says how to fix it", async () => {
    const zipped = zipSync({
      "collection.anki21b": new Uint8Array([1, 2, 3]),
      media: new TextEncoder().encode("{}"),
    });
    await expect(
      importApkg(SQL, { bytes: zipped, monthKey: "gre/09" }),
    ).rejects.toThrow(/Support older Anki versions/);
  });

  it("rejects a zip with no collection at all", async () => {
    const zipped = zipSync({ media: new TextEncoder().encode("{}") });
    await expect(
      importApkg(SQL, { bytes: zipped, monthKey: "gre/09" }),
    ).rejects.toThrow(/No Anki collection/);
  });

  it("rejects a malformed month key before doing any work", async () => {
    await expect(
      importApkg(SQL, { bytes: new Uint8Array(), monthKey: "2026-09" }),
    ).rejects.toThrow(/gre/);
  });

  it("says so when no note has both a word and a meaning", async () => {
    const empty: VocabMonth[] = [
      {
        track: "gre",
        ordinal: 1,
        title: "April 2026",
        days: [
          {
            day: 1,
            words: [
              {
                id: "x",
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
    ];
    const built = await buildAnkiCollection(SQL, {
      months: empty,
      progress: {},
      grouping: "single",
      deckName: "Lexicon",
    });
    // Blank out both fields the importer needs.
    const db = new SQL.Database(built.bytes);
    db.run("UPDATE notes SET flds = ''");
    const blanked = db.export();
    db.close();

    await expect(
      importApkg(SQL, { bytes: apkg(blanked), monthKey: "gre/09" }),
    ).rejects.toThrow(/No usable vocabulary/);
  });
});

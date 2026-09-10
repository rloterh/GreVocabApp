import { describe, expect, it } from "vitest";
import { csvToMonthObjects, monthFromFilename, parseCsv } from "@/lib/csv";
import { parseVocabMonth } from "@/lib/vocabulary";
import type { VocabMonth } from "@/types";

const HEADER = "word,partOfSpeech,definition,example,mnemonic,day";

const BASIC = `${HEADER}
abate,verb,to lessen,The storm abated.,"a-BATE, like bait shrinking",1
cogent,adjective,clear and convincing,A cogent argument.,"cogent = co-agent, persuasive",1
dearth,noun,a scarcity,A dearth of options.,"dearth = death of supply",2`;

/** csvToMonthObjects returns month-shaped objects for parseVocabMonth. */
const asMonths = (text: string, fallbackMonth = "2026-07") =>
  csvToMonthObjects(text, { fallbackMonth }) as unknown as VocabMonth[];

describe("parseCsv", () => {
  it("splits plain rows", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps commas inside quoted fields", () => {
    expect(parseCsv('a,b\n"x,y",2')).toEqual([
      ["a", "b"],
      ["x,y", "2"],
    ]);
  });

  it("reads a doubled quote as one literal quote", () => {
    expect(parseCsv('a\n"he said ""hi"""')).toEqual([["a"], ['he said "hi"']]);
  });

  it("keeps newlines inside quoted fields", () => {
    expect(parseCsv('a,b\n"line1\nline2",2')).toEqual([
      ["a", "b"],
      ["line1\nline2", "2"],
    ]);
  });

  it.each([
    ["CRLF", "a,b\r\n1,2\r\n"],
    ["bare CR", "a,b\r1,2"],
    ["LF, no trailing newline", "a,b\n1,2"],
  ])("handles %s line endings", (_name, text) => {
    expect(parseCsv(text)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("drops blank lines but keeps empty fields", () => {
    expect(parseCsv("a,b,c\n\n1,,3\n\n")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });

  it("ignores a leading BOM", () => {
    expect(parseCsv("﻿a,b\n1,2")[0]).toEqual(["a", "b"]);
  });
});

describe("monthFromFilename", () => {
  it.each([
    ["2026-07.csv", "2026-07"],
    ["vocab-2026-11-final.csv", "2026-11"],
    ["words.csv", null],
    ["2026-13.csv", null],
  ])("%s -> %s", (name, expected) => {
    expect(monthFromFilename(name)).toBe(expected);
  });
});

describe("csvToMonthObjects", () => {
  it("groups rows into days and sorts them", () => {
    const [month] = asMonths(BASIC);
    expect(month.month).toBe("2026-07");
    expect(month.displayName).toBe("July 2026");
    expect(month.days.map((d) => d.day)).toEqual([1, 2]);
    expect(month.days[0].words).toHaveLength(2);
  });

  it("preserves quoted field content verbatim", () => {
    const [month] = asMonths(BASIC);
    expect(month.days[0].words[0].mnemonic).toBe("a-BATE, like bait shrinking");
  });

  it("accepts forgiving header names and optional columns", () => {
    const aliased = `Term,POS,Meaning,Example Sentence,Memory Aid,Day,Month,Synonyms,Antonyms
laconic,adjective,using few words,A laconic reply.,laconic = lacking words,3,2026-08,terse;curt,verbose;wordy`;
    const [month] = asMonths(aliased);
    const word = month.days[0].words[0];
    expect(month.month).toBe("2026-08"); // month column beats the fallback
    expect(word.partOfSpeech).toBe("adjective");
    expect(word.synonyms).toEqual(["terse", "curt"]);
    expect(word.antonyms).toEqual(["verbose", "wordy"]);
  });

  it("splits a file that spans months into one month each", () => {
    const spanning = `${HEADER},month
a,noun,def a,ex a,mn a,1,2026-07
b,noun,def b,ex b,mn b,1,2026-08`;
    expect(asMonths(spanning, "2026-01").map((m) => m.month).sort()).toEqual([
      "2026-07",
      "2026-08",
    ]);
  });
});

describe("csvToMonthObjects — errors name the problem", () => {
  it.each([
    ["an empty file", "", "empty"],
    ["a header with no rows", HEADER, "no data"],
    [
      "missing columns",
      "word,day\nx,1",
      "missing columns: partOfSpeech, definition, example, mnemonic",
    ],
    ["a non-numeric day", `${HEADER}\na,noun,d,e,m,nope`, "Line 2"],
    ["a day outside 1-31", `${HEADER}\na,noun,d,e,m,32`, "1-31"],
    ["a malformed month", `${HEADER},month\na,noun,d,e,m,1,July`, "2026-07"],
  ])("rejects %s", (_name, text, message) => {
    expect(() => csvToMonthObjects(text)).toThrow(message);
  });
});

describe("CSV goes through the same validation as JSON", () => {
  it("produces something parseVocabMonth accepts", () => {
    const validated = parseVocabMonth(asMonths(BASIC)[0]);
    expect(validated.days).toHaveLength(2);
    expect(validated.days[0].words[0].id).toBe("2026-07-abate");
  });

  it("lets the shared validator reject a blank required cell", () => {
    // csv.ts deliberately does not re-implement this check.
    expect(() =>
      parseVocabMonth(asMonths(`${HEADER}\na,noun,,e,m,1`)[0]),
    ).toThrow(/definition/);
  });
});

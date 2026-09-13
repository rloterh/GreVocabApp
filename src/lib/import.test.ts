import { describe, expect, it, vi } from "vitest";
import {
  ACCEPTED_FILE,
  describeOutcome,
  importFiles,
  importText,
  type LoadMonth,
} from "@/lib/import";

/**
 * A loadMonth that accepts anything month-shaped and records what it saw.
 *
 * Imported objects carry no month key of their own any more — where they land
 * in a track is the store's decision — so this stands in for the store by
 * handing out consecutive ordinals.
 */
function acceptingLoader() {
  const seen: unknown[] = [];
  let ordinal = 0;
  const loadMonth: LoadMonth = (raw) => {
    seen.push(raw);
    const shaped = raw as { title?: string; month?: string; days?: unknown };
    return shaped?.days
      ? { ok: true, monthKey: `gre/${String(++ordinal).padStart(2, "0")}` }
      : { ok: false, error: "not a month" };
  };
  return { loadMonth, seen };
}

const rejectingLoader: LoadMonth = () => ({ ok: false, error: "nope" });

const JSON_MONTH = JSON.stringify({ month: "2026-07", days: [] });
const CSV_MONTH = `word,partOfSpeech,definition,example,mnemonic,day
abate,verb,to lessen,The storm abated.,a-BATE,1`;

describe("ACCEPTED_FILE", () => {
  it.each([
    ["a.json", true],
    ["a.csv", true],
    ["A.JSON", true],
    ["A.CSV", true],
    ["a.txt", false],
    ["a.json.bak", false],
    ["json", false],
  ])("%s -> %s", (name, expected) => {
    expect(ACCEPTED_FILE.test(name)).toBe(expected);
  });
});

describe("importText", () => {
  it("passes JSON straight to loadMonth", async () => {
    const { loadMonth, seen } = acceptingLoader();
    const outcome = await importText("a.json", JSON_MONTH, loadMonth);
    expect(outcome).toEqual({ loaded: 1, failed: 0, errors: [] });
    expect((seen[0] as { month: string }).month).toBe("2026-07");
    // JSON is passed through untouched, legacy shape included.
  });

  it("converts CSV before handing it to the same loadMonth", async () => {
    const { loadMonth, seen } = acceptingLoader();
    const outcome = await importText("2026-09.csv", CSV_MONTH, loadMonth);
    expect(outcome.loaded).toBe(1);
    // The filename still groups the rows; it survives as the month's title.
    expect((seen[0] as { title: string }).title).toBe("September 2026");
  });

  it("counts each month when one CSV spans several", async () => {
    const spanning = `word,partOfSpeech,definition,example,mnemonic,day,month
abate,verb,to lessen,The storm abated.,a-BATE,1,2026-07
cogent,adjective,clear,A cogent point.,co-agent,1,2026-10`;
    const { loadMonth, seen } = acceptingLoader();
    const outcome = await importText("x.csv", spanning, loadMonth);
    expect(outcome.loaded).toBe(2);
    expect(seen.map((m) => (m as { title: string }).title).sort()).toEqual([
      "July 2026",
      "October 2026",
    ]);
  });

  it("reports malformed JSON as one failure with the file named", async () => {
    const { loadMonth } = acceptingLoader();
    const outcome = await importText("broken.json", "{ not json", loadMonth);
    expect(outcome.loaded).toBe(0);
    expect(outcome.failed).toBe(1);
    expect(outcome.errors[0]).toContain("broken.json");
  });

  it("surfaces the CSV parser's own message", async () => {
    const { loadMonth } = acceptingLoader();
    const outcome = await importText("bad.csv", "word,day\nx,1", loadMonth);
    expect(outcome.errors[0]).toContain("missing columns");
  });

  it("reports a validation failure from loadMonth", async () => {
    const outcome = await importText("a.json", JSON_MONTH, rejectingLoader);
    expect(outcome).toEqual({
      loaded: 0,
      failed: 1,
      errors: ["a.json: nope"],
    });
  });
});

describe("importFiles", () => {
  const file = (name: string, body: string) =>
    new File([body], name, { type: "text/plain" });

  it("imports every acceptable file and skips the rest", async () => {
    const { loadMonth } = acceptingLoader();
    const outcome = await importFiles(
      [
        file("a.json", JSON_MONTH),
        file("notes.txt", "ignored"),
        file("2026-09.csv", CSV_MONTH),
      ],
      loadMonth,
    );
    expect(outcome.loaded).toBe(2);
    expect(outcome.failed).toBe(0);
  });

  it("keeps going after one file fails", async () => {
    const { loadMonth } = acceptingLoader();
    const outcome = await importFiles(
      [file("bad.json", "{"), file("good.json", JSON_MONTH)],
      loadMonth,
    );
    expect(outcome).toMatchObject({ loaded: 1, failed: 1 });
  });

  it("does nothing when no file is acceptable", async () => {
    const loadMonth = vi.fn(rejectingLoader);
    const outcome = await importFiles([file("a.txt", "x")], loadMonth);
    expect(outcome).toEqual({ loaded: 0, failed: 0, errors: [] });
    expect(loadMonth).not.toHaveBeenCalled();
  });
});

describe("describeOutcome — every path reports the same way", () => {
  it("pluralises a successful import", () => {
    expect(describeOutcome({ loaded: 1, failed: 0, errors: [] }).title).toBe(
      "Loaded 1 month",
    );
    expect(describeOutcome({ loaded: 2, failed: 0, errors: [] }).title).toBe(
      "Loaded 2 months",
    );
  });

  it("mentions partial failure rather than dropping it", () => {
    // Regression: two of the three import paths used to discard this count.
    const d = describeOutcome({ loaded: 2, failed: 1, errors: ["x"] });
    expect(d.variant).toBe("success");
    expect(d.description).toContain("1 file failed");
  });

  it("reports total failure as an error, quoting the first reason", () => {
    const d = describeOutcome({ loaded: 0, failed: 1, errors: ["a.json: nope"] });
    expect(d.variant).toBe("error");
    expect(d.description).toBe("a.json: nope");
  });

  it("says so when there was nothing to import at all", () => {
    const d = describeOutcome({ loaded: 0, failed: 0, errors: [] });
    expect(d.variant).toBe("error");
    expect(d.title).toBe("Nothing to import");
  });
});

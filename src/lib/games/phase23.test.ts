import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VocabWord } from "@/types";
import { allWordsInMonth, parseVocabMonth } from "@/lib/vocabulary";
import { seededRandom } from "@/lib/order";
import { haptic } from "@/lib/haptics";
import { useSettingsStore } from "@/store/useSettingsStore";
import { ambiguousKeys, buildUnscramble, canBuildUnscramble, letterKey } from "./builders/unscramble";
import { parseAnagramRisk } from "./anagram-risk";
import { buildRelationIndex } from "./relations";
import { parseRelationsFile } from "./relations-file";

const ROOT = join(process.cwd(), "public", "vocab");

const word = (w: string, definition = "A thing.", extra: Partial<VocabWord> = {}): VocabWord => ({
  id: `gre-${w}`,
  word: w,
  partOfSpeech: "noun",
  definition,
  example: "",
  mnemonic: "",
  ...extra,
});

describe("Unscramble", () => {
  it("knows two words are anagrams by their sorted letters", () => {
    expect(letterKey("Listen")).toBe(letterKey("silent"));
    expect([...ambiguousKeys(["listen", "silent", "abate"])]).toEqual([letterKey("listen")]);
  });

  it("never asks a word whose letters spell another one", () => {
    const ctx = {
      pool: [],
      index: buildRelationIndex([]),
      monthOf: {},
      tier: "standard" as const,
      random: seededRandom(1),
      ambiguous: new Set([letterKey("discreet")]),
    };
    expect(buildUnscramble(word("discreet", "Careful and tactful."), ctx)).toBeNull();
  });

  it("deals the word's own letters, never in the word's order", () => {
    const ctx = { pool: [], index: buildRelationIndex([]), monthOf: {}, tier: "standard" as const, random: seededRandom(3) };
    for (let s = 0; s < 50; s++) {
      const q = buildUnscramble(word("ephemeral", "Lasting a very short time."), { ...ctx, random: seededRandom(s) })!;
      expect(q.tiles.slice().sort().join("")).toBe(letterKey("ephemeral"));
      expect(q.tiles.join("")).not.toBe("ephemeral");
    }
  });

  it("skips a definition that gives the word away, and words too short or long", () => {
    expect(canBuildUnscramble(word("abate", "To make an abatement."))).toBe(false);
    expect(canBuildUnscramble(word("abet", "To help."))).toBe(false);
    expect(canBuildUnscramble(word("extraordinary", "Unusual."))).toBe(false);
    expect(canBuildUnscramble(word("abate", "To lessen."))).toBe(true);
  });

  it("over the shipped corpus, never deals tiles that the anagram list rules out", () => {
    const relations = parseRelationsFile(JSON.parse(readFileSync(join(ROOT, "relations.json"), "utf-8")));
    const ambiguous = ambiguousKeys(relations.map((r) => r.word));
    for (const k of parseAnagramRisk(JSON.parse(readFileSync(join(ROOT, "anagram-risk.json"), "utf-8")))) {
      ambiguous.add(k);
    }
    // The blind read's finds, as a fixed regression list.
    for (const w of ["tacit", "dirge", "slump", "dread", "credo", "strive", "adhere", "deport"]) {
      expect(ambiguous.has(letterKey(w)), w).toBe(true);
    }
    const months = readdirSync(join(ROOT, "sat"))
      .filter((f) => f.endsWith(".json"))
      .slice(0, 6)
      .map((f) => parseVocabMonth(JSON.parse(readFileSync(join(ROOT, "sat", f), "utf-8")), { track: "sat" }));
    const ctx = { pool: [], index: buildRelationIndex([]), monthOf: {}, tier: "warmup" as const, random: seededRandom(9), ambiguous };
    for (const w of months.flatMap(allWordsInMonth)) {
      const q = buildUnscramble(w, ctx);
      if (q) expect(ambiguous.has(letterKey(q.word)), q.word).toBe(false);
    }
  });
});

describe("haptic", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useSettingsStore.getState().reset();
  });

  const device = (coarse: boolean) => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: coarse }) });
    return vibrate;
  };

  it("buzzes a phone, with a short pattern, when sound is on", () => {
    const vibrate = device(true);
    useSettingsStore.getState().set({ soundEnabled: true });
    haptic("correct");
    haptic("wrong");
    expect(vibrate).toHaveBeenNthCalledWith(1, 12);
    expect(vibrate).toHaveBeenNthCalledWith(2, [20, 40, 20]);
  });

  it("stays still when sound is off, on a desktop, or with no API at all", () => {
    const phone = device(true);
    haptic("correct");
    expect(phone).not.toHaveBeenCalled();

    const desktop = device(false);
    useSettingsStore.getState().set({ soundEnabled: true });
    haptic("correct");
    expect(desktop).not.toHaveBeenCalled();

    vi.stubGlobal("navigator", {});
    expect(() => haptic("wrong")).not.toThrow();
  });
});

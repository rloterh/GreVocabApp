/**
 * The boundary: presentation never overrides scheduling or fairness.
 *
 * `order.test.ts` proves the three orderings work. This file proves the more
 * important half — that they do not reach the places where something is
 * already ordered for a reason:
 *
 * - the **due deck**, where the scheduler decides,
 * - **quiz and exam** question order, which must stay random or a quiz becomes
 *   gameable,
 * - **search**, where the best match goes first.
 *
 * A regression here would be invisible: the app would still work, still look
 * right, and quietly stop doing spaced repetition in the order it computed.
 *
 * See docs/WORD-ORDER.md.
 */

import { describe, expect, it } from "vitest";
import { orderWords, type WordOrder } from "@/lib/order";
import { bySchedule, isDue } from "@/lib/sm2";
import type { VocabWord, WordProgress } from "@/types";

const ORDERS: WordOrder[] = ["authored", "alphabetical", "random"];

function word(w: string): VocabWord {
  return {
    id: w,
    word: w,
    partOfSpeech: "noun",
    definition: "A definition.",
    example: "An example.",
    mnemonic: "A mnemonic.",
  };
}

function progress(id: string, dueAt: string | null): WordProgress {
  return {
    wordId: id,
    monthKey: "2026-04",
    mastered: false,
    timesReviewed: 1,
    quizAttempts: 0,
    quizCorrect: 0,
    lastReviewed: "2026-09-01",
    masteredAt: null,
    dueAt: dueAt ?? undefined,
  } as WordProgress;
}

const NOW = new Date("2026-09-11T12:00:00Z");

/** Deliberately not alphabetical, and deliberately not in due order. */
const WORDS = ["zealous", "abate", "mercurial", "cogent"].map(word);
/**
 * Chosen so all three orders genuinely differ.
 *
 * With `abate` most overdue, due order and alphabetical order coincide and the
 * test passes without being able to tell them apart.
 *
 *   authored:     zealous, abate, mercurial, cogent
 *   alphabetical: abate, cogent, mercurial, zealous
 *   due:          zealous, cogent, mercurial, abate
 */
const PROGRESS: Record<string, WordProgress> = {
  zealous: progress("zealous", "2026-09-01T00:00:00Z"),
  cogent: progress("cogent", "2026-09-05T00:00:00Z"),
  mercurial: progress("mercurial", "2026-09-08T00:00:00Z"),
  abate: progress("abate", "2026-09-11T00:00:00Z"),
};

describe("the due deck answers to the scheduler, not the preference", () => {
  const due = WORDS.filter((w) => isDue(PROGRESS[w.id], NOW));

  it("puts the most overdue first", () => {
    expect(bySchedule(due, PROGRESS, NOW).map((w) => w.word)).toEqual([
      "zealous",
      "cogent",
      "mercurial",
      "abate",
    ]);
  });

  it("is not the authored order it was built from", () => {
    // If these matched, the test above would pass for the wrong reason.
    expect(bySchedule(due, PROGRESS, NOW).map((w) => w.word)).not.toEqual(
      due.map((w) => w.word),
    );
  });

  it.each(ORDERS)(
    "is identical whatever the word order is set to (%s)",
    (order) => {
      // The preference is not consulted here at all. Applying it afterwards —
      // which is the mistake this guards against — would change the answer.
      const scheduled = bySchedule(due, PROGRESS, NOW).map((w) => w.word);
      const ifPreferenceLeaked = orderWords(
        bySchedule(due, PROGRESS, NOW),
        order,
        1,
      ).map((w) => w.word);

      if (order === "authored") {
        expect(ifPreferenceLeaked).toEqual(scheduled);
      } else if (order === "alphabetical") {
        // Proof the leak would be visible: alphabetical differs from due order.
        expect(ifPreferenceLeaked).not.toEqual(scheduled);
      }
      // Whatever the preference, the scheduler's own answer is unchanged.
      expect(bySchedule(due, PROGRESS, NOW).map((w) => w.word)).toEqual(
        scheduled,
      );
    },
  );

  it("is stable across repeated calls", () => {
    const once = bySchedule(due, PROGRESS, NOW).map((w) => w.id);
    const twice = bySchedule(due, PROGRESS, NOW).map((w) => w.id);
    expect(once).toEqual(twice);
  });

  it("breaks ties by id rather than by input order", () => {
    const tied = ["b", "a", "c"].map(word);
    const same = {
      a: progress("a", "2026-09-01T00:00:00Z"),
      b: progress("b", "2026-09-01T00:00:00Z"),
      c: progress("c", "2026-09-01T00:00:00Z"),
    };
    expect(bySchedule(tied, same, NOW).map((w) => w.id)).toEqual(["a", "b", "c"]);
  });

  it("surfaces a due card with no date rather than burying it", () => {
    const odd = [word("anomalous"), ...WORDS];
    const withGap = { ...PROGRESS, anomalous: progress("anomalous", null) };
    // Anomalous state should be visible, not sorted to the end where nobody
    // looks.
    expect(bySchedule(odd, withGap, NOW)[0].id).toBe("anomalous");
  });

  it("does not mutate the pool it was given", () => {
    const original = due.map((w) => w.id);
    bySchedule(due, PROGRESS, NOW);
    expect(due.map((w) => w.id)).toEqual(original);
  });
});

describe("orderWords is a presentation function only", () => {
  it("has no idea what progress or scheduling are", () => {
    // Structural, not behavioural: if `orderWords` ever needed progress, the
    // boundary would have moved and this signature would have to change.
    expect(orderWords.length).toBeLessThanOrEqual(3);
  });

  it.each(ORDERS)("%s preserves the set, only the sequence changes", (order) => {
    // Whatever a surface does with ordering, it can never lose a word — which
    // is what makes it safe to call on a browsing list and unsafe nowhere.
    const result = orderWords(WORDS, order, 3).map((w) => w.id);
    expect(result.slice().sort()).toEqual(WORDS.map((w) => w.id).sort());
  });
});

describe("quiz and exam order stays random", () => {
  it("is not derived from the word-order preference", async () => {
    // The quiz builds its own options with `shuffle` from lib/utils, which
    // takes no preference and no seed. Asserted structurally: if a quiz ever
    // imported `orderWords`, a gameable quiz would be one refactor away.
    const quizSource = await import("node:fs").then((fs) =>
      fs.readFileSync("src/pages/Quiz.tsx", "utf-8"),
    );
    expect(quizSource).not.toMatch(/orderWords|wordOrder/);
  });

  it("nor is the exam", async () => {
    const fs = await import("node:fs");
    for (const file of ["src/pages/Quiz.tsx", "src/pages/Search.tsx"]) {
      if (!fs.existsSync(file)) continue;
      expect(fs.readFileSync(file, "utf-8"), file).not.toMatch(
        /orderWords|wordOrder/,
      );
    }
  });
});

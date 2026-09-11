import { describe, expect, it, vi } from "vitest";
import {
  newCheckpoint,
  remainingMonths,
  runPlan,
  summarize,
  topicFor,
  type RunCheckpoint,
} from "@/lib/generation-run";
import { defaultPlan, planMonths, type GenerationPlan } from "@/lib/generation-plan";
import { VocabIndex } from "@/lib/vocab-index";
import { stem } from "@/lib/stem";
import type { Provider } from "@/lib/ai/types";
import type { VocabMonth } from "@/types";

function plan(overrides: Partial<GenerationPlan> = {}): GenerationPlan {
  return { ...defaultPlan("2026-10"), wordsPerDay: 1, ...overrides };
}

/**
 * A provider that invents distinct nonsense words on demand.
 *
 * Deterministic and unique by construction, so a collision in a test is the
 * index failing rather than the fake being sloppy.
 */
let serial = 0;

function fakeProvider(options: {
  /** Words to emit before falling back to unique ones. Repeats on purpose. */
  scripted?: string[][];
  failOn?: (call: number) => string | undefined;
} = {}): { provider: Provider; calls: Array<{ count: number; prompt: string }> } {
  const calls: Array<{ count: number; prompt: string }> = [];
  // Module-level, so two providers in one test do not hand back the same
  // words and make a resume look like a top-up.
  let call = 0;

  const provider = {
    id: "openai",
    label: "Fake",
    tier: 6,
    detect: async () => "available" as const,
    capabilities: () => ({
      onDevice: false,
      streaming: false,
      structuredOutput: "tool" as const,
      maxOutputTokens: 16_000,
    }),
    complete: async () => ({ text: "", provider: "openai" as const }),
    completeStructured: async <T,>(request: {
      prompt: string;
      validate?: (v: unknown) => T;
    }): Promise<T> => {
      const index = call++;
      const failure = options.failOn?.(index);
      if (failure) throw new Error(failure);

      const wanted = Number(/exactly (\d+) vocabulary/.exec(request.prompt)?.[1] ?? 0);
      calls.push({ count: wanted, prompt: request.prompt });

      const scripted = options.scripted?.[index] ?? [];
      const words: string[] = [...scripted];
      while (words.length < wanted) words.push(`zyx${serial++}`);

      const payload = {
        words: words.slice(0, wanted).map((word) => ({
          word,
          partOfSpeech: "noun",
          definition: `The state of ${word}.`,
          example: `The ${word} was evident.`,
          mnemonic: `Sounds like ${word}.`,
          synonyms: [],
          antonyms: [],
        })),
      };
      return request.validate ? request.validate(payload) : (payload as T);
    },
  } as unknown as Provider;

  return { provider, calls };
}

function collect() {
  const months: VocabMonth[] = [];
  return { months, commit: (m: VocabMonth) => void months.push(m) };
}

describe("running a plan", () => {
  it("generates every month of the horizon", async () => {
    const { provider } = fakeProvider();
    const { months, commit } = collect();
    const p = plan({ horizon: "quarter" });

    const checkpoint = await runPlan({
      plan: p,
      provider,
      index: VocabIndex.from([]),
      commit,
    });

    expect(months).toHaveLength(3);
    expect(checkpoint.completed).toEqual(planMonths(p));
  });

  it("fills each month to the requested size", async () => {
    const { provider } = fakeProvider();
    const { months, commit } = collect();

    await runPlan({
      plan: plan({ horizon: "month", wordsPerDay: 3 }),
      provider,
      index: VocabIndex.from([]),
      commit,
    });

    const words = months[0].days.flatMap((d) => d.words);
    expect(words).toHaveLength(90);
  });

  it("lays words out at the plan's words-per-day", async () => {
    const { provider } = fakeProvider();
    const { months, commit } = collect();

    await runPlan({
      plan: plan({ horizon: "month", wordsPerDay: 3 }),
      provider,
      index: VocabIndex.from([]),
      commit,
    });

    expect(months[0].days[0].words).toHaveLength(3);
  });

  it("asks for more than it needs", async () => {
    const { provider, calls } = fakeProvider();
    await runPlan({
      plan: plan({ horizon: "month", wordsPerDay: 1 }),
      provider,
      index: VocabIndex.from([]),
      commit: () => {},
    });
    // 30 needed, 25% overage.
    expect(calls[0].count).toBe(38);
  });
});

describe("no duplicate survives", () => {
  it("produces zero stem collisions across a year", async () => {
    // The definition of done for this phase.
    const { provider } = fakeProvider();
    const { months, commit } = collect();
    const index = VocabIndex.from([]);

    await runPlan({
      plan: plan({ horizon: "year", wordsPerDay: 3 }),
      provider,
      index,
      commit,
    });

    const words = months.flatMap((m) => m.days.flatMap((d) => d.words));
    expect(words.length).toBeGreaterThan(1000);

    const stems = new Set(words.map((w) => stem(w.word)));
    expect(stems.size).toBe(words.length);
  });

  it("filters out words the user already has", async () => {
    const existing: VocabMonth = {
      month: "2026-04",
      displayName: "April",
      days: [
        {
          day: 1,
          words: [
            {
              id: "abate",
              word: "abate",
              partOfSpeech: "v",
              definition: "d",
              example: "e",
              mnemonic: "m",
            },
          ],
        },
      ],
    };
    // The model "helpfully" returns a word the user already has, twice over.
    const { provider } = fakeProvider({
      scripted: [["abate", "abatement", "fresh"]],
    });
    const { months, commit } = collect();

    const checkpoint = await runPlan({
      plan: plan({ horizon: "month", wordsPerDay: 1 }),
      provider,
      index: VocabIndex.from([existing]),
      commit,
    });

    const words = months[0].days.flatMap((d) => d.words).map((w) => w.word);
    expect(words).not.toContain("abate");
    expect(words).not.toContain("abatement");
    expect(words).toContain("fresh");
    expect(checkpoint.outcomes[0].duplicates).toBeGreaterThanOrEqual(2);
  });

  it("does not repeat a word across months of the same run", async () => {
    // Month 2 must already know what month 1 committed.
    const { provider } = fakeProvider({
      scripted: [["recurring"], ["recurring"]],
    });
    const { months, commit } = collect();

    await runPlan({
      plan: plan({ horizon: "quarter", wordsPerDay: 1 }),
      provider,
      index: VocabIndex.from([]),
      commit,
    });

    const all = months.flatMap((m) => m.days.flatMap((d) => d.words));
    expect(all.filter((w) => w.word === "recurring")).toHaveLength(1);
  });

  it("tops up once when the first round comes back too duplicated", async () => {
    const { provider, calls } = fakeProvider();
    const index = VocabIndex.from([]);
    // Pre-seed the index with everything the first round will produce.
    const spy = vi.spyOn(index, "filter");
    spy.mockImplementationOnce(() => ({ kept: [], rejected: [] }));

    await runPlan({
      plan: plan({ horizon: "month", wordsPerDay: 1 }),
      provider,
      index,
      commit: () => {},
    });

    // Two rounds: the original request and one top-up.
    expect(calls.length).toBe(2);
    spy.mockRestore();
  });

  it("accepts a short month rather than blocking the run", async () => {
    const { provider } = fakeProvider();
    const index = VocabIndex.from([]);
    const spy = vi.spyOn(index, "filter");
    // Both rounds come back entirely duplicated but for one word.
    const only = {
      id: "x",
      word: "solitary",
      partOfSpeech: "adj",
      definition: "d",
      example: "e",
      mnemonic: "m",
    };
    spy.mockImplementation(() => ({ kept: [only], rejected: [] }));

    const { months, commit } = collect();
    const checkpoint = await runPlan({
      plan: plan({ horizon: "month", wordsPerDay: 1 }),
      provider,
      index,
      commit,
    });

    // A user who asked for a year should not be blocked by one stubborn batch.
    expect(months).toHaveLength(1);
    expect(checkpoint.outcomes[0].shortfall).toBe(29);
    spy.mockRestore();
  });
});

describe("resuming", () => {
  it("stops at the month that failed", async () => {
    const { provider } = fakeProvider({
      failOn: (call) => (call === 1 ? "the provider fell over" : undefined),
    });
    const { months, commit } = collect();

    const checkpoint = await runPlan({
      plan: plan({ horizon: "quarter" }),
      provider,
      index: VocabIndex.from([]),
      commit,
    });

    expect(months).toHaveLength(1);
    expect(checkpoint.completed).toEqual(["2026-10"]);
    expect(checkpoint.outcomes[1].error).toMatch(/fell over/);
  });

  it("resumes at the month it died on, not at the start", async () => {
    const p = plan({ horizon: "quarter" });
    const first = fakeProvider({
      failOn: (call) => (call === 1 ? "boom" : undefined),
    });
    const { months, commit } = collect();
    const index = VocabIndex.from([]);

    const partial = await runPlan({ plan: p, provider: first.provider, index, commit });
    expect(partial.completed).toEqual(["2026-10"]);

    // Resume with a working provider.
    const second = fakeProvider();
    const finished = await runPlan({
      plan: p,
      provider: second.provider,
      index,
      commit,
      checkpoint: partial,
    });

    expect(finished.completed).toEqual(["2026-10", "2026-11", "2026-12"]);
    // Month one was not generated again.
    expect(months).toHaveLength(3);
    expect(second.calls).toHaveLength(2);
  });

  it("knows what is left", () => {
    const p = plan({ horizon: "quarter" });
    const checkpoint: RunCheckpoint = { ...newCheckpoint(p), completed: ["2026-10"] };
    expect(remainingMonths(checkpoint)).toEqual(["2026-11", "2026-12"]);
  });

  it("reports progress after every month so the caller can persist it", async () => {
    const seen: number[] = [];
    const { provider } = fakeProvider();
    await runPlan({
      plan: plan({ horizon: "quarter" }),
      provider,
      index: VocabIndex.from([]),
      commit: () => {},
      onProgress: (c) => seen.push(c.completed.length),
    });
    expect(seen).toEqual([1, 2, 3]);
  });

  it("stops when aborted", async () => {
    const controller = new AbortController();
    const { provider } = fakeProvider();
    const { months, commit } = collect();

    const checkpoint = await runPlan({
      plan: plan({ horizon: "year" }),
      provider,
      index: VocabIndex.from([]),
      commit: (m) => {
        commit(m);
        controller.abort();
      },
      signal: controller.signal,
    });

    expect(months).toHaveLength(1);
    expect(checkpoint.completed).toHaveLength(1);
  });
});

describe("required words", () => {
  it("are asked for by name in the first round", async () => {
    const { provider, calls } = fakeProvider();
    await runPlan({
      plan: plan({ horizon: "month", mustInclude: ["perspicacious"] }),
      provider,
      index: VocabIndex.from([]),
      commit: () => {},
    });
    expect(calls[0].prompt).toContain("perspicacious");
  });

  it("are requested only for the month they belong to", async () => {
    const { provider, calls } = fakeProvider();
    await runPlan({
      plan: plan({ horizon: "quarter", mustInclude: ["perspicacious"] }),
      provider,
      index: VocabIndex.from([]),
      commit: () => {},
    });
    expect(calls[0].prompt).toContain("perspicacious");
    expect(calls[1].prompt).not.toContain("perspicacious");
  });
});

describe("topicFor", () => {
  it("names the register and the difficulty", () => {
    const topic = topicFor(plan({ register: "academic verbs" }), 0);
    expect(topic).toContain("academic verbs");
    expect(topic).toMatch(/level of/);
  });

  it("includes the month's theme when there is one", () => {
    const topic = topicFor(plan({ themes: ["jurisprudence"] }), 0);
    expect(topic).toContain("jurisprudence");
  });

  it("says required words are additional, not a substitution", () => {
    // Without this a model treats them as the whole order and returns three
    // words when thirty were wanted.
    const topic = topicFor(plan(), 0, ["abate"]);
    expect(topic).toMatch(/in addition to/);
  });
});

describe("summarize", () => {
  it("counts what happened", async () => {
    const { provider } = fakeProvider();
    const checkpoint = await runPlan({
      plan: plan({ horizon: "quarter", wordsPerDay: 1 }),
      provider,
      index: VocabIndex.from([]),
      commit: () => {},
    });

    const summary = summarize(checkpoint);
    expect(summary.months).toBe(3);
    expect(summary.words).toBe(90);
    expect(summary.failed).toEqual([]);
  });

  it("names the months that failed", async () => {
    const { provider } = fakeProvider({
      failOn: (call) => (call === 0 ? "nope" : undefined),
    });
    const checkpoint = await runPlan({
      plan: plan({ horizon: "quarter" }),
      provider,
      index: VocabIndex.from([]),
      commit: () => {},
    });
    expect(summarize(checkpoint).failed).toEqual(["2026-10"]);
  });
});

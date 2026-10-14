// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GamesProgress } from "./GamesProgress";
import { useProgressStore } from "@/store/useProgressStore";
import { useVocabStore } from "@/store/useVocabStore";
import type { GameRoundSummary } from "@/lib/games/types";
import { dayKey } from "@/lib/order";

afterEach(() => {
  cleanup();
  useProgressStore.getState().reset();
});

const round = (over: Partial<GameRoundSummary>): GameRoundSummary => ({
  id: Math.random().toString(36),
  game: "closest",
  track: "gre",
  tier: "standard",
  timing: "timed",
  daily: null,
  finishedAt: new Date().toISOString(),
  score: 0,
  right: 0,
  total: 10,
  ms: 1,
  missed: [],
  ...over,
});

describe("GamesProgress", () => {
  it("shows a best per game and tier, and never a total of game points", () => {
    useVocabStore.setState({ activeTrack: "gre" });
    const scores = [1240, 870, 1530, 410, 960];
    const store = useProgressStore.getState();
    scores.forEach((score, i) =>
      store.recordGameRound(round({ score, game: i % 2 ? "fact" : "closest", tier: i < 3 ? "standard" : "hard" })),
    );
    store.recordGameRound(round({ game: "daily", daily: dayKey(new Date()), right: 8, score: 990 }));
    render(<GamesProgress />);

    // Rendered twice — a list for phones, a table above `sm` — and jsdom has
    // no CSS to hide either, so both are present here.
    expect(screen.getAllByText("Closest Meaning").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1,530").length).toBeGreaterThan(0);

    // ADR 0016: no lifetime total, in any formatting.
    const text = document.body.textContent ?? "";
    const total = [...scores, 990].reduce((a, b) => a + b, 0);
    for (const form of [String(total), total.toLocaleString(), total.toLocaleString("en-US")]) {
      expect(text).not.toContain(form);
    }
    expect(text.toLowerCase()).not.toMatch(/total|lifetime|all-time|xp|level/);
  });

  it("shows today's Daily Round as a result, not as a best", () => {
    useVocabStore.setState({ activeTrack: "gre" });
    useProgressStore.getState().recordGameRound(round({ game: "daily", daily: dayKey(new Date()), right: 7 }));
    render(<GamesProgress />);
    expect(screen.getByText("7/10")).toBeTruthy();
    expect(useProgressStore.getState().gameBests).toEqual({});
  });

  it("renders nothing for a user who has never played", () => {
    render(<GamesProgress />);
    expect(screen.queryByTestId("games-progress")).toBeNull();
  });
});

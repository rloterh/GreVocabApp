/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WordDetail, type WordDetailTarget } from "@/components/WordDetail";
import { useProgressStore } from "@/store/useProgressStore";
import type { StudySession, WordProgress } from "@/types";

const WORD: WordDetailTarget = {
  id: "2026-04-abate",
  word: "abate",
  partOfSpeech: "verb",
  definition: "To lessen in intensity.",
  example: "The storm abated by dawn.",
  mnemonic: "a-BATE, like bait shrinking",
  monthKey: "2026-04",
  monthName: "April 2026",
  day: 3,
};

function progress(over: Partial<WordProgress> = {}): WordProgress {
  return {
    wordId: WORD.id,
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

function session(id: string, at: string, rating: "again" | "good"): StudySession {
  return {
    id,
    startedAt: at,
    finishedAt: at,
    deck: "all",
    cardCount: 1,
    events: [{ wordId: WORD.id, rating, msToRate: 2500 }],
    bestStreak: 1,
    totalMs: 2500,
  };
}

/** Freeze the clock so "due in N days" is stable. */
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 10, 12, 0, 0));
  useProgressStore.getState().reset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const user = () => userEvent.setup();

describe("visibility", () => {
  it("renders nothing when no word is selected", () => {
    render(<WordDetail word={null} onOpenChange={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the card content for the selected word", () => {
    render(<WordDetail word={WORD} onOpenChange={() => {}} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("abate")).toBeInTheDocument();
    expect(screen.getByText("verb")).toBeInTheDocument();
    expect(screen.getByText("To lessen in intensity.")).toBeInTheDocument();
    expect(screen.getByText(/April 2026/)).toBeInTheDocument();
    expect(screen.getByText(/a-BATE/)).toBeInTheDocument();
  });
});

describe("scheduling", () => {
  it("explains that an unrated word is not scheduled yet", () => {
    render(<WordDetail word={WORD} onOpenChange={() => {}} />);
    expect(screen.getByText(/Not scheduled yet/)).toBeInTheDocument();
  });

  it.each([
    ["2026-09-10T09:00:00.000Z", "Due today"],
    ["2026-09-11T09:00:00.000Z", "Due tomorrow"],
    ["2026-09-17T09:00:00.000Z", "Due in 7 days"],
    ["2026-09-07T09:00:00.000Z", "Overdue by 3 days"],
    ["2026-09-09T09:00:00.000Z", "Overdue by 1 day"],
  ])("describes a due date of %s as %s", (dueAt, expected) => {
    useProgressStore.setState({
      words: {
        [WORD.id]: progress({ dueAt, intervalDays: 7, easeFactor: 2.36, reps: 3 }),
      },
    });
    render(<WordDetail word={WORD} onOpenChange={() => {}} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("shows the SM-2 numbers", () => {
    useProgressStore.setState({
      words: {
        [WORD.id]: progress({
          dueAt: "2026-09-17T09:00:00.000Z",
          intervalDays: 7,
          easeFactor: 2.36,
          reps: 3,
        }),
      },
    });
    render(<WordDetail word={WORD} onOpenChange={() => {}} />);
    expect(screen.getByText("2.36")).toBeInTheDocument();
    expect(screen.getByText("7d")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});

describe("tallies", () => {
  it("shows mastery and quiz accuracy when there is any", () => {
    useProgressStore.setState({
      words: {
        [WORD.id]: progress({
          mastered: true,
          timesReviewed: 6,
          quizAttempts: 4,
          quizCorrect: 3,
        }),
      },
    });
    render(<WordDetail word={WORD} onOpenChange={() => {}} />);
    expect(screen.getByText("Mastered")).toBeInTheDocument();
    expect(screen.getByText(/Reviewed 6/)).toBeInTheDocument();
    expect(screen.getByText(/Quiz 75% \(3\/4\)/)).toBeInTheDocument();
  });

  it("omits quiz accuracy when the word has never been quizzed", () => {
    render(<WordDetail word={WORD} onOpenChange={() => {}} />);
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.queryByText(/Quiz /)).not.toBeInTheDocument();
  });
});

describe("review history", () => {
  it("says so when there is none", () => {
    render(<WordDetail word={WORD} onOpenChange={() => {}} />);
    expect(screen.getByText(/No flashcard reviews recorded/)).toBeInTheDocument();
  });

  it("reconstructs history from study sessions, newest first", () => {
    useProgressStore.setState({
      studies: [
        session("s1", "2026-09-01T10:00:00.000Z", "again"),
        session("s2", "2026-09-08T10:00:00.000Z", "good"),
      ],
    });
    render(<WordDetail word={WORD} onOpenChange={() => {}} />);

    const good = screen.getByText("Good");
    const again = screen.getByText("Again");
    expect(good).toBeInTheDocument();
    expect(again).toBeInTheDocument();
    // The newer session must come first in the document.
    expect(good.compareDocumentPosition(again)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("ignores events belonging to other words", () => {
    useProgressStore.setState({
      studies: [
        {
          ...session("s1", "2026-09-08T10:00:00.000Z", "good"),
          events: [{ wordId: "some-other-word", rating: "good", msToRate: 1000 }],
        },
      ],
    });
    render(<WordDetail word={WORD} onOpenChange={() => {}} />);
    expect(screen.getByText(/No flashcard reviews recorded/)).toBeInTheDocument();
  });
});

describe("actions", () => {
  // Interaction tests need the real clock: user-event waits on timers that a
  // frozen clock never advances, and none of these assertions care about
  // "today" the way the scheduling tests do.
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("offers a jump to practice and reports the word back", async () => {
    const onOpenPractice = vi.fn();
    render(
      <WordDetail
        word={WORD}
        onOpenChange={() => {}}
        onOpenPractice={onOpenPractice}
      />,
    );
    await user().click(screen.getByRole("button", { name: /Open day 3/ }));
    expect(onOpenPractice).toHaveBeenCalledWith(WORD);
  });

  it("omits the jump when no handler is given", () => {
    render(<WordDetail word={WORD} onOpenChange={() => {}} />);
    expect(screen.queryByRole("button", { name: /Open day/ })).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const onOpenChange = vi.fn();
    render(<WordDetail word={WORD} onOpenChange={onOpenChange} />);
    await user().keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

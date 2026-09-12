/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { DropOverlay } from "@/components/DropOverlay";
import { useVocabStore } from "@/store/useVocabStore";
import { useAppStore } from "@/store/useAppStore";

/**
 * The overlay is mostly drag-event bookkeeping, which is exactly the kind of
 * thing that looks right and behaves wrong. These drive the real DOM events.
 */

/** A DragEvent carrying the `Files` type, the way a real file drag does. */
function fileDrag(type: string, files: File[] = []): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: { types: ["Files"], files, dropEffect: "none" },
  });
  return event;
}

/** A drag carrying selected text — the overlay should ignore this entirely. */
function textDrag(type: string): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: { types: ["text/plain"], files: [] },
  });
  return event;
}

const monthJson = (key: string) =>
  JSON.stringify({
    month: key,
    displayName: key,
    days: [
      {
        day: 1,
        words: [
          {
            word: "abate",
            partOfSpeech: "verb",
            definition: "To lessen.",
            example: "The storm abated.",
            mnemonic: "a-BATE",
          },
        ],
      },
    ],
  });

beforeEach(() => {
  useVocabStore.setState({ months: {}, activeMonthKey: null, selectedDay: 1 });
  useAppStore.setState({ toast: null });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("visibility", () => {
  it("stays hidden until something is dragged in", () => {
    render(<DropOverlay />);
    expect(screen.queryByText("Drop to import")).not.toBeInTheDocument();
  });

  it("appears when files are dragged over the window", async () => {
    render(<DropOverlay />);
    window.dispatchEvent(fileDrag("dragenter"));
    expect(await screen.findByText("Drop to import")).toBeInTheDocument();
  });

  it("ignores a drag that is not carrying files", () => {
    render(<DropOverlay />);
    window.dispatchEvent(textDrag("dragenter"));
    expect(screen.queryByText("Drop to import")).not.toBeInTheDocument();
  });

  it("survives crossing child elements without flickering", async () => {
    // dragenter/dragleave fire per element; a naive boolean would hide here.
    render(<DropOverlay />);
    window.dispatchEvent(fileDrag("dragenter")); // window
    window.dispatchEvent(fileDrag("dragenter")); // a child
    window.dispatchEvent(fileDrag("dragleave")); // leaving that child
    expect(await screen.findByText("Drop to import")).toBeInTheDocument();
  });

  it("hides once the last dragleave balances the enters", async () => {
    render(<DropOverlay />);
    window.dispatchEvent(fileDrag("dragenter"));
    window.dispatchEvent(fileDrag("dragenter"));
    expect(await screen.findByText("Drop to import")).toBeInTheDocument();

    window.dispatchEvent(fileDrag("dragleave"));
    window.dispatchEvent(fileDrag("dragleave"));
    await waitFor(() =>
      expect(screen.queryByText("Drop to import")).not.toBeInTheDocument(),
    );
  });

  it("hides on dragend, which is the only signal when a drag leaves the window", async () => {
    render(<DropOverlay />);
    window.dispatchEvent(fileDrag("dragenter"));
    expect(await screen.findByText("Drop to import")).toBeInTheDocument();

    window.dispatchEvent(fileDrag("dragend"));
    await waitFor(() =>
      expect(screen.queryByText("Drop to import")).not.toBeInTheDocument(),
    );
  });
});

describe("dropping", () => {
  it("imports a dropped file and reports it", async () => {
    render(<DropOverlay />);
    const file = new File([monthJson("2026-07")], "2026-07.json", {
      type: "application/json",
    });

    window.dispatchEvent(fileDrag("dragenter"));
    window.dispatchEvent(fileDrag("drop", [file]));

    await waitFor(() =>
      expect(useVocabStore.getState().hasMonthKey("gre/01")).toBe(true),
    );
    expect(useAppStore.getState().toast?.title).toBe("Loaded 1 month");
  });

  it("reports a file it cannot parse rather than failing silently", async () => {
    render(<DropOverlay />);
    const file = new File(["{ broken"], "bad.json", {
      type: "application/json",
    });

    window.dispatchEvent(fileDrag("drop", [file]));

    await waitFor(() =>
      expect(useAppStore.getState().toast?.variant).toBe("error"),
    );
    expect(useAppStore.getState().toast?.title).toBe("Import failed");
  });

  it("says what it accepts when the drop holds nothing usable", async () => {
    render(<DropOverlay />);
    const file = new File(["notes"], "notes.txt", { type: "text/plain" });

    window.dispatchEvent(fileDrag("drop", [file]));

    await waitFor(() =>
      expect(useAppStore.getState().toast?.title).toBe("Nothing imported"),
    );
    expect(useAppStore.getState().toast?.description).toContain(".apkg");
  });

  it("hides the overlay again once the import finishes", async () => {
    render(<DropOverlay />);
    const file = new File([monthJson("2026-07")], "a.json");
    window.dispatchEvent(fileDrag("dragenter"));
    window.dispatchEvent(fileDrag("drop", [file]));

    await waitFor(() =>
      expect(screen.queryByText("Drop to import")).not.toBeInTheDocument(),
    );
  });
});

describe("cleanup", () => {
  it("stops listening once unmounted", async () => {
    const { unmount } = render(<DropOverlay />);
    unmount();
    window.dispatchEvent(fileDrag("dragenter"));
    // Nothing should have been rendered back into the document.
    expect(screen.queryByText("Drop to import")).not.toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WordRelations } from "./WordRelations";
import { useSettingsStore } from "@/store/useSettingsStore";

afterEach(() => {
  cleanup();
  useSettingsStore.getState().reset();
});

const set = (showWordRelations: boolean) =>
  useSettingsStore.getState().set({ showWordRelations });

describe("WordRelations", () => {
  it("shows synonyms and antonyms by default", () => {
    // On by default: this content was in the corpus from the start and only
    // one screen ever rendered it, so most users never knew it existed.
    render(
      <WordRelations word={{ synonyms: ["quiescent"], antonyms: ["clamorous"] }} />,
    );
    expect(screen.getByText("Synonyms")).toBeTruthy();
    expect(screen.getByText("quiescent")).toBeTruthy();
    expect(screen.getByText("Antonyms")).toBeTruthy();
    expect(screen.getByText("clamorous")).toBeTruthy();
  });

  it("renders nothing when the setting is off", () => {
    set(false);
    const { container } = render(
      <WordRelations word={{ synonyms: ["quiescent"], antonyms: ["clamorous"] }} />,
    );
    expect(container.textContent).toBe("");
  });

  it("renders nothing when the word has neither", () => {
    // Callers place this between other blocks, so an empty render must leave
    // no heading and no spacing behind.
    const { container } = render(<WordRelations word={{}} />);
    expect(container.textContent).toBe("");
  });

  it("omits a heading for the side that is empty", () => {
    render(<WordRelations word={{ synonyms: ["quiescent"], antonyms: [] }} />);
    expect(screen.getByText("Synonyms")).toBeTruthy();
    expect(screen.queryByText("Antonyms")).toBeNull();
  });

  it("renders each word once", () => {
    render(
      <WordRelations word={{ synonyms: ["still", "hushed"], antonyms: ["loud"] }} />,
    );
    for (const w of ["still", "hushed", "loud"]) {
      expect(screen.getAllByText(w)).toHaveLength(1);
    }
  });
});

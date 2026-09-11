/**
 * @vitest-environment jsdom
 *
 * The tab bar is logic, not composition: which destinations earn a tab, what
 * counts as "you are here" when the current page lives behind More, and whether
 * the sheet closes when it should. jsdom has no layout, so the `lg:hidden`
 * swap itself is verified in the browser audit, not here.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MobileTabBar } from "@/components/MobileTabBar";
import { useAppStore } from "@/store/useAppStore";

function setup(moreOpen = false) {
  const onMoreOpenChange = vi.fn();
  render(
    <MobileTabBar moreOpen={moreOpen} onMoreOpenChange={onMoreOpenChange} />,
  );
  return { onMoreOpenChange, user: userEvent.setup() };
}

beforeEach(() => {
  cleanup();
  useAppStore.setState({ page: "dashboard" });
});

describe("the tabs", () => {
  it("offers exactly five, which is what fits a thumb", () => {
    setup();
    // Ten destinations do not fit a bar. Five is the product decision in
    // docs/MOBILE.md; a sixth appearing here means that decision was changed
    // by accident.
    const bar = screen.getByRole("navigation", { name: "Main" });
    expect(bar.querySelectorAll("button")).toHaveLength(5);
  });

  it("shows the four daily destinations plus More", () => {
    setup();
    for (const label of ["Home", "Practice", "Cards", "Quiz", "More"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
  });

  it("navigates when a tab is tapped", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Quiz" }));
    expect(useAppStore.getState().page).toBe("quiz");
  });

  it("marks the current page", () => {
    useAppStore.setState({ page: "flashcards" });
    setup();
    expect(
      screen.getByRole("button", { name: "Cards" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("button", { name: "Home" }).getAttribute("aria-current"),
    ).toBeNull();
  });
});

describe("More", () => {
  it("opens the sheet rather than navigating", async () => {
    const { user, onMoreOpenChange } = setup(false);
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(onMoreOpenChange).toHaveBeenCalledWith(true);
    // It must not move the user somewhere; the page is unchanged.
    expect(useAppStore.getState().page).toBe("dashboard");
  });

  it("closes the sheet when tapped again", async () => {
    const { user, onMoreOpenChange } = setup(true);
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(onMoreOpenChange).toHaveBeenCalledWith(false);
  });

  it("reports its expanded state to assistive technology", () => {
    setup(true);
    expect(
      screen.getByRole("button", { name: "More" }).getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("lights up while the current page lives behind it", () => {
    // Otherwise a user on Settings sees nothing highlighted anywhere and has
    // no idea where they are.
    useAppStore.setState({ page: "settings" });
    setup(false);
    const more = screen.getByRole("button", { name: "More" });
    expect(more.className).toContain("text-foreground");
  });

  it("holds every destination that has no tab", () => {
    setup(true);
    const sheet = screen.getByRole("dialog", { name: "More destinations" });
    const labels = [...sheet.querySelectorAll("button")].map((b) =>
      b.textContent?.trim(),
    );
    // Between the bar and the sheet, all ten must be reachable — a page that
    // appears in neither is unreachable on a phone.
    expect(labels).toEqual([
      "Sentences",
      "Calendar",
      "Archive",
      "Progress",
      "Search",
      "Settings",
    ]);
  });

  it("navigates and closes when a destination is chosen", async () => {
    const { user, onMoreOpenChange } = setup(true);
    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(useAppStore.getState().page).toBe("archive");
    // Leaving it open would cover the page just navigated to.
    expect(onMoreOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes on Escape", async () => {
    const { user, onMoreOpenChange } = setup(true);
    await user.keyboard("{Escape}");
    expect(onMoreOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not listen for Escape while closed", async () => {
    const { user, onMoreOpenChange } = setup(false);
    await user.keyboard("{Escape}");
    expect(onMoreOpenChange).not.toHaveBeenCalled();
  });

  it("renders no sheet when closed", () => {
    setup(false);
    expect(screen.queryByRole("dialog", { name: "More destinations" })).toBeNull();
  });
});

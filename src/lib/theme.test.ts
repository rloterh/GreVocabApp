import { describe, expect, it } from "vitest";
import { resolveTheme, THEME_CLASSES, THEMES } from "@/lib/theme";

describe("resolveTheme", () => {
  it("passes concrete themes through unchanged", () => {
    for (const theme of THEME_CLASSES) {
      expect(resolveTheme(theme)).toBe(theme);
    }
  });

  it("resolves system against the OS preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("the theme table", () => {
  it("offers every palette defined in globals.css plus system", () => {
    expect(THEMES.map((t) => t.value)).toEqual([
      "light",
      "dark",
      "system",
      "sepia",
      "solarized",
      "high-contrast",
    ]);
  });

  it("lists every class applyTheme might need to remove", () => {
    // A theme missing from this list would stack on top of the previous one.
    expect(THEME_CLASSES).toEqual([
      "light",
      "dark",
      "sepia",
      "solarized",
      "high-contrast",
    ]);
    expect(THEME_CLASSES).not.toContain("system");
  });

  it("gives every theme a label and a hint", () => {
    expect(THEMES.every((t) => t.label.length > 0 && t.hint.length > 0)).toBe(
      true,
    );
  });

  it("has no duplicate values", () => {
    const values = THEMES.map((t) => t.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

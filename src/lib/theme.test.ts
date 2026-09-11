import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { THEMES, THEME_CLASSES, THEME_GROUPS, resolveTheme } from "@/lib/theme";

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
    // Derived from the stylesheet rather than listed here. The previous
    // version hardcoded six names while claiming to check the stylesheet, so
    // adding a theme made it fail for the wrong reason — and forgetting to
    // register one would not have failed it at all.
    const css = readFileSync(
      resolve(__dirname, "../styles/globals.css"),
      "utf-8",
    );
    // A theme block is one that defines a palette; `.bg-grid` and the other
    // utility classes in this file are not themes.
    const inCss = new Set(
      [...css.matchAll(/^ {2}\.([a-z-]+)\s*\{([^}]*)}/gm)]
        .filter((m) => m[2].includes("--background:"))
        .map((m) => m[1]),
    );
    // `:root` carries the light palette, which has no class of its own.
    inCss.add("light");

    const registered = new Set(THEMES.map((t) => t.value));
    registered.delete("system");

    expect([...registered].sort()).toEqual([...inCss].sort());
  });

  it("lists every class applyTheme might need to remove", () => {
    // A theme missing from this list would stack on top of the previous one.
    expect([...THEME_CLASSES].sort()).toEqual(
      THEMES.filter((t) => t.value !== "system")
        .map((t) => t.value)
        .sort(),
    );
    expect(THEME_CLASSES).not.toContain("system");
  });

  it("puts every theme in a group the picker renders", () => {
    const groups = new Set(THEME_GROUPS.map((g) => g.group));
    for (const theme of THEMES) {
      // A theme in no rendered group is unreachable in the UI.
      expect(groups.has(theme.group), `${theme.value} has no shelf`).toBe(true);
    }
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

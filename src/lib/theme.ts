/**
 * Theme selection.
 *
 * The palette itself is CSS custom properties in `src/styles/globals.css` —
 * this only decides which class goes on the root element. Adding a theme means
 * adding a token block there and an entry here; nothing else needs to know.
 *
 * See ROADMAP.md, Phase 5.
 */

import type { Theme } from "@/types";

/**
 * Which shelf a theme sits on in the picker.
 *
 * Ten swatches in a flat grid is a wall. Grouping turns "pick one of ten" into
 * three short questions.
 */
export type ThemeGroup = "system" | "light" | "dark" | "accessibility";

export interface ThemeSpec {
  value: Theme;
  label: string;
  /** One line for the settings UI. */
  hint: string;
  group: ThemeGroup;
}

export const THEMES: ThemeSpec[] = [
  { value: "system", label: "System", hint: "Follow the OS", group: "system" },

  { value: "light", label: "Light", hint: "Warm paper white", group: "light" },
  {
    value: "porcelain",
    label: "Porcelain",
    hint: "Cool off-white, deep teal",
    group: "light",
  },
  { value: "sepia", label: "Sepia", hint: "Aged paper, amber accent", group: "light" },

  { value: "dark", label: "Dark", hint: "Near-black, mint accent", group: "dark" },
  {
    value: "midnight",
    label: "Midnight",
    hint: "Navy, periwinkle accent",
    group: "dark",
  },
  {
    value: "evergreen",
    label: "Evergreen",
    hint: "Deep forest, moss accent",
    group: "dark",
  },
  { value: "claret", label: "Claret", hint: "Burgundy and gold", group: "dark" },
  {
    value: "solarized",
    label: "Solarized",
    hint: "The classic dark palette",
    group: "dark",
  },

  {
    value: "high-contrast",
    label: "High contrast",
    hint: "Maximum legibility",
    group: "accessibility",
  },
];

/** The picker's shelves, in order, with a heading each. */
export const THEME_GROUPS: Array<{ group: ThemeGroup; label: string }> = [
  { group: "system", label: "Automatic" },
  { group: "light", label: "Light" },
  { group: "dark", label: "Dark" },
  { group: "accessibility", label: "Accessibility" },
];

/**
 * Every class this module might put on the root, so switching themes can
 * remove them all rather than only the two it happens to remember.
 */
export const THEME_CLASSES = THEMES.filter((t) => t.value !== "system").map(
  (t) => t.value,
);

/** Does the OS currently ask for a dark palette? */
export function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** The concrete theme to render, resolving "system" against the OS. */
export function resolveTheme(theme: Theme, systemPrefersDark = prefersDark()) {
  if (theme !== "system") return theme;
  return systemPrefersDark ? "dark" : "light";
}

/** Put the right class on the root element. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.remove(...THEME_CLASSES);
  root.classList.add(resolveTheme(theme));
}

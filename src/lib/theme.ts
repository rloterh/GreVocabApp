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

export interface ThemeSpec {
  value: Theme;
  label: string;
  /** One line for the settings UI. */
  hint: string;
}

export const THEMES: ThemeSpec[] = [
  { value: "light", label: "Light", hint: "Warm paper white" },
  { value: "dark", label: "Dark", hint: "Near-black, mint accent" },
  { value: "system", label: "System", hint: "Follow the OS" },
  { value: "sepia", label: "Sepia", hint: "Aged paper, amber accent" },
  { value: "solarized", label: "Solarized", hint: "The classic dark palette" },
  {
    value: "high-contrast",
    label: "High contrast",
    hint: "Maximum legibility",
  },
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

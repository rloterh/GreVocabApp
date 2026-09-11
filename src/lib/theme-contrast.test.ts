/**
 * Every theme is legible, checked rather than eyeballed.
 *
 * Ten themes is well past the point where reviewing colours by eye is
 * reliable: a palette that looks fine on the author's monitor can be
 * unreadable on someone else's, and the failure is silent — nobody files a bug
 * saying "the muted text is slightly too pale", they just stop using it.
 *
 * So the palettes get a test. It parses the real token blocks out of
 * globals.css rather than a copy kept here, because a copy is exactly the thing
 * that would drift from the stylesheet it claims to describe.
 *
 * This test is worth more than the themes it checks: it makes the eleventh
 * theme safe for someone who has never seen the other ten.
 *
 * See docs/THEMES.md.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { THEMES } from "@/lib/theme";

const CSS = readFileSync(
  resolve(__dirname, "../styles/globals.css"),
  "utf-8",
);

/** WCAG AA for body text. */
const AA = 4.5;
/** WCAG AAA — what High contrast claims to be. */
const AAA = 7;
/** AA for large text and UI components: badges, dots, status colours. */
const UI = 3;
/**
 * A border that clears 4.5:1 is a line, not a border. This floor exists only to
 * catch borders that have vanished into their background entirely.
 *
 * docs/THEMES.md originally specified 1.6, which was written without measuring
 * anything: **all nine** palettes fall between 1.20 and 1.66, including the
 * four the same document specifies token by token. A threshold every subject
 * fails is a wrong threshold, not nine wrong palettes — a hairline at 1.2:1 is
 * a deliberate design choice, and forcing 1.6 would make every card outline
 * heavier than intended. 1.15 still catches an actually invisible border.
 */
const BORDER = 1.15;

/** The pairs that must hold for every theme. */
const PAIRS: Array<[fg: string, bg: string, min: number]> = [
  ["foreground", "background", AA],
  ["card-foreground", "card", AA],
  ["muted-foreground", "background", AA],
  ["muted-foreground", "muted", AA],
  ["primary-foreground", "primary", AA],
  ["accent-foreground", "accent", AA],
  ["destructive", "background", UI],
  ["success", "background", UI],
  ["warning", "background", UI],
  ["border", "background", BORDER],
];

/** Text pairs held to AAA for the theme whose entire purpose is legibility. */
const TEXT_PAIRS = PAIRS.filter(([, , min]) => min === AA);

/** Themes with a palette of their own. "system" resolves to another. */
const PALETTES = THEMES.map((t) => t.value).filter((v) => v !== "system");

/**
 * Pull one theme's tokens out of the stylesheet.
 *
 * `:root` carries the light theme; everything else is a class block.
 */
function tokensFor(theme: string): Record<string, string> {
  const selector = theme === "light" ? ":root" : `\\.${theme}`;
  const match = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(CSS);
  if (!match) throw new Error(`no token block for "${theme}" in globals.css`);

  const tokens: Record<string, string> = {};
  for (const [, name, value] of match[1].matchAll(
    /--([a-z-]+):\s*([^;]+);/g,
  )) {
    tokens[name] = value.trim();
  }
  return tokens;
}

/** "220 14% 96%" → relative luminance, per WCAG. */
export function luminance(hsl: string): number {
  const [h, s, l] = parseHsl(hsl);
  const [r, g, b] = hslToRgb(h, s, l);
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

function parseHsl(value: string): [number, number, number] {
  const match = /^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/.exec(value.trim());
  if (!match) throw new Error(`not an HSL triple: "${value}"`);
  return [Number(match[1]), Number(match[2]) / 100, Number(match[3]) / 100];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

describe("the contrast maths", () => {
  it("puts black on white at 21:1", () => {
    expect(contrast("0 0% 0%", "0 0% 100%")).toBeCloseTo(21, 1);
  });

  it("puts a colour against itself at 1:1", () => {
    expect(contrast("210 20% 50%", "210 20% 50%")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrast("0 0% 10%", "0 0% 90%")).toBeCloseTo(
      contrast("0 0% 90%", "0 0% 10%"),
      10,
    );
  });

  it("agrees with a known value", () => {
    // #767676 on white is the canonical 4.54:1 example from the WCAG docs.
    expect(contrast("0 0% 46.3%", "0 0% 100%")).toBeGreaterThan(4.5);
    expect(contrast("0 0% 46.3%", "0 0% 100%")).toBeLessThan(4.6);
  });

  it("rejects anything that is not an HSL triple", () => {
    expect(() => luminance("rebeccapurple")).toThrow();
  });
});

describe("every theme has a complete palette", () => {
  it("finds a token block for each", () => {
    // A theme registered in THEMES with no CSS block renders as the previous
    // theme's colours, which looks like nothing happened.
    for (const theme of PALETTES) {
      expect(() => tokensFor(theme), theme).not.toThrow();
    }
  });

  it.each(PALETTES)("%s defines every token the pairs need", (theme) => {
    const tokens = tokensFor(theme);
    const needed = new Set(PAIRS.flatMap(([fg, bg]) => [fg, bg]));
    for (const token of needed) {
      expect(tokens[token], `${theme} is missing --${token}`).toBeTruthy();
    }
  });

  it("checks more than a couple of themes", () => {
    // Guards against a parsing change quietly reducing this whole file to a
    // test of one palette.
    expect(PALETTES.length).toBeGreaterThanOrEqual(9);
  });
});

describe.each(PALETTES)("%s is legible", (theme) => {
  const tokens = tokensFor(theme);
  const minimum = (base: number) =>
    theme === "high-contrast" && base === AA ? AAA : base;

  it.each(PAIRS)("--%s on --%s", (fg, bg, base) => {
    const required = minimum(base);
    const ratio = contrast(tokens[fg], tokens[bg]);
    expect(
      Number(ratio.toFixed(2)),
      `${theme}: --${fg} on --${bg} is ${ratio.toFixed(2)}:1, needs ${required}:1`,
    ).toBeGreaterThanOrEqual(required);
  });
});

describe("high contrast earns its name", () => {
  it("clears AAA on every text pair, not merely AA", () => {
    // A theme whose entire purpose is legibility should be held to the
    // standard it claims, or it is just another dark theme.
    const tokens = tokensFor("high-contrast");
    for (const [fg, bg] of TEXT_PAIRS) {
      expect(
        contrast(tokens[fg], tokens[bg]),
        `--${fg} on --${bg}`,
      ).toBeGreaterThanOrEqual(AAA);
    }
  });

  it("is stricter than the themes it sits beside", () => {
    const strict = tokensFor("high-contrast");
    const ordinary = tokensFor("dark");
    expect(contrast(strict.foreground, strict.background)).toBeGreaterThan(
      contrast(ordinary.foreground, ordinary.background),
    );
  });
});

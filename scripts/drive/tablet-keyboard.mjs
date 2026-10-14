/**
 * A tablet with a keyboard attached.
 *
 * iPads have keyboards, and Android tablets take them. The risk is code that
 * reasons "touch screen, therefore no keyboard": a shortcut gated on the
 * pointer, a focus ring hidden on touch. So this runs as a tablet — touch
 * emulated, `pointer: coarse` confirmed from inside the page — and then uses
 * only the keyboard. ROADMAP.md Phase 16, "External keyboard".
 *
 *   npm run dev
 *   CHROME_EXE=<chrome> node scripts/drive/tablet-keyboard.mjs
 */

import { chromium } from "playwright-core";

const EXE = process.env.CHROME_EXE;
const URL = process.env.LEXICON_URL ?? "http://localhost:1420/";
const problems = [];
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) problems.push(label);
};

// The rail (720–1023px) and the full sidebar (1024px+), both on a touch screen.
const TABLETS = [
  { name: "iPad portrait", width: 820, height: 1180 },
  { name: "iPad landscape", width: 1180, height: 820 },
];

const GO_TO = {
  d: /Dashboard/,
  p: /Daily practice/,
  f: /Flashcards/,
  q: /Quiz/,
  m: /Games/,
  w: /Sentences/,
  c: /Calendar/,
  a: /Archive/,
  r: /Progress/,
};

const browser = await chromium.launch({ executablePath: EXE });

for (const tablet of TABLETS) {
  const context = await browser.newContext({
    viewport: { width: tablet.width, height: tablet.height },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem("lexicon.settings.v1")) {
      localStorage.setItem(
        "lexicon.settings.v1",
        JSON.stringify({ state: { hasOnboarded: true, hasSeenSrsIntro: true }, version: 0 }),
      );
    }
  });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const t = tablet.name;

  check(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), `${t}: the page sees a touch screen`);

  // Every "go to" sequence.
  const current = () => page.locator('[aria-current="page"]').filter({ visible: true }).first().innerText().catch(() => "");
  const missed = [];
  for (const [key, label] of Object.entries(GO_TO)) {
    await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press("g");
    await page.keyboard.press(key);
    await page.waitForTimeout(500);
    if (!label.test(await current())) missed.push(`g ${key}`);
  }
  check(missed.length === 0, `${t}: every "g" shortcut navigates`, missed.join(", "));

  await page.keyboard.press("?");
  check(await page.getByRole("dialog", { name: "Keyboard shortcuts" }).isVisible().catch(() => false), `${t}: ? opens the shortcuts`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.keyboard.press("/");
  await page.waitForTimeout(500);
  check(/Search/.test(await current()), `${t}: / opens search`);

  // Focus rings on the navigation, reached by Tab.
  await page.keyboard.press("g");
  await page.keyboard.press("d");
  await page.waitForTimeout(400);
  let unringed = 0;
  let tabbed = 0;
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const ring = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      return (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== "none";
    });
    if (ring === null) continue;
    tabbed++;
    if (!ring) unringed++;
  }
  check(tabbed > 0 && unringed === 0, `${t}: every element reached by Tab shows a focus ring`, `${unringed} of ${tabbed} without`);

  // A round of Closest Meaning, by number keys; Escape pauses.
  await page.keyboard.press("g");
  await page.keyboard.press("m");
  await page.waitForTimeout(800);
  const startGame = async (name) => {
    await page.locator("section").filter({ hasText: name }).first().getByRole("button", { name: "Standard", exact: true }).click();
    await page.waitForFunction(
      () => [...document.querySelectorAll('[role="dialog"] button')].some((b) => b.textContent === "Play" && !b.disabled && b.getAttribute("aria-disabled") !== "true"),
      null,
      { timeout: 15000 },
    );
    await page.keyboard.press("Enter");
    await page.getByTestId("game-stage").waitFor();
  };
  const stage = page.getByTestId("game-stage");
  await startGame("Closest Meaning");
  await page.waitForFunction(
    () => [...document.querySelectorAll('[data-testid="game-stage"] [role="radiogroup"] button')].some((b) => !b.disabled),
  );
  await page.keyboard.press("2");
  await page.waitForTimeout(300);
  // Answered means the options lock while the feedback shows.
  const locked = await stage.locator('[role="radiogroup"] button').evaluateAll((els) => els.every((e) => e.disabled));
  check(locked, `${t}: a number key answers`);
  await page.waitForTimeout(1200);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check(await stage.getByText("Paused", { exact: true }).isVisible(), `${t}: Escape pauses a round`);
  await stage.getByRole("button", { name: "Quit to Games" }).click();
  await page.waitForTimeout(600);

  // Match Up by keyboard: arrows move within a column, Enter picks.
  await startGame("Match Up");
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="game-stage"] [aria-label="Words"] button:not([disabled])').length === 5,
  );
  const words = stage.locator('[aria-label="Words"] button');
  await words.first().focus();
  await page.keyboard.press("ArrowDown");
  const second = await page.evaluate(() => document.activeElement?.getAttribute("data-pair"));
  check(second === (await words.nth(1).getAttribute("data-pair")), `${t}: an arrow key moves along the words`);
  await page.keyboard.press("End");
  const last = await page.evaluate(() => document.activeElement?.getAttribute("data-pair"));
  check(last === (await words.nth(4).getAttribute("data-pair")), `${t}: End goes to the last word`);
  await page.keyboard.press("Enter");
  const meanings = stage.locator('[aria-label="Meanings"] button');
  await meanings.first().focus();
  for (let i = 0; i < 5; i++) {
    if ((await page.evaluate(() => document.activeElement?.getAttribute("data-pair"))) === last) break;
    await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  check(/1 of 5/.test(await stage.innerText()), `${t}: a pair made by keyboard alone locks in`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await stage.getByRole("button", { name: "Quit to Games" }).click();

  check(errors.length === 0, `${t}: no runtime errors`, errors[0] ?? "");
  await context.close();
}

await browser.close();
if (problems.length) {
  console.log(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log("\nAll clear.");

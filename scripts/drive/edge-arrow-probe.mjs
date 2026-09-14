/**
 * Can you actually reach the flashcard's edge arrows with a mouse?
 *
 * The arrows reveal on hover and sit *outside* the card from `md` up
 * (`-left-14` / `-right-14`). The hover handlers are on the card's container.
 * If there is any gap between the container's box and the arrow, the pointer
 * crosses un-hovered ground on its way there, `pointerleave` fires, and the
 * arrow fades out from under the cursor.
 *
 * This walks the pointer from the card's edge to the arrow's centre and
 * reports opacity at each step, so the answer is measured rather than argued.
 *
 * Usage: `npm run dev`, then
 *   node scripts/drive/edge-arrow-probe.mjs
 */
import { chromium } from "playwright-core";

const EXE =
  "C:/Users/HP/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe";
const URL = "http://localhost:1420/";

const mk = (n) => ({
  id: `gre-w${n}`,
  word: `word${n}`,
  partOfSpeech: "adjective",
  definition: `The state of being word${n}.`,
  example: `A word${n} silence.`,
  mnemonic: `Like word${n}.`,
  synonyms: [],
  antonyms: [],
});
const MONTHS = {
  "gre/01": {
    track: "gre",
    ordinal: 1,
    title: "Essentials",
    days: Array.from({ length: 5 }, (_, d) => ({
      day: d + 1,
      words: [mk(d * 3 + 1), mk(d * 3 + 2), mk(d * 3 + 3)],
    })),
  },
};

const browser = await chromium.launch({ executablePath: EXE });
const problems = [];

// Every width where the arrows sit outside the card (`md` and up). 768 is the
// tightest: the card is nearly as wide as the column, so the arrow hangs
// furthest into the margin.
for (const width of [768, 1024, 1280, 1920]) {
const page = await browser.newPage({ viewport: { width, height: 900 } });
await page.addInitScript((months) => {
  localStorage.setItem(
    "lexicon.vocab.v1",
    JSON.stringify({
      state: {
        months,
        retiredWords: [],
        activeTrack: "gre",
        activeMonthKey: "gre/01",
        selectedDay: 1,
        schedules: {},
      },
      version: 2,
    }),
  );
  localStorage.setItem(
    "lexicon.settings.v1",
    JSON.stringify({ state: { hasOnboarded: true, hasSeenSrsIntro: true }, version: 0 }),
  );
}, MONTHS);

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
await page.getByRole("button", { name: "Flashcards", exact: true }).first().click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: /^Start studying$/ }).first().click();
await page.waitForTimeout(900);
// Advance one card so "Previous card" is enabled rather than disabled-at-0.3.
// By keyboard: clicking "Next" would match the edge arrow, which is inert
// while hidden — which is the very thing under test.
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(700);

const arrow = page.getByRole("button", { name: "Previous card" });
const box = await arrow.boundingBox();
if (!box) {
  console.log(`${width}px FAIL: no arrow box`);
  problems.push(`${width}px: no arrow`);
  await page.close();
  continue;
}
const arrowX = Math.round(box.x + box.width / 2);
const arrowY = Math.round(box.y + box.height / 2);
const arrowRight = Math.round(box.x + box.width);

// The card container: the arrow's offset parent.
const cardBox = await page
  .locator("div.relative", { has: page.getByRole("button", { name: "Previous card" }) })
  .first()
  .boundingBox();
console.log(`
=== ${width}px ===`);
console.log(
  `arrow  x ${Math.round(box.x)}..${arrowRight}  (centre ${arrowX}, y ${arrowY})`,
);
console.log(
  `card   x ${Math.round(cardBox.x)}..${Math.round(cardBox.x + cardBox.width)}`,
);
const gap = Math.round(cardBox.x) - arrowRight;
console.log(`gap between arrow's right edge and card's left edge: ${gap}px\n`);

const opacity = () =>
  arrow.evaluate((el) => Number(getComputedStyle(el).opacity).toFixed(2));

// Start on the card, then walk left in 4px steps past the gap to the arrow.
await page.mouse.move(Math.round(cardBox.x) + 60, arrowY);
await page.waitForTimeout(400);
console.log(`on card (x=${Math.round(cardBox.x) + 60}): opacity ${await opacity()}`);

let minInGap = 1;
for (let x = Math.round(cardBox.x) + 2; x >= arrowX; x -= 4) {
  await page.mouse.move(x, arrowY);
  await page.waitForTimeout(110);
  const o = Number(await opacity());
  if (x < Math.round(cardBox.x) && x > arrowRight) minInGap = Math.min(minInGap, o);
}
console.log(`lowest opacity while crossing the gap: ${minInGap.toFixed(2)}`);

// The real test: can it be clicked from here?
await page.waitForTimeout(300);
const before = await page.locator("body").innerText();
const cardNo = /Card (\d+) of/.exec(before)?.[1];
try {
  await page.mouse.click(arrowX, arrowY);
  await page.waitForTimeout(700);
} catch {
  /* ignore */
}
const after = await page.locator("body").innerText();
const cardNoAfter = /Card (\d+) of/.exec(after)?.[1];
console.log(`\nclicked the arrow: card ${cardNo} -> ${cardNoAfter}`);
// Both defined *and* different. `undefined !== "2"` passed once at a width
// where the click had navigated away from the session entirely.
const ok = Boolean(cardNo) && Boolean(cardNoAfter) && cardNo !== cardNoAfter;
console.log(
  ok
    ? "PASS: the arrow was reachable and worked"
    : "FAIL: the click did nothing — the arrow was gone by the time it arrived",
);
if (!ok) problems.push(`${width}px: arrow unreachable`);
await page.close();
}

await browser.close();

if (problems.length) {
  console.log(`
${problems.length} problem(s):`);
  for (const p of problems) console.log(` - ${p}`);
  process.exit(1);
}
console.log("\nAll widths passed.");

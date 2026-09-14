/**
 * Does a track remember where you were?
 *
 * The model is two accounts belonging to one person: either is always there,
 * and going back to one finds it as you left it. A bank does not return you to
 * your oldest statement because you glanced at your other account.
 *
 * The store kept a single `activeMonthKey` and a single `selectedDay` shared
 * by both tracks, so a round trip lost your place: the key belonged to the
 * track you had just left, the guard rejected it, and you landed on month one
 * day one.
 *
 * Usage: `npm run dev`, then
 *   node scripts/drive/track-memory-smoke.mjs
 */
import { chromium } from "playwright-core";

const EXE =
  "C:/Users/HP/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe";
const URL = "http://localhost:1420/";

const problems = [];
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) problems.push(label);
};

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.addInitScript(() => {
  localStorage.setItem(
    "lexicon.settings.v1",
    JSON.stringify({ state: { hasOnboarded: true }, version: 0 }),
  );
});
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1600);

const state = () =>
  page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("lexicon.vocab.v1")).state;
    return { track: s.activeTrack, month: s.activeMonthKey, day: s.selectedDay };
  });

const switchTo = async (track) => {
  await page.getByRole("radio", { name: new RegExp(`^${track}`) }).first().click();
  await page.waitForTimeout(700);
};

const nextDay = async (times) => {
  for (let i = 0; i < times; i++) {
    await page.getByRole("button", { name: "Next day" }).first().click();
    await page.waitForTimeout(160);
  }
  await page.waitForTimeout(400);
};

// Put GRE somewhere specific: the second month, a day well into it.
await page.getByRole("button", { name: "Daily practice", exact: true }).first().click();
await page.waitForTimeout(800);
// A Radix select: a button plus a popup listbox, not a native <select>.
await page.getByRole("combobox").first().click();
await page.waitForTimeout(500);
const options = page.getByRole("option");
await options.nth(Math.min(1, (await options.count()) - 1)).click();
await page.waitForTimeout(700);
await nextDay(6);

const greBefore = await state();
console.log(`GRE left at:     ${greBefore.month} day ${greBefore.day}`);

await switchTo("SAT");
const satFirst = await state();
console.log(`SAT opened at:   ${satFirst.month} day ${satFirst.day}`);
check(satFirst.track === "sat", "switching changes the active track");
check(
  Boolean(satFirst.month?.startsWith("sat/")),
  "SAT opens on a SAT month",
  String(satFirst.month),
);

// Move SAT somewhere of its own, so the return trip has something to restore.
await nextDay(3);
const satBefore = await state();
console.log(`SAT left at:     ${satBefore.month} day ${satBefore.day}`);

await switchTo("GRE");
const greBack = await state();
console.log(`GRE returned to: ${greBack.month} day ${greBack.day}`);
check(
  greBack.month === greBefore.month,
  "returning to GRE restores its month",
  `${greBefore.month} -> ${greBack.month}`,
);
check(
  greBack.day === greBefore.day,
  "returning to GRE restores its day",
  `day ${greBefore.day} -> ${greBack.day}`,
);

await switchTo("SAT");
const satBack = await state();
console.log(`SAT returned to: ${satBack.month} day ${satBack.day}`);
check(
  satBack.month === satBefore.month,
  "returning to SAT restores its month",
  `${satBefore.month} -> ${satBack.month}`,
);
check(
  satBack.day === satBefore.day,
  "returning to SAT restores its day",
  `day ${satBefore.day} -> ${satBack.day}`,
);

await browser.close();

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(` - ${p}`);
  process.exit(1);
}
console.log("\nAll checks passed.");

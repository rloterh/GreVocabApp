/**
 * Are synonyms and antonyms shown where a word is read, and does the toggle
 * actually turn them off?
 *
 * They were in the corpus all along — 5,234 of 5,241 words carry synonyms —
 * and only the Daily Practice card rendered them. The flashcard back and the
 * search detail, which is where a word is actually studied, dropped them
 * silently. This checks all three, in both states of the setting.
 *
 * Usage: `npm run dev` in one terminal, then
 *   node scripts/drive/relations-smoke.mjs [outdir]
 */
import { chromium } from "playwright-core";

const EXE =
  "C:/Users/HP/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe";
const URL = "http://localhost:1420/";
const OUT = process.argv[2] ?? ".";

const SYN = "quiescent";
const ANT = "clamorous";

const word = (n) => ({
  id: `gre-word${n}`,
  word: `word${n}`,
  partOfSpeech: "adjective",
  definition: `The state of being word${n}.`,
  example: `A word${n} silence fell.`,
  mnemonic: `Sounds like word${n}.`,
  synonyms: [SYN, "still"],
  antonyms: [ANT],
});

const MONTHS = {
  "gre/01": {
    track: "gre",
    ordinal: 1,
    title: "An alphabet of essentials",
    days: [{ day: 1, words: [word(1), word(2), word(3)] }],
  },
};

const problems = [];
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) problems.push(label);
};

const browser = await chromium.launch({ executablePath: EXE });

async function open(showWordRelations) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(
    ({ months, show }) => {
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
        JSON.stringify({
          state: { hasOnboarded: true, showWordRelations: show },
          version: 0,
        }),
      );
    },
    { months: MONTHS, show: showWordRelations },
  );
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  return page;
}

/** Daily practice: reveal the first card. */
async function dailyPractice(page, shot) {
  await page.getByRole("button", { name: "Daily practice", exact: true }).first().click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /Click to reveal/ }).first().click();
  await page.waitForTimeout(600);
  if (shot) await page.screenshot({ path: `${OUT}/${shot}` });
  return page.locator("body").innerText();
}

/** Flashcards: start a session and flip to the back. */
async function flashcardBack(page, shot) {
  await page.getByRole("button", { name: "Flashcards", exact: true }).first().click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /^Start studying$/ }).first().click();
  await page.waitForTimeout(800);
  await page.keyboard.press("Space");
  await page.waitForTimeout(800);
  if (shot) await page.screenshot({ path: `${OUT}/${shot}` });
  return page.locator("body").innerText();
}

/** Search: open the detail dialog for a word. */
async function searchDetail(page, shot) {
  await page.getByRole("button", { name: "Search", exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.locator("input").first().fill("word1");
  await page.waitForTimeout(600);
  await page.getByText("word1", { exact: true }).first().click();
  await page.waitForTimeout(700);
  if (shot) await page.screenshot({ path: `${OUT}/${shot}` });
  return page.locator("body").innerText();
}

console.log("--- setting on (default) ---");
let page = await open(true);
let body = await dailyPractice(page, "on-daily-practice.png");
check(body.includes(SYN) && body.includes(ANT), "daily practice card shows both");
await page.close();

page = await open(true);
body = await flashcardBack(page, "on-flashcard-back.png");
check(body.includes(SYN) && body.includes(ANT), "flashcard back shows both");
await page.close();

page = await open(true);
body = await searchDetail(page, "on-search-detail.png");
check(body.includes(SYN) && body.includes(ANT), "search detail shows both");
await page.close();

console.log("--- setting off ---");
page = await open(false);
body = await dailyPractice(page, "off-daily-practice.png");
check(!body.includes(SYN) && !body.includes(ANT), "daily practice card hides both");
await page.close();

page = await open(false);
body = await flashcardBack(page, "off-flashcard-back.png");
check(!body.includes(SYN) && !body.includes(ANT), "flashcard back hides both");
await page.close();

page = await open(false);
body = await searchDetail(page, "off-search-detail.png");
check(!body.includes(SYN) && !body.includes(ANT), "search detail hides both");
await page.close();

await browser.close();

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(` - ${p}`);
  process.exit(1);
}
console.log("\nAll checks passed.");

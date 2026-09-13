/**
 * Does switching track refresh what the screens show?
 *
 * It did not. Eight memos called the store's `getAllMonths()` and listed
 * `months` as their only dependency — and `setActiveTrack` changes
 * `activeTrack`, `activeMonthKey` and `selectedDay`, never `months`. So React
 * had no reason to recompute, and Search, Progress, Exam, Archive and the rest
 * kept serving the notebook the user had just closed. The visible symptom:
 * searching a SAT word with SAT open reported "Nothing matched".
 *
 * `useAllMonths` subscribes to all three pieces, so the dependency is real and
 * the lint can see it. This guards that.
 *
 * Usage: `npm run dev` in one terminal, then
 *   node scripts/drive/track-switch-smoke.mjs
 */
import { chromium } from "playwright-core";

const EXE =
  "C:/Users/HP/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe";
const URL = "http://localhost:1420/";

/** A word that exists in exactly one track, so a hit is unambiguous. */
const SAT_ONLY = "zephyr";

const word = (track, w) => ({
  id: `${track}-${w}`,
  word: w,
  partOfSpeech: "verb",
  definition: `To ${w}.`,
  example: `They ${w} often.`,
  mnemonic: `Think of ${w}.`,
});
const month = (track, title, words) => ({
  track,
  ordinal: 1,
  title,
  days: words.map((w, i) => ({ day: i + 1, words: [w] })),
});

const MONTHS = {
  "gre/01": month("gre", "Gre One", [word("gre", "abate"), word("gre", "cogent")]),
  "sat/01": month("sat", "Sat One", [
    word("sat", SAT_ONLY),
    word("sat", "quixotic"),
  ]),
};

const problems = [];
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) problems.push(label);
};

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));

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
    JSON.stringify({ state: { hasOnboarded: true }, version: 0 }),
  );
}, MONTHS);

await page.goto(URL, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /^Search$/ }).first().click();
await page.waitForTimeout(800);

// `type="search"` is not a `textbox` to Playwright, and the field has no
// label, so address it as the one input on the page.
await page.locator("input").first().fill(SAT_ONLY);
await page.waitForTimeout(400);

let body = await page.locator("body").innerText();
check(
  /0 results/.test(body),
  "a SAT-only word is not found while GRE is open",
  body.match(/\d+ results?[^\n]*/)?.[0] ?? "",
);

// The switcher is a radiogroup; each radio's accessible name carries a
// description after the label.
await page.getByRole("radio", { name: /^SAT/ }).first().click();
await page.waitForTimeout(800);

body = await page.locator("body").innerText();
check(
  /1 result\b/.test(body) && new RegExp(SAT_ONLY, "i").test(body),
  "the same word is found once SAT is open",
  body.match(/\d+ results?[^\n]*/)?.[0] ?? "",
);

await browser.close();

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(` - ${p}`);
  process.exit(1);
}
console.log("\nAll checks passed.");

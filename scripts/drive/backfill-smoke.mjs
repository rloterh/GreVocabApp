/**
 * Does an old store pick up the synonyms the corpus has since gained?
 *
 * Enriching public/vocab/ reaches nobody's store, and the library will not
 * re-offer a month that is already loaded — so without a backfill a long-time
 * user sees no synonyms on exactly the months they use most, while a new user
 * sees them everywhere.
 *
 * Usage: `npm run dev`, then
 *   node scripts/drive/backfill-smoke.mjs
 */
import { chromium } from "playwright-core";
const EXE = "C:/Users/HP/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe";

// A month as it was stored before the enrichment: real corpus ids, old
// date-style title, no synonyms anywhere — plus one word the user added.
const stale = (ordinal, title, ids) => ({
  track: "gre", ordinal, title,
  days: [{ day: 1, words: ids.map((id) => ({
    id, word: id.replace("gre-", ""), partOfSpeech: "adjective",
    definition: "A definition.", example: "An example.", mnemonic: "A mnemonic.",
  })) }],
});

const VOCAB = { state: {
  months: {
    "gre/01": stale(1, "April 2026", ["gre-abstemious", "gre-capricious", "gre-mine-own"]),
    "gre/02": stale(2, "May 2026", ["gre-aplomb"]),
  },
  retiredWords: [], activeTrack: "gre", activeMonthKey: "gre/01", selectedDay: 1, schedules: {},
}, version: 2 };

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.addInitScript((v) => {
  localStorage.setItem("lexicon.vocab.v1", JSON.stringify(v));
  localStorage.setItem("lexicon.settings.v1", JSON.stringify({ state: { hasOnboarded: true, seededTracks: ["gre", "sat"] }, version: 0 }));
}, VOCAB);
await page.goto("http://localhost:1420/", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

const after = await page.evaluate(() => {
  const m = JSON.parse(localStorage.getItem("lexicon.vocab.v1")).state.months;
  const out = {};
  for (const [k, month] of Object.entries(m)) {
    const ws = month.days.flatMap((d) => d.words);
    out[k] = { ids: ws.map((w) => w.id), withSyn: ws.filter((w) => w.synonyms?.length).length, total: ws.length };
  }
  return out;
});

const problems = [];
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) problems.push(label);
};
check(after["gre/01"].withSyn >= 2, "corpus words gained synonyms", `${after["gre/01"].withSyn}/${after["gre/01"].total} in gre/01`);
check(after["gre/02"].withSyn >= 1, "the second month too", `${after["gre/02"].withSyn}/${after["gre/02"].total}`);
check(after["gre/01"].ids.includes("gre-mine-own"), "a user-added word survived");
check(after["gre/01"].ids.length === 3, "no words added or removed", `${after["gre/01"].ids.length}`);

await browser.close();
if (problems.length) { console.log(`\n${problems.length} problem(s)`); process.exit(1); }
console.log("\nAll checks passed.");

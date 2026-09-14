/**
 * Is the other track there before you switch to it?
 *
 * Seeding used to key off "the store is completely empty", so SAT was never
 * seeded for anybody — and could never be seeded for an *existing* user, whose
 * GRE months kept the store non-empty forever. Switching to SAT landed on an
 * empty notebook and a trip to the library.
 *
 * Two cases, because they fail differently:
 *
 *   fresh     nothing in storage at all
 *   existing  GRE months already loaded, no `seededTracks` — the shape every
 *             current user is in, and the one a naive fix still leaves broken
 *
 * Usage: `npm run dev`, then
 *   node scripts/drive/track-seed-smoke.mjs
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

const mk = (n) => ({
  id: `gre-legacy${n}`,
  word: `legacy${n}`,
  partOfSpeech: "adjective",
  definition: `Being legacy${n}.`,
  example: `A legacy${n} case.`,
  mnemonic: `Like legacy${n}.`,
});

/** An existing user: GRE loaded the old way, and no seededTracks. */
const EXISTING = {
  "gre/01": {
    track: "gre",
    ordinal: 1,
    title: "An alphabet of essentials",
    days: [{ day: 1, words: [mk(1), mk(2), mk(3)] }],
  },
};

const browser = await chromium.launch({ executablePath: EXE });

async function run(label, seed, arg) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  // `arg` is forwarded into the page. Forgetting it once made the "existing
  // user" fixture start with an empty store, which seeded both tracks and made
  // a broken case look like a passing one.
  if (seed) await page.addInitScript(seed, arg);
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);

  const counts = await page.evaluate(() => {
    const raw = localStorage.getItem("lexicon.vocab.v1");
    const months = raw ? JSON.parse(raw).state.months : {};
    const per = { gre: 0, sat: 0 };
    for (const m of Object.values(months)) per[m.track] = (per[m.track] ?? 0) + 1;
    const settings = JSON.parse(
      localStorage.getItem("lexicon.settings.v1") ?? "{}",
    );
    return {
      per,
      seededTracks: settings.state?.seededTracks ?? [],
      activeMonthKey: JSON.parse(raw).state.activeMonthKey,
    };
  });
  console.log(
    `--- ${label}: gre ${counts.per.gre} months, sat ${counts.per.sat} months, ` +
      `seeded [${counts.seededTracks}], active ${counts.activeMonthKey}`,
  );

  // The thing the user actually does: press SAT and expect words.
  await page.getByRole("radio", { name: /^SAT/ }).first().click();
  await page.waitForTimeout(700);
  const body = await page.locator("body").innerText();
  const empty = /no vocabulary|load vocabulary|nothing loaded|no month/i.test(body);
  return { counts, empty, page };
}

console.log("=== fresh install ===");
// No vocabulary at all, but past onboarding — otherwise its overlay covers the
// track switcher and the test measures the wrong thing.
let r = await run("fresh", () => {
  localStorage.setItem(
    "lexicon.settings.v1",
    JSON.stringify({ state: { hasOnboarded: true }, version: 0 }),
  );
});
check(r.counts.per.sat >= 2, "SAT is seeded on a fresh install", `${r.counts.per.sat} months`);
check(r.counts.per.gre >= 2, "GRE is seeded on a fresh install", `${r.counts.per.gre} months`);
check(!r.empty, "switching to SAT shows words immediately");
await r.page.close();

console.log("\n=== existing user: GRE already loaded, never seeded ===");
r = await run("existing", (months) => {
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
}, EXISTING);
check(r.counts.per.sat >= 2, "SAT is seeded for an existing user", `${r.counts.per.sat} months`);
check(r.counts.per.gre === 1, "their GRE months are left alone", `${r.counts.per.gre} month`);
check(
  r.counts.activeMonthKey === "gre/01",
  "the month they were on is not reset",
  String(r.counts.activeMonthKey),
);
check(!r.empty, "switching to SAT shows words immediately");
await r.page.close();

await browser.close();

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(` - ${p}`);
  process.exit(1);
}
console.log("\nAll checks passed.");

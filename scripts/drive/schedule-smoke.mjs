/**
 * Phase 14: the start-date screen and the reshuffling controls.
 *
 * The point of this driver is the property the whole redesign was for — a user
 * can change when they start, reorder the months, and redeal every word, and
 * their progress is exactly where it was. That is asserted here against the
 * running app rather than against a pure function, because the pure functions
 * were already green when the progress store was silently discarding records.
 *
 *   CHROME_EXE="<chrome.exe>" node scripts/drive/schedule-smoke.mjs [outDir]
 */

import { chromium } from "playwright-core";

const EXE =
  process.env.CHROME_EXE ??
  "C:/Users/HP/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe";
const URL = process.env.APP_URL ?? "http://localhost:1420/";
const OUT = process.argv[2] ?? process.env.OUT_DIR ?? ".";

const problems = [];
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) problems.push(label);
};

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });

page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
page.on("requestfailed", (r) =>
  console.log(`     (request failed: ${r.url().slice(0, 100)} — ${r.failure()?.errorText})`),
);
page.on("console", (m) => {
  if (m.type() !== "error") return;
  // Settings probes for a local AI server — Ollama, LM Studio, llama.cpp — and
  // on a machine running none of them every probe is refused. That is the
  // detection working, not the app breaking. Anything else the app logs counts.
  if (/ERR_CONNECTION_REFUSED|ERR_NETWORK_CHANGED/.test(m.text())) return;
  problems.push(`console error: ${m.text()}`);
});

const vocabState = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("lexicon.vocab.v1")).state);

// --- First run: the setup screen is the first thing shown -------------------

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

check(
  await page.getByText("When do you start?").isVisible(),
  "first run opens on the start question",
);
await page.screenshot({ path: `${OUT}/schedule-setup.png` });

// Pick a month rather than today, so the assertion cannot pass by accident.
await page.getByRole("radio", { name: /Pick a month/ }).click();
await page.locator("#start-month").fill("2027-03");
await page.getByRole("radio", { name: /As taught/ }).click();
await page.waitForTimeout(300);

const preview = await page.locator('[aria-live="polite"]').first().innerText();
check(/March 2027/.test(preview), "the preview names the chosen month", preview.slice(0, 90));

await page.getByRole("button", { name: "Next" }).click();
await page.waitForTimeout(400);

let state = await vocabState();
check(
  state.schedules?.gre?.startMonth === "2027-03",
  "the chosen start month is written",
  state.schedules?.gre?.startMonth,
);
check(
  state.schedules?.sat?.startMonth === "2027-03",
  "and to the other track, so it cannot silently start elsewhere",
  state.schedules?.sat?.startMonth,
);

// Out of the walkthrough.
for (const label of ["Next", "Next", "Next", "Start studying"]) {
  const button = page.getByRole("button", { name: label });
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    await page.waitForTimeout(200);
  }
}
await page.waitForTimeout(400);

// --- Give the user some progress to lose ------------------------------------

await page.evaluate(() => {
  const blob = JSON.parse(localStorage.getItem("lexicon.vocab.v1"));
  const ids = Object.values(blob.state.months)
    .flatMap((m) => m.days.flatMap((d) => d.words.map((w) => w.id)))
    .slice(0, 12);
  // Zustand only writes a blob once something changes it, so a fresh install
  // legitimately has none yet.
  const progress = JSON.parse(
    localStorage.getItem("lexicon.progress.v1") ??
      '{"state":{"words":{},"activity":{},"sentences":{},"quizzes":[],"exams":[],"studies":[],"activeExam":null,"lastExam":null},"version":2}',
  );
  progress.state.words = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        wordId: id,
        monthKey: "gre/01",
        mastered: true,
        timesReviewed: 3,
        quizAttempts: 0,
        quizCorrect: 0,
        lastReviewed: "2027-04-01",
        masteredAt: "2027-04-01",
        easeFactor: 2.4,
        intervalDays: 9,
        reps: 2,
        dueAt: "2027-04-10T00:00:00.000Z",
      },
    ]),
  );
  localStorage.setItem("lexicon.progress.v1", JSON.stringify(progress));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(800);

const masteredOnScreen = async () => {
  const text = await page.locator("body").innerText();
  const m = text.match(/Words mastered\s+(\d+)/i);
  return m ? Number(m[1]) : null;
};
const before = await masteredOnScreen();
check(before === 12, "the dashboard sees the progress", `${before}`);

// --- Settings: the three controls -------------------------------------------

await page.getByRole("button", { name: /^Settings/ }).first().click();
await page.waitForTimeout(600);
check(
  await page.getByRole("heading", { name: "Schedule" }).isVisible(),
  "Settings has a Schedule section",
);
await page.screenshot({ path: `${OUT}/schedule-settings.png` });

// Move the start date.
await page.locator("#schedule-start").fill("2028-01");
await page.waitForTimeout(400);
state = await vocabState();
check(
  state.schedules.gre.startMonth === "2028-01",
  "the start month can be moved afterwards",
  state.schedules.gre.startMonth,
);

// Shuffle the months — a permutation, so no word may move.
const wordsByMonth = async () =>
  page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("lexicon.vocab.v1")).state;
    return Object.fromEntries(
      Object.entries(s.months).map(([k, m]) => [
        k,
        m.days.flatMap((d) => d.words.map((w) => w.id)).join(","),
      ]),
    );
  });
const layoutBefore = await wordsByMonth();

await page.getByRole("radio", { name: /Shuffled/ }).click();
await page.waitForTimeout(400);
state = await vocabState();
// Not "the order changed": a seeded shuffle of two months lands on the
// identity permutation half the time, and a driver that fails on a coin toss
// is worse than no driver. That a shuffle *shuffles* is asserted over 36
// months in schedule.test.ts; what matters here is that the choice was
// recorded and that it moved no word.
check(
  state.schedules.gre.shuffleSeed !== null,
  "shuffling records the arrangement",
  `seed ${state.schedules.gre.shuffleSeed}`,
);
check(
  [...state.schedules.gre.order].sort((a, b) => a - b).join(",") === "1,2",
  "and keeps it a permutation — nothing gained, nothing lost",
  JSON.stringify(state.schedules.gre.order),
);
check(
  JSON.stringify(await wordsByMonth()) === JSON.stringify(layoutBefore),
  "shuffling months moves no word",
);

await page.getByRole("radio", { name: /As taught/ }).click();
await page.waitForTimeout(400);
state = await vocabState();
check(
  JSON.stringify(state.schedules.gre.order) === JSON.stringify([1, 2]) &&
    state.schedules.gre.shuffleSeed === null,
  "and it goes back",
  JSON.stringify(state.schedules.gre.order),
);

// Redistribute the words — content moves, ids and progress do not.
const idsOf = async () =>
  page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("lexicon.vocab.v1")).state;
    return Object.values(s.months)
      .flatMap((m) => m.days.flatMap((d) => d.words.map((w) => w.id)))
      .sort()
      .join(",");
  });
const idsBefore = await idsOf();

await page.getByRole("button", { name: /Reshuffle GRE words/ }).click();
await page.waitForTimeout(200);
await page.getByRole("button", { name: /Yes, reshuffle/ }).click();
await page.waitForTimeout(700);

check(
  JSON.stringify(await wordsByMonth()) !== JSON.stringify(layoutBefore),
  "redistributing actually moves words between months",
);
check((await idsOf()) === idsBefore, "every word id survives the redeal");

await page.getByRole("button", { name: /^Dashboard/ }).first().click();
await page.waitForTimeout(700);
const after = await masteredOnScreen();
check(
  after === before,
  "and every progress record with them — the point of the whole redesign",
  `${before} before, ${after} after`,
);

await page.screenshot({ path: `${OUT}/schedule-after-redeal.png` });

await browser.close();
console.log(
  `\n${problems.length === 0 ? "schedule smoke passed" : `${problems.length} problem(s)`}`,
);
for (const p of problems) console.log(`  - ${p}`);
process.exit(problems.length === 0 ? 0 : 1);

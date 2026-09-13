/**
 * Phase 13 smoke: seed a pre-tracks store, load the app, and check that the
 * migration kept everything and the track switcher works.
 */
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const EXE =
  "C:/Users/HP/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe";
const URL = "http://localhost:1420/";
const OUT = process.argv[2] ?? ".";

// A store exactly as a user of the shipped version would have: calendar keys,
// calendar-embedded word ids, and progress hanging off them.
const legacyWord = (m, w) => ({
  id: `${m}-${w}`,
  word: w,
  partOfSpeech: "verb",
  definition: `To ${w}.`,
  example: `They ${w} often.`,
  mnemonic: `Think of ${w}.`,
});
const legacyMonth = (m, words) => ({
  month: m,
  displayName: m,
  days: words.map((w, i) => ({ day: i + 1, words: [legacyWord(m, w)] })),
});

const MONTHS = {
  "2026-04": legacyMonth("2026-04", ["abate", "cogent", "ephemeral"]),
  "2026-05": legacyMonth("2026-05", ["laconic", "obdurate"]),
};
const IDS = Object.values(MONTHS).flatMap((m) =>
  m.days.flatMap((d) => d.words.map((w) => w.id)),
);
const IDS_COUNT = IDS.length;

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const problems = [];
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) problems.push(label);
};

page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console error: ${m.text()}`);
});

// Seed legacy state before any app code runs.
// Seeded once, not on every navigation. `addInitScript` runs on every page
// load including reloads, and an earlier version of this driver re-wrote the
// pre-migration blob on each one — quietly undoing everything the test had
// just set up and making a fixed bug look unfixed.
await page.addInitScript(
  ({ months, ids }) => {
    if (localStorage.getItem("lexicon.vocab.v1")) return;
    localStorage.setItem(
      "lexicon.vocab.v1",
      JSON.stringify({
        state: {
          months,
          retiredWords: [],
          activeMonthKey: "2026-04",
          selectedDay: 1,
        },
        version: 0,
      }),
    );
    localStorage.setItem(
      "lexicon.progress.v1",
      JSON.stringify({
        state: {
          words: Object.fromEntries(
            ids.map((id) => [
              id,
              {
                wordId: id,
                monthKey: "2026-04",
                mastered: true,
                timesReviewed: 3,
                quizAttempts: 1,
                quizCorrect: 1,
                lastReviewed: "2026-08-01",
                masteredAt: "2026-08-01",
                easeFactor: 2.5,
                intervalDays: 10,
                reps: 2,
                dueAt: "2026-08-11T00:00:00.000Z",
              },
            ]),
          ),
          activity: {},
          sentences: {},
          quizzes: [],
          exams: [],
          studies: [],
          activeExam: null,
          lastExam: null,
        },
        version: 0,
      }),
    );
    localStorage.setItem(
      "lexicon.settings.v1",
      JSON.stringify({ state: { hasOnboarded: true, theme: "dark" }, version: 0 }),
    );
  },
  { months: MONTHS, ids: IDS },
);

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

// --- The migration ----------------------------------------------------------
const vocab = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("lexicon.vocab.v1")).state,
);
const progress = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("lexicon.progress.v1")).state,
);

check(
  Object.keys(vocab.months).sort().join(",") === "gre/01,gre/02",
  "months are keyed by track and position",
  Object.keys(vocab.months).join(","),
);
check(vocab.activeTrack === "gre", "active track is set", vocab.activeTrack);
check(
  vocab.schedules?.gre?.startMonth === "2026-04",
  "the schedule starts where the user did",
  vocab.schedules?.gre?.startMonth,
);
check(
  Object.keys(progress.words).sort().join(",") ===
    "gre-abate,gre-cogent,gre-ephemeral,gre-laconic,gre-obdurate",
  "every progress record moved with its word",
  Object.keys(progress.words).join(","),
);
check(
  Object.values(progress.words).every((w) => w.easeFactor === 2.5 && w.reps === 2),
  "scheduling state survived intact",
);
const known = new Set(
  Object.values(vocab.months).flatMap((m) =>
    m.days.flatMap((d) => d.words.map((w) => w.id)),
  ),
);
check(
  Object.keys(progress.words).every((id) => known.has(id)),
  "no progress record is orphaned",
);
check(
  !JSON.stringify(vocab.months).match(/"id":"\d{4}-\d{2}-/),
  "no word id still contains a date",
);

// Reading localStorage is not enough. Zustand will happily *discard* a blob
// whose version it does not recognise, leaving storage correct and the running
// app empty — so the mastered count has to come from what is on screen.
const mastered = await page.evaluate(() => {
  const text = document.body.innerText;
  const m = text.match(/Words mastered\s+(\d+)/i);
  return m ? Number(m[1]) : null;
});
check(
  mastered === IDS_COUNT,
  "the running app still counts every mastered word",
  `dashboard says ${mastered}, expected ${IDS_COUNT}`,
);

// --- The switcher -----------------------------------------------------------
const gre = page.getByRole("radio", { name: /^GRE/ });
const sat = page.getByRole("radio", { name: /^SAT/ });
check(await gre.isVisible(), "the track switcher is on screen");
check((await gre.getAttribute("aria-checked")) === "true", "GRE reads as active");

await sat.click();
await page.waitForTimeout(600);
check((await sat.getAttribute("aria-checked")) === "true", "switching selects SAT");

// The other notebook must report its own numbers, not the open one's.
// Progress records all live in one store and are track-scoped only by their
// id, so a dashboard that aggregates them shows a user who has never opened
// SAT their GRE mastery under an SAT heading. Giving SAT a month here is what
// makes the check real: with no months the dashboard renders an empty state
// and the assertion would pass without ever exercising the filter.
await page.evaluate(() => {
  const blob = JSON.parse(localStorage.getItem("lexicon.vocab.v1"));
  // Stated rather than inherited. Reading this blob after clicking the
  // switcher is a read-modify-write against a store that may not have flushed
  // yet, and an earlier version of this driver wrote the pre-click track back
  // over the click.
  blob.state.activeTrack = "sat";
  blob.state.months["sat/01"] = {
    track: "sat",
    ordinal: 1,
    title: "A borrowed month",
    days: [
      {
        day: 1,
        words: [
          {
            id: "sat-placid",
            word: "placid",
            partOfSpeech: "adjective",
            definition: "Calm and untroubled.",
            example: "The lake was placid at dawn.",
            mnemonic: "Placid sounds like placate.",
          },
        ],
      },
    ],
  };
  localStorage.setItem("lexicon.vocab.v1", JSON.stringify(blob));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(900);

const readMastered = () =>
  page.evaluate(() => {
    const m = document.body.innerText.match(
      new RegExp("Words mastered\\s+(\\d+)\\s+of (\\d+)", "i"),
    );
    return m ? { mastered: Number(m[1]), total: Number(m[2]) } : null;
  });

const satStats = await readMastered();
check(
  satStats !== null && satStats.mastered === 0 && satStats.total === 1,
  "an empty track reports its own numbers, not the other one's",
  satStats ? `SAT says ${satStats.mastered} of ${satStats.total}` : "no stats shown",
);

await gre.click();
await page.waitForTimeout(700);
const greStats = await readMastered();
check(
  greStats !== null && greStats.mastered === 5,
  "and switching back finds GRE exactly as it was",
  greStats ? `GRE says ${greStats.mastered} of ${greStats.total}` : "no stats shown",
);
await sat.click();
await page.waitForTimeout(500);

const afterSwitch = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("lexicon.vocab.v1")).state.activeTrack,
);
check(afterSwitch === "sat", "the switch is remembered", afterSwitch);

await page.screenshot({ path: `${OUT}/phase13-sat-empty.png` });

await gre.click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/phase13-desktop.png` });

// --- Archive still shows the user's months ----------------------------------
await page.getByRole("button", { name: /Archive/ }).first().click();
await page.waitForTimeout(600);
const archiveText = await page.locator("main").innerText();
check(/April|2026-04/i.test(archiveText), "the archive still names the user's months");
await page.screenshot({ path: `${OUT}/phase13-archive.png`, fullPage: false });

// --- Tablet, fullscreen -----------------------------------------------------
for (const [label, width, height] of [
  ["ipad-portrait", 834, 1194],
  ["ipad-landscape", 1194, 834],
  ["phone", 390, 844],
]) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  check(overflow <= 0, `${label}: no horizontal overflow`, `${overflow}px`);
  const switcher = await page
    .getByRole("radio", { name: /^GRE/ })
    .first()
    .isVisible();
  check(switcher, `${label}: the track is still legible`);
  await page.screenshot({ path: `${OUT}/phase13-${label}.png` });
}

await browser.close();

writeFileSync(`${OUT}/phase13-problems.txt`, problems.join("\n"));
console.log(
  `\n${problems.length === 0 ? "phase 13 smoke passed" : `${problems.length} problem(s)`}`,
);
process.exit(problems.length === 0 ? 0 : 1);

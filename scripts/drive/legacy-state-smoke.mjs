/**
 * Does the app still work for someone carrying old state?
 *
 * Every page here rendered fine with freshly seeded data and blanked the whole
 * window for a user whose tracks had no stored schedule — which is anyone whose
 * store predates schedules existing. `getSchedule()` synthesises a schedule
 * when none is stored, so used as a zustand selector it returned a new object
 * every render; zustand saw a changed snapshot each time and re-rendered
 * forever, and React ended it with "Maximum update depth exceeded". With no
 * error boundary at the time, the result was an empty window with a title bar.
 *
 * Settings and Archive both went down that way. This drives every page against
 * state shaped like the real thing — month titles from before tracks, a quiz
 * pool value since renamed, and none of the fields added later.
 *
 * Usage: `npm run dev`, then
 *   node scripts/drive/legacy-state-smoke.mjs
 */
import { chromium } from "playwright-core";

const EXE =
  "C:/Users/HP/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe";
const URL = "http://localhost:1420/";

/** Every destination in the sidebar. */
const PAGES = [
  "Dashboard",
  "Daily practice",
  "Flashcards",
  "Quiz",
  "Exam",
  "Sentences",
  "Calendar",
  "Archive",
  "Progress",
  "Search",
  "Settings",
];

const word = (id, w) => ({
  id,
  word: w,
  partOfSpeech: "verb",
  definition: `To ${w}.`,
  example: `They ${w}.`,
  mnemonic: `Like ${w}.`,
});

/**
 * Shaped like state recovered from a real desktop install: months titled by
 * calendar date (how they were named before tracks), `lastQuizPool` set to a
 * value the current build no longer offers, **no `schedules`**, and none of
 * `seededTracks`, `showWordRelations` or `trackPositions`.
 */
const VOCAB = {
  state: {
    months: {
      "gre/01": {
        track: "gre",
        ordinal: 1,
        title: "April 2026",
        days: [{ day: 1, words: [word("gre-abate", "abate")] }],
      },
      "gre/02": {
        track: "gre",
        ordinal: 2,
        title: "May 2026",
        days: [{ day: 1, words: [word("gre-gauche", "gauche")] }],
      },
    },
    retiredWords: [],
    activeTrack: "gre",
    activeMonthKey: "gre/01",
    selectedDay: 1,
    schedules: {},
  },
  version: 2,
};

const SETTINGS = {
  state: {
    theme: "dark",
    dataDirectory: null,
    anthropicApiKey: null,
    preferApiVerification: true,
    reduceMotion: false,
    wordOrder: "authored",
    lastQuizPool: "month",
    lastQuizCount: 10,
    fontSize: "md",
    hasSeenSrsIntro: false,
    studyReminderEnabled: false,
    studyReminderTime: "19:00",
    lastReminderDate: null,
    watchedFolder: null,
    hasOnboarded: true,
    soundEnabled: false,
    speechVoice: null,
    speechRate: 0.9,
    autoPronounce: false,
    enabledAiTools: [],
    pinnedProvider: null,
  },
  version: 0,
};

const problems = [];
const browser = await chromium.launch({ executablePath: EXE });

for (const nav of PAGES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    const t = m.text();
    // Local AI providers are probed on Settings and are not running here.
    if (m.type() === "error" && !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(t)) {
      errors.push(t.slice(0, 200));
    }
  });

  await page.addInitScript(
    ({ v, s }) => {
      localStorage.setItem("lexicon.vocab.v1", JSON.stringify(v));
      localStorage.setItem("lexicon.settings.v1", JSON.stringify(s));
    },
    { v: VOCAB, s: SETTINGS },
  );
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: nav, exact: true }).first().click();
  await page.waitForTimeout(1800);

  const body = await page.locator("body").innerText();
  // The error boundary's own copy. Its presence means the page threw.
  const crashed = /ran into a problem/.test(body);
  const loop = errors.some((e) => /Maximum update depth/.test(e));
  const ok = !crashed && !loop;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${nav.padEnd(15)}` +
      (ok ? "" : ` — ${loop ? "infinite render loop" : "threw"}`),
  );
  if (!ok) problems.push(nav);
  await page.close();
}

await browser.close();

if (problems.length) {
  console.log(`\n${problems.length} page(s) broken on legacy state: ${problems.join(", ")}`);
  process.exit(1);
}
console.log("\nEvery page survives legacy state.");

/**
 * The screenshots in the README.
 *
 * Committed because the responsive shell has three shapes now and a picture of
 * two of them is a picture of an app that no longer exists — the tablet shot
 * showed a bottom tab bar for a week after the rail replaced it.
 *
 * Each viewport is one of the three shells, seeded with enough real data that
 * the dashboard has something to say.
 *
 *   CHROME_EXE="<chrome.exe>" node scripts/drive/screenshots.mjs [outDir]
 */

import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const EXE =
  process.env.CHROME_EXE ??
  "C:/Users/HP/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe";
const URL = process.env.APP_URL ?? "http://localhost:1420/";
const OUT = process.argv[2] ?? process.env.OUT_DIR ?? "docs/screenshots";

const SHOTS = [
  { name: "mobile", width: 390, height: 844, shell: "tab bar" },
  { name: "tablet", width: 834, height: 1100, shell: "rail" },
  { name: "desktop", width: 1280, height: 900, shell: "sidebar" },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE });

for (const shot of SHOTS) {
  const page = await browser.newPage({
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: 2,
    isMobile: shot.width < 1024,
    hasTouch: shot.width < 1024,
  });

  // A dashboard with zeros everywhere is a screenshot of an empty app. Enough
  // progress to make the numbers real, and no onboarding dialog over the top.
  await page.addInitScript(() => {
    if (localStorage.getItem("lexicon.settings.v1")) return;
    localStorage.setItem(
      "lexicon.settings.v1",
      JSON.stringify({
        state: { theme: "dark", hasOnboarded: true, hasSeenSrsIntro: true },
        version: 0,
      }),
    );
  });

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    const vocab = JSON.parse(localStorage.getItem("lexicon.vocab.v1"));
    const ids = Object.values(vocab.state.months)
      .flatMap((m) => m.days.flatMap((d) => d.words.map((w) => w.id)))
      .slice(0, 47);
    const today = new Date();
    const dateKey = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
    const activity = {};
    // A run of days, so the heatmap and the streak are not both zero.
    for (let i = 0; i < 23; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      activity[dateKey(d)] = {
        date: dateKey(d),
        wordsReviewed: 3 + (i % 4),
        wordsMastered: i % 3 === 0 ? 2 : 1,
        quizzesTaken: i % 5 === 0 ? 1 : 0,
        sentencesWritten: i % 4 === 0 ? 2 : 0,
      };
    }
    localStorage.setItem(
      "lexicon.progress.v1",
      JSON.stringify({
        state: {
          words: Object.fromEntries(
            ids.map((id, i) => [
              id,
              {
                wordId: id,
                monthKey: "gre/01",
                mastered: i % 3 !== 0,
                timesReviewed: 2 + (i % 5),
                quizAttempts: 3,
                quizCorrect: i % 4 === 0 ? 2 : 3,
                lastReviewed: dateKey(today),
                masteredAt: i % 3 !== 0 ? dateKey(today) : null,
                easeFactor: 2.5,
                intervalDays: 6,
                reps: 2,
                dueAt: new Date(Date.now() - 86400000).toISOString(),
              },
            ]),
          ),
          activity,
          sentences: {},
          quizzes: [],
          exams: [],
          studies: [],
          activeExam: null,
          lastExam: null,
        },
        version: 2,
      }),
    );
  });

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  // Settle the entry animation, or the shot catches the page mid-fade.
  await page
    .waitForFunction(
      () => document.getAnimations().every((a) => a.playState !== "running"),
      { timeout: 3000 },
    )
    .catch(() => {});

  await page.screenshot({ path: `${OUT}/${shot.name}.png` });
  console.log(`${OUT}/${shot.name}.png — ${shot.width}x${shot.height}, ${shot.shell}`);
  await page.close();
}

await browser.close();

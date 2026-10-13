/**
 * Play real rounds of a game, in a real browser.
 *
 * What the unit suite cannot see: a timer that has to keep honest time while
 * the page is hidden, a pause that has to hide the question, a best that has
 * to survive a reload, and — the rule the whole section rests on — a round
 * that must not touch anybody's progress. docs/GAMES.md §11.3.
 *
 * Usage: `npm run dev`, then
 *   node scripts/drive/games-smoke.mjs
 */
import { chromium } from "playwright-core";

const EXE =
  process.env.CHROME_EXE ??
  "C:/Users/HP/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe";
const URL = process.env.LEXICON_URL ?? "http://localhost:1420/";

const problems = [];
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) problems.push(label);
};

const browser = await chromium.launch({ executablePath: EXE });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.addInitScript(() => {
  // Real progress to protect: a mastered word, and a studied one that is due.
  // Against an empty store, "a round changed nothing" would prove nothing.
  if (!localStorage.getItem("lexicon.progress.v1")) {
    const record = (id, mastered, dueAt) => ({
      wordId: id, monthKey: "gre/01", mastered, timesReviewed: 3, quizAttempts: 1, quizCorrect: 1,
      lastReviewed: "2026-10-01T00:00:00.000Z", masteredAt: mastered ? "2026-10-01T00:00:00.000Z" : null,
      easeFactor: 2.5, intervalDays: 6, reps: 2, dueAt,
    });
    localStorage.setItem(
      "lexicon.progress.v1",
      JSON.stringify({
        state: {
          words: {
            "gre-obviate": record("gre-obviate", true, "2030-01-01T00:00:00.000Z"),
            "gre-lugubrious": record("gre-lugubrious", false, "2026-01-01T00:00:00.000Z"),
          },
          activity: {}, sentences: {}, quizzes: [], activeExam: null, exams: [], lastExam: null, studies: [],
        },
        version: 2,
      }),
    );
  }
  if (!localStorage.getItem("lexicon.settings.v1")) {
    localStorage.setItem(
      "lexicon.settings.v1",
      JSON.stringify({ state: { hasOnboarded: true, reduceMotion: false }, version: 0 }),
    );
  }
});
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

const progressWords = () =>
  page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("lexicon.progress.v1") ?? "{}").state?.words ?? {}));
const dashboardText = async () => {
  await page.getByRole("button", { name: "Dashboard", exact: true }).first().click();
  await page.waitForTimeout(900);
  // The stat cards: whatever numbers the user reads about their progress.
  return (await page.locator("main").innerText()).replace(/\s+/g, " ");
};

// ── Track names ────────────────────────────────────────────────────────────
check(await page.getByRole("radio", { name: /^Advanced/ }).first().isVisible(), "the switcher says Advanced");
check(await page.getByRole("radio", { name: /^Easy/ }).first().isVisible(), "the switcher says Easy");
const bodyText = await page.locator("body").innerText();
check(!/\b(GRE|SAT)\b/.test(bodyText), "no GRE or SAT on the dashboard");

const wordsBefore = await progressWords();
const dashBefore = await dashboardText();

// ── Hub and rules ──────────────────────────────────────────────────────────
await page.getByRole("button", { name: "Games", exact: true }).first().click();
await page.waitForTimeout(900);
check(await page.getByText("Closest Meaning").first().isVisible(), "the hub shows Closest Meaning");
await page.getByRole("button", { name: "Standard", exact: true }).first().click();
const play = page.getByRole("button", { name: "Play", exact: true });
await play.waitFor({ state: "visible" });
await page.waitForFunction(
  () => [...document.querySelectorAll("button")].some((b) => b.textContent === "Play" && !b.disabled),
  null,
  { timeout: 15000 },
);
check(true, "the rules card loads the tier's words and enables Play");
await play.click();
await page.getByTestId("game-stage").waitFor();

const stage = page.getByTestId("game-stage");
const options = stage.getByRole("radio").filter({ hasNot: page.locator("[aria-label]") });
const waitForQuestion = async () => {
  await page.waitForFunction(
    () => {
      const s = document.querySelector('[data-testid="game-stage"]');
      const opts = s ? [...s.querySelectorAll('[role="radiogroup"] button[role="radio"]')] : [];
      return opts.length === 4 && opts.every((b) => !b.disabled);
    },
    null,
    { timeout: 8000 },
  );
};
const secondsLeft = async () => {
  const t = await stage.locator("p.tabular").filter({ hasText: /^:\d\d$/ }).first().innerText();
  return Number(t.slice(1));
};

// Q1: answer straight away.
await waitForQuestion();
await page.keyboard.press("1");
await page.waitForTimeout(1300);

// Q2: pause, wait, resume — the clock must not have moved while paused.
await waitForQuestion();
await page.waitForTimeout(1200);
const beforePause = await secondsLeft();
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
check(await stage.getByText("Paused", { exact: true }).isVisible(), "Escape pauses");
check(
  (await stage.locator("h2").count()) === 0,
  "the question is hidden while paused",
);
await page.waitForTimeout(4000);
await stage.getByRole("button", { name: "Resume" }).click();
await page.waitForTimeout(300);
const afterResume = await secondsLeft();
check(afterResume >= beforePause - 1, "four paused seconds cost no time", `${beforePause}s → ${afterResume}s`);
await page.keyboard.press("2");
await page.waitForTimeout(1300);

// Q3: hide the page — a backgrounded app must pause, not run down the clock.
await waitForQuestion();
await page.evaluate(() => {
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
});
await page.waitForTimeout(300);
check(await stage.getByText("Paused", { exact: true }).isVisible(), "hiding the page pauses the round");
await page.evaluate(() => {
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});
await stage.getByRole("button", { name: "Resume" }).click();
await page.keyboard.press("3");
await page.waitForTimeout(1300);

// Q4: let the time run out.
await waitForQuestion();
await page.waitForTimeout(10_800);
check(await stage.getByText("Time's up").first().isVisible(), "running out of time is a time-out");
await page.waitForTimeout(1200);

// Global shortcuts stand down mid-round.
await waitForQuestion();
await page.keyboard.press("g");
await page.keyboard.press("d");
await page.waitForTimeout(300);
check(await stage.isVisible(), "g d does not leave a round in progress");

// Q5–Q10.
for (let i = 5; i <= 10; i++) {
  await waitForQuestion();
  await page.keyboard.press(String(((i - 1) % 4) + 1));
  await page.waitForTimeout(1250);
}

await page.getByTestId("best-line").waitFor({ timeout: 8000 });
const bestLine = await page.getByTestId("best-line").innerText();
check(/First round on Standard/.test(bestLine), "a first round is not called a new best", bestLine);
const scoreText = await page.locator("p.tabular").filter({ hasText: /pts/ }).first().innerText();
await page.waitForTimeout(1200);
const score = Number((await page.locator("p.tabular").filter({ hasText: /pts/ }).first().innerText()).replace(/[^\d]/g, ""));
console.log(`     round scored ${score} (${scoreText.trim()} mid-count)`);

await page.getByRole("button", { name: "Review answers" }).click();
await page.waitForTimeout(500);
check((await page.getByRole("list", { name: "Your answers" }).locator("li").count()) === 10, "review lists all ten questions");
check(await page.getByText("Time's up").first().isVisible(), "review shows the time-out");

// ── Nothing touched progress ───────────────────────────────────────────────
check((await progressWords()) === wordsBefore, "a round wrote no word progress");
const dashAfter = await dashboardText();
// Read the numbers a user reads. The streak is allowed to move — a finished
// round counts as activity (ADR 0016) — so it is checked separately.
const stat = (t, label) => (t.match(new RegExp(`${label}\\s+([\\d,%]+)`, "i")) ?? [])[1] ?? null;
for (const label of ["Words mastered", "Quiz accuracy"]) {
  const before = stat(dashBefore, label);
  check(before !== null && stat(dashAfter, label) === before, `${label} is unchanged by a round`, `${before} → ${stat(dashAfter, label)}`);
}
const due = (t) => (t.match(/(\d+)\s+(?:words?|cards?)\s+(?:are\s+|is\s+)?due/i) ?? [])[1] ?? null;
check(due(dashBefore) !== null && due(dashAfter) === due(dashBefore), "the due count is unchanged by a round", `${due(dashBefore)} → ${due(dashAfter)}`);
check(Number(stat(dashAfter, "Current streak")) >= 1, "the round started today's streak", stat(dashAfter, "Current streak"));

// ── The best survives a reload ─────────────────────────────────────────────
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Games", exact: true }).first().click();
await page.waitForTimeout(900);
const hub = await page.locator("main").innerText();
check(
  hub.includes(`Best ${score.toLocaleString("en-US")}`),
  "the best is on the hub after a reload",
  (hub.match(/Best [\d,]+[^\n]*/) ?? ["(none)"])[0],
);
const streak = await page.evaluate(() => {
  const a = JSON.parse(localStorage.getItem("lexicon.progress.v1")).state.activity;
  return Object.values(a).some((d) => (d.gamesPlayed ?? 0) > 0);
});
check(streak, "the round counted as today's activity");

// ── Every other game: one full round each ──────────────────────────────────
// Each game has its own stage: two wide buttons and an explanation that waits
// for Continue (Fact or Fiction), a sentence with a gap (Fill the Gap), a
// planted trap (Opposites). A round of each must reach its results.
for (const name of ["Fact or Fiction", "Opposites", "Fill the Gap"]) {
  await page.getByRole("button", { name: "Games", exact: true }).first().click();
  await page.waitForTimeout(700);
  await page.locator("section").filter({ hasText: name }).getByRole("button", { name: "Warm-up", exact: true }).click();
  await page.waitForFunction(
    () => [...document.querySelectorAll("button")].some((b) => b.textContent === "Play" && !b.disabled),
    null,
    { timeout: 15000 },
  );
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByTestId("game-stage").waitFor();
  let sawGap = false;
  let sawContinue = false;
  for (let i = 0; i < 10; i++) {
    await page.waitForFunction(
      () => {
        const o = [...document.querySelectorAll('[data-testid="game-stage"] [role="radiogroup"] button')];
        return o.length >= 2 && o.every((b) => !b.disabled);
      },
      null,
      { timeout: 8000 },
    );
    if (name === "Fill the Gap") {
      const h2 = await stage.locator("h2").innerText();
      sawGap ||= h2.includes("blank") || (await stage.locator("h2 .border-b-2").count()) > 0;
    }
    await page.keyboard.press(String((i % 2) + 1));
    await page.waitForTimeout(400);
    if (name === "Fact or Fiction") {
      const cont = stage.getByRole("button", { name: "Continue" });
      // The explanation must wait: it is still there after the auto-advance
      // delay every other game uses.
      await page.waitForTimeout(1100);
      sawContinue ||= await cont.isVisible();
      await cont.click();
    } else {
      await page.waitForTimeout(900);
    }
  }
  await page.getByTestId("best-line").waitFor({ timeout: 8000 });
  check(true, `${name}: a full round reaches its results`);
  if (name === "Fill the Gap") check(sawGap, "Fill the Gap shows a gap, not the word");
  if (name === "Fact or Fiction") check(sawContinue, "Fact or Fiction's explanation waits for Continue");
  await page.getByRole("button", { name: "Review answers" }).click();
  await page.waitForTimeout(400);
  check(
    (await page.getByRole("list", { name: "Your answers" }).locator("li").count()) === 10,
    `${name}: review lists all ten`,
  );
}
check((await progressWords()) === wordsBefore, "four games later, still no word progress written");

// ── Phone ──────────────────────────────────────────────────────────────────
const phone = await browser.newContext({ viewport: { width: 360, height: 760 }, hasTouch: true, isMobile: true });
const p2 = await phone.newPage();
await p2.addInitScript(() =>
  localStorage.setItem("lexicon.settings.v1", JSON.stringify({ state: { hasOnboarded: true }, version: 0 })),
);
await p2.goto(URL, { waitUntil: "networkidle" });
await p2.waitForTimeout(1500);
const tab = p2.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Games" });
check(await tab.isVisible(), "Games has a tab on a phone");
await tab.click();
await p2.waitForTimeout(900);
const overflow = () => p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check((await overflow()) <= 0, "the hub does not scroll sideways at 360px");
await p2.getByRole("button", { name: "Warm-up", exact: true }).first().click();
await p2.waitForFunction(
  () => [...document.querySelectorAll("button")].some((b) => b.textContent === "Play" && !b.disabled),
  null,
  { timeout: 15000 },
);
await p2.getByRole("button", { name: "Play", exact: true }).click();
await p2.getByTestId("game-stage").waitFor();
await p2.waitForTimeout(800);
check((await overflow()) <= 0, "the stage does not scroll sideways at 360px");
const heights = await p2.evaluate(() =>
  [...document.querySelectorAll('[data-testid="game-stage"] [role="radiogroup"] button')].map(
    (b) => b.getBoundingClientRect().height,
  ),
);
check(heights.length === 4 && heights.every((h) => h >= 44), "options are at least 44px tall", heights.map(Math.round).join(","));
const covered = await p2.evaluate(() => {
  const bar = document.querySelector('nav[aria-label="Main"]');
  if (!bar) return true;
  const r = bar.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return Boolean(top?.closest('[data-testid="game-stage"]'));
});
check(covered, "the tab bar cannot be tapped mid-round");

check(errors.length === 0, "no uncaught errors", errors.join(" | "));

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s).` : "\nAll clear.");
process.exit(problems.length ? 1 : 0);

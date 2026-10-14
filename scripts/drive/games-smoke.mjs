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

// ── Phase 21: Odd One Out, Match Up, Spell It ─────────────────────────────
const toHub = async () => {
  await page.getByRole("button", { name: "Games", exact: true }).first().click();
  await page.waitForTimeout(700);
};
const startGame = async (name, tier = "Standard") => {
  await toHub();
  await page.locator("section").filter({ hasText: name }).getByRole("button", { name: tier, exact: true }).click();
  await page.waitForFunction(
    () => [...document.querySelectorAll("button")].some((b) => b.textContent === "Play" && !b.disabled),
    null,
    { timeout: 15000 },
  );
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByTestId("game-stage").waitFor();
};

// Odd One Out: the question is shown, never the headword alone.
await startGame("Odd One Out");
for (let i = 0; i < 10; i++) {
  await page.waitForFunction(
    () => [...document.querySelectorAll('[data-testid="game-stage"] [role="radiogroup"] button')].some((b) => !b.disabled),
    null,
    { timeout: 8000 },
  );
  if (i === 0) {
    check(/doesn.t belong/i.test(await stage.locator("h2").innerText()), "Odd One Out asks which doesn't belong");
  }
  await page.keyboard.press("1");
  await page.waitForTimeout(1300);
}
await page.getByTestId("best-line").waitFor({ timeout: 8000 });
check(true, "Odd One Out: a full round reaches its results");

// Match Up: three boards; a wrong pairing costs time, a right one locks in.
await startGame("Match Up");
for (let b = 0; b < 3; b++) {
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="game-stage"] [role="group"][aria-label="Words"] button:not([disabled])').length === 5,
    null,
    { timeout: 8000 },
  );
  const ids = await stage
    .locator('[role="group"][aria-label="Words"] button')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-pair")));
  if (b === 0) {
    const before = Number((await stage.locator("p.tabular").filter({ hasText: /^:\d\d$/ }).first().innerText()).slice(1));
    await stage.locator(`[aria-label="Words"] [data-pair="${ids[0]}"]`).click();
    await stage.locator(`[aria-label="Meanings"] [data-pair="${ids[1]}"]`).click();
    await page.waitForTimeout(600);
    const after = Number((await stage.locator("p.tabular").filter({ hasText: /^:\d\d$/ }).first().innerText()).slice(1));
    check(before - after >= 2, "a wrong pair costs two seconds", `${before}s → ${after}s`);
    check(/0 of 5/.test(await stage.innerText()), "and pairs nothing");
  }
  for (const id of ids) {
    await stage.locator(`[aria-label="Words"] [data-pair="${id}"]`).click();
    await stage.locator(`[aria-label="Meanings"] [data-pair="${id}"]`).click();
    await page.waitForTimeout(120);
  }
  await stage.getByRole("button", { name: "Continue" }).waitFor({ timeout: 5000 });
  if (b === 0) check(/All paired/.test(await stage.innerText()), "a finished board says so");
  await stage.getByRole("button", { name: "Continue" }).click();
}
await page.getByTestId("best-line").waitFor({ timeout: 8000 });
check(/of 15/.test(await page.locator("main").innerText()), "Match Up counts pairs: x of 15");

// Spell It: autocorrect off, a wrong spelling is shown corrected.
await startGame("Spell It");
const field = stage.locator("#spell-input");
await field.waitFor();
const attrs = await field.evaluate((el) => ({
  autocorrect: el.getAttribute("autocorrect"),
  autocapitalize: el.getAttribute("autocapitalize"),
  spellcheck: el.getAttribute("spellcheck"),
  autocomplete: el.getAttribute("autocomplete"),
}));
check(
  attrs.autocorrect === "off" && attrs.autocapitalize === "off" && attrs.spellcheck === "false" && attrs.autocomplete === "off",
  "Spell It turns off autocorrect, autocapitalise, spellcheck and autocomplete",
  JSON.stringify(attrs),
);
await page.waitForFunction(() => !document.querySelector("#spell-input")?.disabled, null, { timeout: 8000 });
await field.fill("zzzz");
await page.keyboard.press("p");
check(!(await stage.getByText("Paused", { exact: true }).isVisible()), "typing p in the field does not pause");
await page.keyboard.press("Enter");
await stage.getByRole("button", { name: "Continue" }).waitFor({ timeout: 5000 });
check(/spelled/i.test(await stage.innerText()), "a wrong spelling is shown corrected");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await stage.getByRole("button", { name: "Quit to Games" }).click();
await page.waitForTimeout(500);

check((await progressWords()) === wordsBefore, "seven games later, still no word progress written");

// ── Phase 23: Unscramble, and the offline state ────────────────────────────
await startGame("Unscramble");
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid="game-stage"] [aria-label="Letters"] button:not([disabled])').length >= 5,
  null,
  { timeout: 8000 },
);
const letters = await stage.locator('[aria-label="Letters"] button').evaluateAll((els) =>
  els.map((e) => e.getAttribute("aria-label").replace("Letter ", "")),
);
const slots = () =>
  stage.locator('[aria-label^="Your word"]').getAttribute("aria-label").then((l) => Number(l.match(/(\d+) of/)[1]));
// Typing places tiles; Backspace takes one back.
await page.keyboard.press(letters[0]);
await page.keyboard.press(letters[1]);
check((await slots()) === 2, "typing places tiles");
await page.keyboard.press("Backspace");
check((await slots()) === 1, "Backspace takes one back");
// "p" is a letter here, not the pause key.
await page.keyboard.press("Backspace");
await page.keyboard.press("p");
check(!(await stage.getByText("Paused", { exact: true }).isVisible()), "typing p on the board does not pause");
await page.keyboard.press("Backspace");
await page.keyboard.press(letters[0]);
// The tiles in their dealt order are never the word: a full wrong row shakes and clears.
for (const l of letters.slice(1)) await page.keyboard.press(l);
await page.waitForTimeout(700);
const afterWrong = await slots();
check(afterWrong === 0, "a wrong full row clears, and costs nothing but time", `${afterWrong} placed; tiles ${letters.join("")}`);
// The hint places the first letter and keeps it there.
await stage.getByRole("button", { name: /Hint/ }).click();
check((await slots()) === 1, "the hint places the first letter");
// Let the clock run out: the answer is shown.
await stage.getByRole("button", { name: "Continue" }).waitFor({ timeout: 30_000 });
check(/it was/i.test(await stage.innerText()), "a time-out shows the word");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await stage.getByRole("button", { name: "Quit to Games" }).click();
await page.waitForTimeout(500);

// Offline: the word files fail, the card says so, and Try again recovers.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p4 = await ctx.newPage();
  await p4.addInitScript(() =>
    localStorage.setItem("lexicon.settings.v1", JSON.stringify({ state: { hasOnboarded: true }, version: 0 })),
  );
  await p4.goto(URL, { waitUntil: "networkidle" });
  await p4.waitForTimeout(1200);
  await p4.route(/\/vocab\/(gre|sat)\/\d+\.json$/, (route) => route.abort("internetdisconnected"));
  await p4.getByRole("button", { name: "Games", exact: true }).first().click();
  await p4.waitForTimeout(700);
  await p4.locator("section").filter({ hasText: "Closest Meaning" }).getByRole("button", { name: "Hard", exact: true }).click();
  const alert = p4.getByRole("alert");
  await alert.waitFor({ timeout: 15000 });
  check(/offline/i.test(await alert.innerText()), "offline: the rules card says what happened");
  check(await p4.getByRole("button", { name: "Play", exact: true }).isDisabled().catch(() => true), "and Play waits");
  await p4.unroute(/\/vocab\/(gre|sat)\/\d+\.json$/);
  await alert.getByRole("button", { name: "Try again" }).click();
  await p4.waitForFunction(
    () => [...document.querySelectorAll("button")].some((b) => b.textContent === "Play" && !b.disabled),
    null,
    { timeout: 15000 },
  );
  check(true, "Try again recovers once the connection is back");
  await ctx.close();
}

// ── Phase 24: Picture It ───────────────────────────────────────────────────
await toHub();
const pictureCard = page.locator("section").filter({ hasText: "Picture It" });
check(
  (await pictureCard.getByRole("button").allInnerTexts()).join(",") === "Play",
  "Picture It's card has one Play button, no tiers",
);
await pictureCard.getByRole("button", { name: "Play", exact: true }).click();
check(/Ten parts of ten things/.test(await page.getByRole("dialog").innerText()), "its rules card describes it");
await page.getByRole("button", { name: "Play", exact: true }).last().click();
await stage.waitFor();
for (let i = 0; i < 10; i++) {
  await page.waitForFunction(
    () => [...document.querySelectorAll('[data-testid="game-stage"] [role="radiogroup"] button')].some((b) => !b.disabled),
    null,
    { timeout: 10000 },
  );
  if (i === 0) {
    check(await stage.getByRole("img", { name: /one part highlighted/ }).isVisible(), "the drawing is shown with a part lit");
    const lit = await stage.locator('svg [stroke="hsl(var(--accent))"]').count();
    check(lit >= 2, "the part and its callout are in the accent colour", `${lit} accent strokes`);
    const opts = await stage.locator('[role="radiogroup"] button').allInnerTexts();
    check(opts.length === 4 && new Set(opts).size === 4, "four distinct names to choose from", opts.join(" | "));
  }
  await page.keyboard.press(String((i % 4) + 1));
  await page.waitForTimeout(500);
  const cont = stage.getByRole("button", { name: "Continue" });
  if (await cont.isVisible().catch(() => false)) await cont.click();
  else await page.waitForTimeout(900);
}
await page.getByTestId("best-line").waitFor({ timeout: 8000 });
check(true, "Picture It: a full round reaches its results");
{
  await page.getByRole("button", { name: "Review answers" }).click();
  const review = page.getByRole("list", { name: "Your answers" });
  await review.locator("li button").first().click();
  check(await review.getByRole("img").first().isVisible(), "the review shows the drawing");
  check(!/Open the library/.test(await review.innerText()), "and doesn't send a diagram part to the library");
}
check((await progressWords()) === wordsBefore, "Picture It wrote no word progress");

// Picture It needs no word files: it plays with the network gone.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p5 = await ctx.newPage();
  await p5.addInitScript(() =>
    localStorage.setItem("lexicon.settings.v1", JSON.stringify({ state: { hasOnboarded: true }, version: 0 })),
  );
  await p5.goto(URL, { waitUntil: "networkidle" });
  await p5.waitForTimeout(1200);
  await p5.route(/\/vocab\//, (route) => route.abort("internetdisconnected"));
  await p5.getByRole("button", { name: "Games", exact: true }).first().click();
  await p5.waitForTimeout(700);
  await p5.locator("section").filter({ hasText: "Picture It" }).getByRole("button", { name: "Play", exact: true }).click();
  await p5.waitForTimeout(1500);
  check(!(await p5.getByRole("alert").isVisible().catch(() => false)), "offline: Picture It shows no offline warning");
  await p5.getByRole("button", { name: "Play", exact: true }).last().click();
  await p5.getByTestId("game-stage").getByRole("img", { name: /one part highlighted/ }).waitFor({ timeout: 8000 });
  check(true, "offline: Picture It still plays");
  await ctx.close();
}

// ── Phase 22: the Daily Round, from the Dashboard and back ─────────────────
const playMixedRound = async () => {
  await page.getByTestId("game-stage").waitFor();
  for (let i = 0; i < 10; i++) {
    await page.waitForFunction(
      () => [...document.querySelectorAll('[data-testid="game-stage"] [role="radiogroup"] button')].some((b) => !b.disabled),
      null,
      { timeout: 10000 },
    );
    await page.keyboard.press("1");
    await page.waitForTimeout(500);
    const cont = stage.getByRole("button", { name: "Continue" });
    if (await cont.isVisible().catch(() => false)) await cont.click();
    else await page.waitForTimeout(900);
  }
  await page.getByTestId("best-line").waitFor({ timeout: 8000 });
};

await page.getByRole("button", { name: "Dashboard", exact: true }).first().click();
await page.waitForTimeout(800);
const nudge = page.getByTestId("daily-nudge");
check(/same for everyone today/i.test(await nudge.innerText()), "the Dashboard offers today's Daily Round");
await nudge.getByRole("button", { name: "Play" }).click();
const dailyPlay = page.getByRole("button", { name: "Play", exact: true });
await page.waitForFunction(
  () => [...document.querySelectorAll("button")].some((b) => b.textContent === "Play" && !b.disabled),
  null,
  { timeout: 15000 },
);
check(/same round for everyone today/i.test(await page.getByRole("dialog").innerText()), "the card opens the Daily Round's rules");
await dailyPlay.click();
await playMixedRound();
check(/Today.s Daily Round/.test(await page.getByTestId("best-line").innerText()), "the first finish is today's result");
check(await page.getByRole("button", { name: "Copy result" }).isVisible(), "and can be copied to share");
const firstResult = await page.evaluate(() => {
  const r = JSON.parse(localStorage.getItem("lexicon.progress.v1")).state.gameRounds[0];
  return { right: r.right, daily: r.daily, practice: r.practice ?? false, pattern: r.pattern };
});
check(
  firstResult.daily && !firstResult.practice && firstResult.pattern?.length === 10,
  "history files it under today, with its pattern",
  JSON.stringify(firstResult),
);

// Back to the hub: the card shows today's result and a filled dot for today.
await page.getByRole("button", { name: "Games", exact: true }).first().click();
await page.waitForTimeout(700);
const card = page.getByTestId("daily-card");
check((await card.innerText()).includes(`${firstResult.right} of 10 today`), "the hub shows today's result");
check((await card.locator('li[aria-label$="not played"]').count()) === 13, "thirteen other days, none of them red — just not played");

// A replay is practice, and today's result stands.
await card.getByRole("button", { name: /practice/i }).click();
await page.waitForFunction(
  () => [...document.querySelectorAll("button")].some((b) => b.textContent === "Play" && !b.disabled),
  null,
  { timeout: 15000 },
);
await page.getByRole("button", { name: "Play", exact: true }).click();
await playMixedRound();
check(/Practice/.test(await page.getByTestId("best-line").innerText()), "a replay says it is practice");
await page.getByRole("button", { name: "Games", exact: true }).first().click();
await page.waitForTimeout(700);
check(
  (await page.getByTestId("daily-card").innerText()).includes(`${firstResult.right} of 10 today`),
  "and today's result is unchanged by it",
);

// Dashboard and Progress agree.
await page.getByRole("button", { name: "Dashboard", exact: true }).first().click();
await page.waitForTimeout(700);
check((await page.getByTestId("daily-nudge").innerText()).includes(`${firstResult.right} of 10`), "the Dashboard shows the result");
await page.getByRole("button", { name: "Progress", exact: true }).first().click();
await page.waitForTimeout(1200);
const prog = await page.getByTestId("games-progress").innerText();
check(prog.includes(`${firstResult.right}/10`) && /Best, timed/.test(prog), "Progress shows the Daily Round and the bests");

// ── The one door into the scheduler, end to end ───────────────────────────
// "Mine" draws only from studied words, so every miss is one the button can
// schedule. Seed 45 studied words, miss at least one on purpose, press the
// button, and check that exactly the missed words became due.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p3 = await ctx.newPage();
  await p3.addInitScript(() =>
    localStorage.setItem("lexicon.settings.v1", JSON.stringify({ state: { hasOnboarded: true }, version: 0 })),
  );
  await p3.goto(URL, { waitUntil: "networkidle" });
  await p3.waitForTimeout(1500);
  const ids = await p3.evaluate(() => {
    const months = JSON.parse(localStorage.getItem("lexicon.vocab.v1")).state.months;
    const m = months["gre/01"];
    return m.days.flatMap((d) => d.words.map((w) => w.id)).slice(0, 45);
  });
  const FAR = "2031-01-01T00:00:00.000Z";
  await p3.evaluate(
    ({ ids, FAR }) => {
      const words = {};
      for (const id of ids) {
        words[id] = {
          wordId: id, monthKey: "gre/01", mastered: false, timesReviewed: 2, quizAttempts: 0, quizCorrect: 0,
          lastReviewed: "2026-10-01T00:00:00.000Z", masteredAt: null, easeFactor: 2.5, intervalDays: 30, reps: 2, dueAt: FAR,
        };
      }
      localStorage.setItem(
        "lexicon.progress.v1",
        JSON.stringify({
          state: { words, activity: {}, sentences: {}, quizzes: [], activeExam: null, exams: [], lastExam: null, studies: [], gameRounds: [], gameBests: {} },
          version: 2,
        }),
      );
    },
    { ids, FAR },
  );
  await p3.reload({ waitUntil: "networkidle" });
  await p3.waitForTimeout(1500);
  await p3.getByRole("button", { name: "Games", exact: true }).first().click();
  await p3.waitForTimeout(800);
  const mine = p3.locator("section").filter({ hasText: "Closest Meaning" }).getByRole("button", { name: "Mine", exact: true });
  check(await mine.isEnabled(), "Mine unlocks with 45 studied words");
  await mine.click();
  await p3.waitForFunction(
    () => [...document.querySelectorAll("button")].some((b) => b.textContent === "Play" && !b.disabled),
    null,
    { timeout: 15000 },
  );
  await p3.getByRole("button", { name: "Play", exact: true }).click();
  const st = p3.getByTestId("game-stage");
  await st.waitFor();
  for (let i = 0; i < 10; i++) {
    await p3.waitForFunction(
      () => [...document.querySelectorAll('[data-testid="game-stage"] [role="radiogroup"] button')].every((b) => !b.disabled),
      null,
      { timeout: 8000 },
    );
    if (i === 0) await p3.waitForTimeout(10_600); // a guaranteed miss
    else await p3.keyboard.press("1");
    await p3.waitForTimeout(1300);
  }
  await p3.getByTestId("best-line").waitFor({ timeout: 8000 });
  const missed = await p3.evaluate(() => JSON.parse(localStorage.getItem("lexicon.progress.v1")).state.gameRounds[0].missed);
  const review = p3.getByRole("button", { name: /^Review (this|these \d+) in Flashcards$/ });
  check(await review.isVisible(), "missed studied words offer Review in Flashcards", `${missed.length} missed`);
  await review.click();
  await p3.waitForTimeout(500);
  const after = await p3.evaluate(() => JSON.parse(localStorage.getItem("lexicon.progress.v1")).state.words);
  const now = Date.now();
  const dueNow = (id) => after[id] && Date.parse(after[id].dueAt) <= now + 36 * 3600 * 1000;
  check(missed.length > 0 && missed.every(dueNow), "every missed word is now due for review", missed.join(","));
  const untouched = ids.filter((id) => !missed.includes(id));
  check(untouched.every((id) => after[id].dueAt === FAR), "and no other word's schedule moved", `${untouched.length} unchanged`);
  await ctx.close();
}

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

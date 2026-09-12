/** The instant quiz: scope picker, periodic tests, and honest distractors. */
import { chromium } from "playwright-core";
import fs from "node:fs";

const EXE = process.env.CHROME_EXE;
const OUT = process.env.OUT_DIR;
const errors = [];
const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  if (/Failed to load resource/.test(m.text())) return;
  errors.push(m.text());
});

await page.addInitScript(() => {
  if (!localStorage.getItem("lexicon.settings.v1")) {
    localStorage.setItem(
      "lexicon.settings.v1",
      JSON.stringify({ state: { theme: "dark", hasOnboarded: true }, version: 0 }),
    );
  }
});

await page.goto("http://localhost:1420/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: /^Quiz$/ }).first().click();
await page.waitForTimeout(800);

let body = await page.locator("main").innerText();
check("scope picker offers Due now first", /Due now/.test(body));
check("and Still learning", /Still learning/.test(body));
check("periodic tests are offered", /Daily[\s\S]*Weekly[\s\S]*Monthly/.test(body));
check(
  "with their fixed lengths",
  /10 questions[\s\S]*25 questions[\s\S]*50 questions/.test(body),
);
check(
  "and says why they are not a uniform sample",
  /words you already know/.test(body),
);

// Start a daily test. Scoped to `main`: the sidebar has a "Daily practice"
// nav item that an unscoped name match reaches first.
await page
  .locator("main")
  .getByRole("button", { name: /^Daily/ })
  .first()
  .click();
await page.waitForTimeout(900);
body = await page.locator("main").innerText();
const started = /Question 1 of 10/.test(body);
check("a daily test starts with ten questions", started, body.slice(0, 80).replace(/\n/g, " "));

// Distractor quality: four options, all distinct. Counted from the answer
// buttons specifically — an empty list would make this pass vacuously.
// By role, not by text length: in def-to-word mode the options are single
// words, and a length filter silently dropped them.
const options = await page.evaluate(() =>
  [...document.querySelectorAll('main [role="radio"]')].map((b) =>
    b.textContent.trim(),
  ),
);
check("the question offers four options", options.length >= 4, String(options.length));
check(
  "all of them distinct",
  options.length > 0 && new Set(options).size === options.length,
  options.slice(0, 4).map((o) => o.slice(0, 20)).join(" | "),
);

// Answer one wrong, and confirm it reaches the scheduler.
const dueBefore = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("lexicon.progress.v1") ?? "{}");
  return Object.values(raw.state?.words ?? {}).filter((w) => w.dueAt).length;
});
await page.locator('main [role="radio"]').last().click({ timeout: 5000 });
await page.waitForTimeout(800);
const dueAfter = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("lexicon.progress.v1") ?? "{}");
  return Object.values(raw.state?.words ?? {}).filter((w) => w.dueAt).length;
});
check("answering reaches the scheduler", dueAfter >= dueBefore, `${dueBefore} -> ${dueAfter}`);

// The scope choice is remembered — but only the instant quiz sets it, so
// start one rather than asserting after a periodic test.
await page.goto("http://localhost:1420/", { waitUntil: "networkidle" });
await page.waitForTimeout(700);
await page.getByRole("button", { name: /^Quiz$/ }).first().click();
await page.waitForTimeout(700);
await page.locator("main").getByRole("button", { name: /Still learning/ }).first().click();
await page.waitForTimeout(300);
await page.locator("main").getByRole("button", { name: /Start quiz|Start/ }).first().click();
await page.waitForTimeout(800);
const remembered = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("lexicon.settings.v1") ?? "{}");
  return raw.state?.lastQuizPool;
});
check(
  "the scope is remembered, so the next quiz is one tap",
  remembered === "unmastered",
  String(remembered),
);

fs.mkdirSync(OUT, { recursive: true });
await page.screenshot({ path: `${OUT}/quiz.png` });
check("no uncaught errors", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);

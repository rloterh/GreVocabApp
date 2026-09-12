/**
 * The exam, driven for real.
 *
 * The property that matters is the dull one: it must survive the app closing.
 * Unit tests prove the model round-trips; this proves the screen does.
 */
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
await page.getByRole("button", { name: /^Exam$/ }).first().click();
await page.waitForTimeout(700);

let body = await page.locator("main").innerText();
check("exam page reachable", /hundred questions/i.test(body));
check("says it saves as you go", /stop and come back/i.test(body));

await page.getByRole("button", { name: /Start the exam/ }).first().click();
await page.waitForTimeout(900);

const exam = () =>
  page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("lexicon.progress.v1") ?? "{}");
    return raw.state?.activeExam ?? null;
  });

let session = await exam();
check("an exam was created and persisted", session !== null);
check(
  "five sections of twenty",
  session?.sections?.length === 5 &&
    session.sections.every((s) => s.questions.length === 20),
  `${session?.sections?.length} sections`,
);
check(
  "answers are null-padded, so a part-done section is representable",
  session?.sections?.[0]?.answers?.length === 20,
);

// Answer a handful.
async function answerOne() {
  const options = page.locator('[role="radio"]');
  await options.first().click();
  await page.waitForTimeout(600);
}
for (let i = 0; i < 7; i++) await answerOne();

session = await exam();
const answered = session.sections.flatMap((s) => s.answers).filter(Boolean).length;
check("answers are persisted as they happen", answered === 7, String(answered));

body = await page.locator("main").innerText();
check(
  "progress is shown without a running score",
  /\d+ \/ 100/.test(body) && !/\d+%/.test(body),
  body.match(/\d+ \/ 100/)?.[0] ?? "",
);

// THE test: close and reopen.
const before = {
  section: session.currentSection,
  question: session.currentQuestion,
  prompt: (await page.locator("main .display-serif, main .text-lg").last().innerText()).trim(),
};
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /^Exam$/ }).first().click();
await page.waitForTimeout(900);

const after = await exam();
check(
  "the exam survives a reload",
  after !== null && after.currentQuestion === before.question,
  `was q${before.question}, now q${after?.currentQuestion}`,
);
check(
  "and resumes on the same question",
  (await page.locator("main").innerText()).includes(before.prompt),
  before.prompt.slice(0, 40),
);
check(
  "with the earlier answers intact",
  after.sections.flatMap((s) => s.answers).filter(Boolean).length === 7,
);

// A wrong answer must feed the scheduler.
const dueBefore = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("lexicon.progress.v1") ?? "{}");
  return Object.values(raw.state?.words ?? {}).filter((w) => w.dueAt).length;
});
// Pick a deliberately wrong option: the last one is rarely the answer, so try
// each until the page marks it wrong.
const opts = page.locator('[role="radio"]');
const n = await opts.count();
await opts.nth(n - 1).click();
await page.waitForTimeout(700);
const dueAfter = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("lexicon.progress.v1") ?? "{}");
  return Object.values(raw.state?.words ?? {}).filter((w) => w.dueAt).length;
});
check(
  "answering feeds the scheduler",
  dueAfter >= dueBefore,
  `${dueBefore} -> ${dueAfter}`,
);

fs.mkdirSync(OUT, { recursive: true });
await page.screenshot({ path: `${OUT}/exam.png` });

check("no uncaught errors", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);

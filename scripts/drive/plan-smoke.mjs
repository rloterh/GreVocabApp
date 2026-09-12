/**
 * Drive the plan builder end to end against a stubbed provider.
 *
 * The engine has unit tests; this proves the screen actually reaches it —
 * that a plan built by clicking produces committed months, that the preview is
 * computed without contacting anything, and that a failure mid-run leaves the
 * finished months in place and offers to resume.
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

// Start with only April loaded, and an Anthropic key so a provider resolves.
await page.addInitScript(() => {
  localStorage.setItem(
    "lexicon.settings.v1",
    JSON.stringify({ state: { theme: "dark", hasOnboarded: true }, version: 0 }),
  );
  localStorage.setItem("lexicon.secret.anthropicApiKey", "sk-ant-stub");
});

// Stub Anthropic. Count calls so we can fail one deliberately.
let call = 0;
let serial = 0;
let failNext = false;
await page.route("https://api.anthropic.com/**", async (route) => {
  call++;
  if (failNext) {
    failNext = false;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "stubbed failure" } }),
    });
    return;
  }
  const body = JSON.parse(route.request().postData() ?? "{}");
  const prompt = JSON.stringify(body);
  const wanted = Number(/exactly (\d+) vocabulary/.exec(prompt)?.[1] ?? 10);
  const words = Array.from({ length: wanted }, () => {
    const w = `zyx${serial++}`;
    return {
      word: w,
      partOfSpeech: "noun",
      definition: `The state of ${w}.`,
      example: `The ${w} was evident throughout.`,
      mnemonic: `Sounds like ${w}.`,
      synonyms: [],
      antonyms: [],
    };
  });
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude",
      stop_reason: "tool_use",
      content: [
        { type: "tool_use", id: "t1", name: "emit_vocabulary", input: { words } },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
  });
});

await page.goto("http://localhost:1420/", { waitUntil: "networkidle" });

// Archive holds the generator.
await page.getByRole("button", { name: "More" }).first().click().catch(() => {});
await page.getByRole("button", { name: /^Archive$/ }).first().click();
await page.waitForTimeout(600);

await page.getByRole("button", { name: /Generate with AI/ }).first().click();
await page.waitForTimeout(500);
check("dialog opened", await page.getByRole("dialog").isVisible());

const callsBeforePlanning = call;
await page.getByRole("button", { name: "Plan ahead" }).first().click();
await page.waitForTimeout(400);

const body = () => page.locator('[role="dialog"]').innerText();
let text = await body();
check("plan builder shown", /How far ahead/.test(text));
check("offers four horizons", /A month[\s\S]*A quarter[\s\S]*Six months[\s\S]*A year/.test(text));
check("offers a difficulty curve", /Gentle[\s\S]*Steady[\s\S]*Hard/.test(text));

// Preview must be local.
await page.getByRole("button", { name: /^A year/ }).first().click();
await page.waitForTimeout(400);
text = await body();
check("preview updates to a year", /12 months/.test(text), text.match(/\d+ months[^\n]*/)?.[0] ?? "");
check("preview shows the word total", /1080 words/.test(text));
check(
  "preview contacted no provider",
  call === callsBeforePlanning,
  `${call - callsBeforePlanning} requests`,
);

// A word list that cannot fit must be warned about, not truncated silently.
const listBox = page.locator('[role="dialog"] textarea');
await listBox.fill(Array.from({ length: 5 }, (_, i) => `wordy${i}`).join("\n"));
await page.waitForTimeout(300);
check("accepts a word list", (await listBox.inputValue()).includes("wordy0"));

// Back to a quarter so the run is quick.
await page.getByRole("button", { name: /^A quarter/ }).first().click();
await page.waitForTimeout(300);

// Fail the second month deliberately, to prove resume.
await page.getByRole("button", { name: /^Generate$/ }).first().click();
await page.waitForTimeout(1500);
failNext = true;
await page.waitForTimeout(9000);

text = await body();
const stopped = /Stopped at/.test(text);
check("a mid-run failure is reported, not swallowed", stopped, text.match(/Stopped at[^\n]*/)?.[0] ?? "");

const monthsAfter = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("lexicon.vocab.v1") ?? "{}");
  return Object.keys(raw.state?.months ?? {});
});
check(
  "months finished before the failure are saved",
  monthsAfter.length > 1,
  monthsAfter.join(", "),
);

if (stopped) {
  check("offers to resume", /Resume/.test(text));
  await page.getByRole("button", { name: /^Resume$/ }).first().click();
  await page.waitForTimeout(9000);

  const monthsFinal = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("lexicon.vocab.v1") ?? "{}");
    return Object.keys(raw.state?.months ?? {});
  });
  check(
    "resuming completes the plan",
    monthsFinal.length >= 4,
    monthsFinal.join(", "),
  );

  // The bug the screenshot caught: `summarize` counts every outcome ever
  // recorded, so a month retried successfully still read as failed. The run
  // then reported a stall instead of finishing — leaving the dialog open on a
  // stale error rather than closing on success.
  const stillOpen = await page.locator('[role="dialog"]').count();
  check("a completed resume closes the dialog", stillOpen === 0);
  if (stillOpen > 0) {
    const after = await body();
    check(
      "no stale failure message survives a successful resume",
      !/Stopped at/.test(after),
      after.match(/Stopped at.*/)?.[0] ?? "",
    );
  }
}

// No duplicate words anywhere, which is the point of the whole phase.
const dupes = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("lexicon.vocab.v1") ?? "{}");
  const words = Object.values(raw.state?.months ?? {}).flatMap((m) =>
    m.days.flatMap((d) => d.words.map((w) => w.word.toLowerCase())),
  );
  const seen = new Set();
  const repeated = [];
  for (const w of words) {
    if (seen.has(w)) repeated.push(w);
    seen.add(w);
  }
  return { total: words.length, repeated };
});
check(
  "no word appears twice across every generated month",
  dupes.repeated.length === 0,
  `${dupes.total} words, ${dupes.repeated.length} repeats`,
);

fs.mkdirSync(OUT, { recursive: true });
await page.screenshot({ path: `${OUT}/plan-builder.png` });

check("no uncaught errors", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);

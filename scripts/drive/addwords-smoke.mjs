/** Drive "Add words" against a stubbed provider. */
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
  localStorage.setItem(
    "lexicon.settings.v1",
    JSON.stringify({ state: { theme: "dark", hasOnboarded: true }, version: 0 }),
  );
  localStorage.setItem("lexicon.secret.anthropicApiKey", "sk-ant-stub");
});

let lastPrompt = "";
await page.route("https://api.anthropic.com/**", async (route) => {
  const body = JSON.parse(route.request().postData() ?? "{}");
  lastPrompt = JSON.stringify(body);
  const asked = [...lastPrompt.matchAll(/- (perspicacious|obdurate)/g)].map((m) => m[1]);
  const words = (asked.length ? asked : ["perspicacious"]).map((w) => ({
    word: w,
    partOfSpeech: "adjective",
    definition: "Having keen insight.",
    example: `Her ${w} questions unsettled the panel.`,
    mnemonic: `${w} sounds like a sharp spike.`,
    synonyms: [],
    antonyms: [],
  }));
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
await page.getByRole("button", { name: "More" }).first().click().catch(() => {});
await page.getByRole("button", { name: /^Archive$/ }).first().click();
await page.waitForTimeout(700);

// Count across every month: Archive's first card is not necessarily the
// first key in storage, and guessing wrong makes this measure nothing.
const totals = () =>
  page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("lexicon.vocab.v1") ?? "{}");
    const all = Object.values(raw.state?.months ?? {}).flatMap((m) =>
      m.days.flatMap((d) => d.words.map((w) => w.word)),
    );
    return { count: all.length, words: all };
  });
const before = await totals();
// A word that really is in the user's vocabulary, taken from the data.
const existingWord = before.words[0];

await page.getByRole("button", { name: /Add words/ }).first().click();
await page.waitForTimeout(500);
check("dialog opened", await page.getByRole("dialog").isVisible());

const dialog = page.locator('[role="dialog"]');
await dialog.locator("textarea").fill("perspicacious, obdurate");
await page.waitForTimeout(400);
let text = await dialog.innerText();
check("counts the words it will add", /2 words/.test(text), text.match(/\d+ words?/)?.[0] ?? "");

// A word already present must be flagged before anything is generated.
const callsBefore = lastPrompt;
await dialog.locator("textarea").fill(existingWord);
await page.waitForTimeout(400);
text = await dialog.innerText();
check(
  "warns about a word already in the vocabulary, before generating",
  /Already in your vocabulary/.test(text),
  text.match(/Already in your vocabulary[^.]*\./)?.[0] ?? "",
);
check("and generated nothing to find that out", lastPrompt === callsBefore);

await dialog.locator("textarea").fill("perspicacious, obdurate");
await page.waitForTimeout(300);
await dialog.getByRole("button", { name: /^Add/ }).first().click();
await page.waitForTimeout(4000);

check(
  "asks only for card content, not for word choice",
  /vocabulary card for each/.test(lastPrompt),
);
check("names the exact words", /perspicacious/.test(lastPrompt) && /obdurate/.test(lastPrompt));

const after = await totals();
check(
  "both words were added",
  after.count === before.count + 2,
  `${before.count} -> ${after.count}`,
);
check("the new words are there", after.words.includes("perspicacious") && after.words.includes("obdurate"));
check("the dialog closed", (await page.locator('[role="dialog"]').count()) === 0);

fs.mkdirSync(OUT, { recursive: true });
await page.screenshot({ path: `${OUT}/add-words.png` });
check("no uncaught errors", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);

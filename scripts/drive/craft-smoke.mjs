/** Themes, word order, and the info dialog, in the running app. */
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
  // Seed once. Re-seeding on reload would wipe the very setting the
  // stability check below is trying to observe across a reload.
  if (!localStorage.getItem("lexicon.settings.v1")) {
    localStorage.setItem(
      "lexicon.settings.v1",
      JSON.stringify({ state: { theme: "dark", hasOnboarded: true }, version: 0 }),
    );
  }
});

await page.goto("http://localhost:1420/", { waitUntil: "networkidle" });

// --- info dialog ----------------------------------------------------------
await page.getByRole("button", { name: "About Lexicon" }).first().click();
await page.waitForTimeout(500);
const about = await page.locator('[role="dialog"]').innerText();
check("info dialog opens", about.length > 0);
check("names its designer", /Robert Loterh/.test(about), about.match(/Designed by.*/)?.[0] ?? "");
check("says the year", /2026/.test(about));
check("shows a real version, not a placeholder", /Version \d+\.\d+\.\d+/.test(about), about.match(/Version [^\n]*/)?.[0] ?? "");
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

// --- themes ---------------------------------------------------------------
await page.getByRole("button", { name: /^Settings$/ }).first().click();
await page.waitForTimeout(700);

let body = await page.locator("body").innerText();
check(
  "theme picker is grouped",
  /automatic[\s\S]*light[\s\S]*dark[\s\S]*accessibility/i.test(body),
);
for (const name of ["Midnight", "Evergreen", "Porcelain", "Claret"]) {
  check(`offers ${name}`, new RegExp(name).test(body));
}

const applied = [];
for (const name of ["Midnight", "Evergreen", "Porcelain", "Claret"]) {
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).first().click();
  await page.waitForTimeout(450);
  const state = await page.evaluate(() => ({
    classes: document.documentElement.className,
    bg: getComputedStyle(document.body).backgroundColor,
    fg: getComputedStyle(document.body).color,
  }));
  applied.push({ name, ...state });
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/theme-${name.toLowerCase()}.png` });
}

for (const t of applied) {
  check(`${t.name} applies its class`, t.classes.includes(t.name.toLowerCase()), t.classes);
}
check(
  "each theme paints a different background",
  new Set(applied.map((t) => t.bg)).size === applied.length,
  applied.map((t) => `${t.name} ${t.bg}`).join(", "),
);
check(
  "only one theme class at a time",
  applied.every((t) => t.classes.trim().split(/\s+/).length === 1),
  applied.map((t) => t.classes).join(" | "),
);

// --- word order -----------------------------------------------------------
body = await page.locator("body").innerText();
check("word order section exists", /Word order/.test(body));
check(
  "says where it does not apply",
  /Never changes what the scheduler shows you next/.test(body),
);
for (const label of ["As written", "A to Z", "Shuffled"]) {
  check(`offers "${label}"`, new RegExp(label).test(body));
}

// Read a day in authored order, then alphabetical, and compare.
async function practiceWords() {
  await page.getByRole("button", { name: /^Daily practice$/ }).first().click();
  await page.waitForTimeout(700);
  return page.evaluate(() =>
    [...document.querySelectorAll("main .display-serif")]
      .map((e) => e.textContent.trim())
      // "Day 1" is a heading in the same typeface, not a vocabulary word.
      .filter((t) => t && t.length < 30 && !/^Day \d+$/.test(t)),
  );
}

const authored = await practiceWords();
check("daily practice lists words", authored.length > 1, authored.join(", "));

await page.getByRole("button", { name: /^Settings$/ }).first().click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: /^A to Z/ }).first().click();
await page.waitForTimeout(400);
const alphabetical = await practiceWords();

const sorted = [...alphabetical].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
check(
  "A to Z actually sorts the day",
  JSON.stringify(alphabetical) === JSON.stringify(sorted),
  alphabetical.join(", "),
);
check(
  "and it is a reordering, not a different set",
  JSON.stringify([...authored].sort()) === JSON.stringify([...alphabetical].sort()),
);

// Shuffled must be stable across a reload, within the same day.
await page.getByRole("button", { name: /^Settings$/ }).first().click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: /^Shuffled/ }).first().click();
await page.waitForTimeout(400);
const shuffledOnce = await practiceWords();
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(900);
const shuffledAgain = await practiceWords();
check(
  "shuffled order is stable across a reload",
  JSON.stringify(shuffledOnce) === JSON.stringify(shuffledAgain),
  `${shuffledOnce.join(",")} vs ${shuffledAgain.join(",")}`,
);

check("no uncaught errors", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);

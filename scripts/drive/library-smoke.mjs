/** The bundled-vocabulary library: list, load on demand, and stay loaded. */
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

// Count what the app fetches: the library must not download months it was
// only asked to list.
const fetched = [];
page.on("request", (r) => {
  const url = r.url();
  if (/\/vocab\/\d{4}-\d{2}\.json$/.test(url)) fetched.push(url.split("/").pop());
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
await page.getByRole("button", { name: "More" }).first().click().catch(() => {});
await page.getByRole("button", { name: /^Archive$/ }).first().click();
await page.waitForTimeout(1200);

const body = await page.locator("main").innerText();
check("library section is shown", /Bundled vocabulary/.test(body));
check(
  "it says how much is there",
  /\d+ months · [\d,]+ words/.test(body),
  body.match(/\d+ months · [\d,]+ words/)?.[0] ?? "",
);
check(
  "and that nothing is downloaded yet",
  /Nothing is downloaded until you ask/.test(body),
);
check(
  "listing downloaded no month files",
  fetched.length === 0,
  fetched.join(", "),
);
check("a sample of words is shown", /laud/.test(body));

// Count months before loading.
const before = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("lexicon.vocab.v1") ?? "{}");
  return Object.keys(raw.state?.months ?? {}).length;
});

await page.locator("main").getByRole("button", { name: /Load all/ }).first().click();
await page.waitForTimeout(4000);

const after = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("lexicon.vocab.v1") ?? "{}");
  return Object.keys(raw.state?.months ?? {});
});
check("months were loaded on request", after.length > before, `${before} -> ${after.length}`);
check("and only then were they fetched", fetched.length > 0, fetched.join(", "));

const body2 = await page.locator("main").innerText();
check("loaded months are marked, not offered again", /Loaded/.test(body2));

// Survives a reload, since it went through the store.
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const persisted = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("lexicon.vocab.v1") ?? "{}");
  return Object.keys(raw.state?.months ?? {}).length;
});
check("they persist across a reload", persisted === after.length, String(persisted));

// No duplicate words across everything loaded.
const dupes = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("lexicon.vocab.v1") ?? "{}");
  const all = Object.values(raw.state?.months ?? {}).flatMap((m) =>
    m.days.flatMap((d) => d.words.map((w) => w.word.toLowerCase())),
  );
  const seen = new Set();
  const repeated = [];
  for (const w of all) {
    if (seen.has(w)) repeated.push(w);
    seen.add(w);
  }
  return { total: all.length, repeated: [...new Set(repeated)] };
});
check(
  "no word is repeated across the corpus",
  dupes.repeated.length === 0,
  `${dupes.total} words, repeats: ${dupes.repeated.slice(0, 5).join(", ")}`,
);

fs.mkdirSync(OUT, { recursive: true });
await page.screenshot({ path: `${OUT}/library.png` });
check("no uncaught errors", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);

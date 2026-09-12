/**
 * A whole-app audit in a real browser.
 *
 * Four things unit tests cannot see, checked on every page:
 *
 * - **Accessibility**: buttons with no accessible name, images with no alt,
 *   inputs with no label, and headings that skip levels.
 * - **Contrast in the rendered page**, as opposed to in the token file —
 *   `theme-contrast.test.ts` checks the palette; this checks what was actually
 *   composed from it.
 * - **Runtime errors** on every route, which a unit suite never exercises.
 * - **Scale**: the same pass with the full corpus loaded, because the app was
 *   designed around 180 words and now ships thousands.
 */
import { chromium } from "playwright-core";
import fs from "node:fs";

const EXE = process.env.CHROME_EXE;
const OUT = process.env.OUT_DIR ?? "./audit-out";
const LOAD_CORPUS = process.env.CORPUS === "1";

const PAGES = [
  ["dashboard", "Dashboard"],
  ["practice", "Daily practice"],
  ["flashcards", "Flashcards"],
  ["quiz", "Quiz"],
  ["exam", "Exam"],
  ["sentences", "Sentences"],
  ["calendar", "Calendar"],
  ["archive", "Archive"],
  ["progress", "Progress"],
  ["search", "Search"],
  ["settings", "Settings"],
];

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

const runtimeErrors = [];
page.on("pageerror", (e) => runtimeErrors.push(`[pageerror] ${e}`));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  if (/Failed to load resource/.test(m.text())) return;
  runtimeErrors.push(m.text().slice(0, 200));
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

if (LOAD_CORPUS) {
  await page.getByRole("button", { name: /^Archive$/ }).first().click();
  await page.waitForTimeout(900);
  const loadAll = page.locator("main").getByRole("button", { name: /Load all/ });
  if (await loadAll.count()) {
    await loadAll.first().click();
    // The corpus is dozens of fetches; give it room.
    await page.waitForTimeout(30_000);
  }
  const loaded = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("lexicon.vocab.v1") ?? "{}");
    const months = Object.values(raw.state?.months ?? {});
    return {
      months: months.length,
      words: months.reduce((n, m) => n + m.days.flatMap((d) => d.words).length, 0),
    };
  });
  console.log(`corpus loaded: ${loaded.months} months, ${loaded.words} words\n`);
}

/** Everything wrong with the page currently rendered. */
async function inspect() {
  return page.evaluate(() => {
    const problems = [];
    const label = (el) =>
      (el.getAttribute("aria-label") ??
        el.getAttribute("title") ??
        el.textContent ??
        "").trim();

    for (const el of document.querySelectorAll("main button, nav button")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (!label(el)) {
        problems.push({
          kind: "button with no accessible name",
          detail: el.className.toString().slice(0, 60),
        });
      }
    }

    for (const el of document.querySelectorAll("img")) {
      if (!el.hasAttribute("alt")) {
        problems.push({ kind: "image with no alt", detail: el.src.slice(0, 60) });
      }
    }

    for (const el of document.querySelectorAll("input, select, textarea")) {
      const type = el.getAttribute("type");
      if (type === "hidden") continue;
      const id = el.getAttribute("id");
      const labelled =
        el.getAttribute("aria-label") ||
        el.getAttribute("placeholder") ||
        el.closest("label") ||
        (id && document.querySelector(`label[for="${CSS.escape(id)}"]`));
      if (!labelled) {
        problems.push({
          kind: "input with no label",
          detail: `${el.tagName.toLowerCase()}[type=${type ?? "text"}]`,
        });
      }
    }

    // Heading levels should not skip: h1 then h3 leaves a screen reader
    // guessing at the structure.
    const levels = [...document.querySelectorAll("main h1,h2,h3,h4,h5,h6")].map((h) =>
      Number(h.tagName[1]),
    );
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] - levels[i - 1] > 1) {
        problems.push({
          kind: "heading level skipped",
          detail: `h${levels[i - 1]} then h${levels[i]}`,
        });
      }
    }

    // Contrast of rendered text against its own background.
    const lum = (rgb) => {
      const [r, g, b] = rgb.match(/\d+/g).slice(0, 3).map(Number);
      const f = (c) => {
        const u = c / 255;
        return u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    /**
     * The colour actually behind an element, alpha composited.
     *
     * Taking the first non-transparent ancestor background is wrong: this app
     * uses `bg-accent/10` and similar everywhere, and treating a 10%-alpha
     * accent as a solid accent produced ratios as absurd as 1.04:1 on text
     * that is perfectly legible. Blend each layer down instead.
     */
    const backdrop = (el) => {
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        if (!bg || /transparent/.test(bg)) continue;
        const parts = bg.match(/[\d.]+/g)?.map(Number) ?? [];
        if (parts.length < 3) continue;
        const alpha = parts.length > 3 ? parts[3] : 1;
        if (alpha === 0) continue;
        layers.push({ rgb: parts.slice(0, 3), alpha });
        if (alpha === 1) break;
      }
      // Composite from the bottom up.
      let base = layers.length && layers[layers.length - 1].alpha === 1
        ? layers.pop().rgb
        : [0, 0, 0];
      for (let i = layers.length - 1; i >= 0; i--) {
        const { rgb, alpha } = layers[i];
        base = base.map((c, k) => rgb[k] * alpha + c * (1 - alpha));
      }
      return `rgb(${base.map(Math.round).join(", ")})`;
    };
    const seen = new Set();
    for (const el of document.querySelectorAll("main p, main span, main div, main button")) {
      if (!el.textContent?.trim() || el.children.length > 0) continue;
      const style = getComputedStyle(el);
      const size = parseFloat(style.fontSize);
      const key = `${style.color}|${backdrop(el)}|${size}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const a = lum(style.color);
      const b = lum(backdrop(el));
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      // 3:1 for large text, 4.5:1 otherwise.
      const needed = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700) ? 3 : 4.5;
      if (ratio < needed) {
        problems.push({
          kind: "low contrast text",
          detail: `${ratio.toFixed(2)}:1 needs ${needed} — ${size}px "${el.textContent.trim().slice(0, 30)}"`,
        });
      }
    }

    return problems;
  });
}

const byKind = new Map();
let pagesVisited = 0;

for (const [, navName] of PAGES) {
  const target = page.locator("main, nav").getByRole("button", { name: new RegExp(`^${navName}$`) });
  try {
    await page.getByRole("button", { name: new RegExp(`^${navName}$`) }).first().click({ timeout: 5000 });
  } catch {
    console.log(`  (could not reach ${navName})`);
    continue;
  }
  void target;
  await page.waitForTimeout(700);
  pagesVisited++;

  for (const problem of await inspect()) {
    const key = `${problem.kind}`;
    if (!byKind.has(key)) byKind.set(key, []);
    byKind.get(key).push(`${navName}: ${problem.detail}`);
  }
}

console.log(`visited ${pagesVisited} pages\n`);

if (byKind.size === 0) {
  console.log("no accessibility or contrast problems found");
} else {
  for (const [kind, items] of byKind) {
    console.log(`${kind} — ${items.length}`);
    for (const item of items.slice(0, 6)) console.log(`    ${item}`);
    if (items.length > 6) console.log(`    … and ${items.length - 6} more`);
  }
}

console.log(`\nruntime errors: ${runtimeErrors.length}`);
for (const e of runtimeErrors.slice(0, 5)) console.log(`    ${e}`);

fs.mkdirSync(OUT, { recursive: true });
await browser.close();

const total = [...byKind.values()].reduce((n, v) => n + v.length, 0);
process.exit(total === 0 && runtimeErrors.length === 0 ? 0 : 1);

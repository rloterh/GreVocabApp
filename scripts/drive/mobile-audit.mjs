/**
 * What actually breaks at a phone viewport, measured rather than guessed.
 *
 * Reports three things per page: horizontal page overflow, interactive targets
 * under 44px, and any element wider than the viewport.
 */
import { chromium } from "playwright-core";
import fs from "node:fs";

const EXE = process.env.CHROME_EXE;
const WIDTH = Number(process.env.WIDTH ?? 360);
const OUT = process.env.OUT_DIR;
const SHOTS = process.env.SHOTS === "1";

const PAGES = [
  "dashboard",
  "practice",
  "flashcards",
  "quiz",
  "sentences",
  "calendar",
  "archive",
  "progress",
  "search",
  "settings",
];

// TOUCH decides which rules apply, because the app keys them to the pointer
// rather than the width: a 360px window on a desktop does not need 44px
// targets, and a 900px tablet does. Default: anything below `lg` is a touch
// device, which is the case the responsive shell exists for.
const TOUCH = process.env.TOUCH ? process.env.TOUCH === "1" : WIDTH < 1024;

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage({
  viewport: { width: WIDTH, height: 780 },
  deviceScaleFactor: 2,
  isMobile: TOUCH,
  hasTouch: TOUCH,
});

// Seed enough data that pages render something real rather than empty states.
await page.addInitScript(() => {
  localStorage.setItem(
    "lexicon.settings.v1",
    JSON.stringify({ state: { theme: "dark", hasOnboarded: true }, version: 0 }),
  );
});

await page.goto("http://localhost:1420/", { waitUntil: "networkidle" });

const report = [];
for (const target of PAGES) {
  // Navigate the way a user does, through whichever shell is showing. Below
  // `lg` that means the tab bar, and the More sheet for everything else.
  const narrow = WIDTH < 1024;
  const tabbed = ["dashboard", "practice", "flashcards", "quiz"];
  const click = async (name) =>
    page
      .getByRole("button", { name: new RegExp(`^${name}$`, "i") })
      .first()
      .click({ timeout: 4000 });

  try {
    if (!narrow) {
      await click(label(target));
    } else if (tabbed.includes(target)) {
      await click(tabLabel(target));
    } else {
      await click("More");
      await page.waitForTimeout(320);
      await click(label(target));
    }
  } catch (e) {
    console.log(`  (could not reach ${target})`);
  }
  await page.waitForTimeout(650);

  const result = await page.evaluate((vw) => {
    const doc = document.documentElement;
    const overflowPx = doc.scrollWidth - doc.clientWidth;

    const wide = [];
    const small = [];
    for (const el of document.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;

      // Anything extending past the right edge of the viewport.
      if (r.right > vw + 1 && r.width > 8) {
        const style = getComputedStyle(el);
        const scrolls =
          style.overflowX === "auto" || style.overflowX === "scroll";
        // A wide thing inside its own scroller is correct, not a bug.
        let inScroller = false;
        for (let a = el.parentElement; a; a = a.parentElement) {
          const s = getComputedStyle(a);
          if (s.overflowX === "auto" || s.overflowX === "scroll") {
            inScroller = true;
            break;
          }
        }
        if (!scrolls && !inScroller) {
          wide.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className?.toString?.() ?? "").slice(0, 70),
            right: Math.round(r.right),
            width: Math.round(r.width),
          });
        }
      }

      // Touch targets.
      const interactive =
        el.matches("button, a[href], input, select, textarea, [role=button]") &&
        !el.hasAttribute("disabled");
      // A checkbox inside a label is tapped via the label, so the label's
      // box is the real target. Judging the 20px box alone is a false alarm.
      let box = r;
      if (el.matches("input[type=checkbox], input[type=radio]")) {
        const label = el.closest("label");
        if (label) box = label.getBoundingClientRect();
      }
      if (interactive && (box.width < 44 || box.height < 44)) {
        small.push({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? "").trim().slice(0, 28),
          w: Math.round(box.width),
          h: Math.round(box.height),
        });
      }
    }

    // Inputs under 16px get zoomed into by iOS Safari on focus.
    const smallFontInputs = [...document.querySelectorAll("input, select, textarea")]
      .map((el) => ({
        type: el.getAttribute("type") ?? el.tagName.toLowerCase(),
        size: parseFloat(getComputedStyle(el).fontSize),
      }))
      .filter((i) => i.size < 16 && i.type !== "checkbox" && i.type !== "radio");

    return { overflowPx, wide: wide.slice(0, 6), small, smallFontInputs };
  }, WIDTH);

  // De-duplicate touch-target rows, which repeat across list items.
  const seen = new Map();
  for (const s of result.small) {
    const key = `${s.tag}|${s.w}x${s.h}`;
    seen.set(key, { ...s, count: (seen.get(key)?.count ?? 0) + 1 });
  }
  result.small = [...seen.values()];

  report.push({ page: target, ...result });

  if (SHOTS) {
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/${WIDTH}-${target}.png`, fullPage: false });
  }
}

await browser.close();

let bad = 0;
console.log(`\n=== ${WIDTH}px, ${TOUCH ? "touch" : "mouse"} ===`);
for (const r of report) {
  const issues = [];
  if (r.overflowPx > 0) issues.push(`PAGE SCROLLS ${r.overflowPx}px`);
  if (r.wide.length) issues.push(`${r.wide.length} overflowing el`);
  // Target sizes are a touch rule. Asserting them against a mouse would be
  // asserting that desktop density is a bug.
  if (TOUCH && r.small.length)
    issues.push(
      `${r.small.reduce((n, s) => n + s.count, 0)} small targets (${r.small
        .map((s) => `${s.tag} ${s.w}x${s.h}${s.count > 1 ? `×${s.count}` : ""}`)
        .join(", ")})`,
    );
  if (TOUCH && r.smallFontInputs.length)
    issues.push(`${r.smallFontInputs.length} inputs <16px`);

  if (issues.length) {
    bad++;
    console.log(`FAIL ${r.page.padEnd(11)} ${issues.join(" | ")}`);
    for (const w of r.wide) console.log(`       wide: <${w.tag}> ${w.width}px right=${w.right} .${w.cls}`);
  } else {
    console.log(`ok   ${r.page}`);
  }
}
console.log(`\n${report.length - bad}/${report.length} pages clean at ${WIDTH}px`);
process.exit(bad === 0 ? 0 : 1);

function tabLabel(p) {
  return {
    dashboard: "Home",
    practice: "Practice",
    flashcards: "Cards",
    quiz: "Quiz",
  }[p];
}

function label(p) {
  return {
    dashboard: "Dashboard",
    practice: "Daily practice",
    flashcards: "Flashcards",
    quiz: "Quiz",
    sentences: "Sentences",
    calendar: "Calendar",
    archive: "Archive",
    progress: "Progress",
    search: "Search",
    settings: "Settings",
  }[p];
}

/**
 * Phase 15: the flashcard edge arrows and swipe.
 *
 * Most of what this checks cannot be unit-tested: whether a control is
 * *visible*, whether moving a pointer toward it makes it disappear, whether a
 * drag of a given distance navigates or rates. So it is driven.
 *
 *   CHROME_EXE="<chrome.exe>" node scripts/drive/flashcard-nav-smoke.mjs [outDir]
 */

import { chromium } from "playwright-core";

const EXE =
  process.env.CHROME_EXE ??
  "C:/Users/HP/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe";
const URL = process.env.APP_URL ?? "http://localhost:1420/";
const OUT = process.argv[2] ?? process.env.OUT_DIR ?? ".";

const problems = [];
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) problems.push(label);
};

const browser = await chromium.launch({ executablePath: EXE });

/** Opacity as rendered, which is what "hidden" actually means here. */
async function opacityOf(locator) {
  return Number(
    await locator.evaluate((el) => getComputedStyle(el).opacity),
  );
}

async function startSession(page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "lexicon.settings.v1",
      JSON.stringify({
        state: { hasOnboarded: true, theme: "dark", hasSeenSrsIntro: true },
        version: 0,
      }),
    );
  });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: /^(Flashcards|Cards)$/ }).first().click();
  await page.waitForTimeout(500);
  const start = page.getByRole("button", { name: /Start/ }).first();
  await start.click();
  await page.waitForTimeout(700);
}

/** The visible "Card N of M" in the top bar. */
async function cardIndex(page) {
  const text = await page.locator("body").innerText();
  const m = text.match(/Card (\d+) of (\d+)/);
  return m ? Number(m[1]) : null;
}

// --- Desktop: hover, focus, ends --------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (/ERR_CONNECTION_REFUSED/.test(m.text())) return; // local AI probes
    problems.push(`console error: ${m.text()}`);
  });

  await startSession(page);

  const next = page.getByRole("button", { name: "Next card" });
  const prev = page.getByRole("button", { name: "Previous card" });

  check(await next.count() === 1, "the card has a next arrow");
  check(await prev.count() === 1, "the card has a previous arrow");

  check(await opacityOf(next) === 0, "hidden at rest", `opacity ${await opacityOf(next)}`);
  await page.screenshot({ path: `${OUT}/flashcard-at-rest.png` });

  // Hover the card.
  await page.locator(".min-h-\\[420px\\]").hover();
  await page.waitForTimeout(400);
  check(await opacityOf(next) > 0.9, "hovering the card reveals them");
  await page.screenshot({ path: `${OUT}/flashcard-hovered.png` });

  // Hover the arrow itself: it must not vanish on the way to being clicked.
  await next.hover();
  await page.waitForTimeout(300);
  check(
    await opacityOf(next) > 0.9,
    "the arrow stays visible when the pointer reaches it",
  );

  // At the first card the left arrow is disabled, and still on screen.
  check(await prev.isDisabled(), "the previous arrow is disabled on card one");
  const prevOpacity = await opacityOf(prev);
  check(
    prevOpacity > 0 && prevOpacity < 0.9,
    "and greyed rather than hidden, so the other one does not jump",
    `opacity ${prevOpacity}`,
  );

  // Clicking it advances.
  const before = await cardIndex(page);
  await next.click();
  await page.waitForTimeout(500);
  const after = await cardIndex(page);
  check(after === before + 1, "the arrow advances a card", `${before} → ${after}`);
  check(
    await prev.isDisabled() === false,
    "and the previous arrow comes alive",
  );

  // Focus reveals, and survives the pointer being elsewhere.
  //
  // Clicking the arrow left focus on it, and focus deliberately keeps it
  // visible — so the pointer has to leave *and* focus has to move out before
  // "hidden at rest" means anything.
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.mouse.move(5, 5);
  await page.waitForTimeout(400);
  check(
    (await opacityOf(next)) === 0,
    "hidden again once the pointer and focus both leave",
    `opacity ${await opacityOf(next)}`,
  );
  await next.focus();
  await page.waitForTimeout(300);
  check(await opacityOf(next) > 0.9, "focus reveals them with no pointer at all");

  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  check(
    (await cardIndex(page)) === after + 1,
    "and the focused arrow works from the keyboard",
  );

  await page.close();
}

// --- Swipe navigates; it does not rate ---------------------------------------
{
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));

  await startSession(page);

  const card = page.locator(".min-h-\\[420px\\]").first();
  const box = await card.boundingBox();
  const midY = box.y + box.height / 2;

  const drag = async (dx) => {
    await page.mouse.move(box.x + box.width / 2, midY);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(box.x + box.width / 2 + (dx * i) / 10, midY);
    }
    await page.mouse.up();
    await page.waitForTimeout(600);
  };

  const first = await cardIndex(page);

  // Under the threshold: springs back, nothing happens.
  await drag(-(box.width * 0.1));
  check(
    (await cardIndex(page)) === first,
    "a short drag does nothing",
    `still ${await cardIndex(page)}`,
  );

  // Past it: advances.
  await drag(-(box.width * 0.45));
  const second = await cardIndex(page);
  check(second === first + 1, "dragging left advances", `${first} → ${second}`);

  // Back the other way.
  await drag(box.width * 0.45);
  check(
    (await cardIndex(page)) === first,
    "dragging right goes back",
    `${second} → ${await cardIndex(page)}`,
  );

  // The rating row is untouched by any of it: nothing was rated, so the
  // session streak is still zero and the deck length has not changed.
  const body = await page.locator("body").innerText();
  check(!/streak/i.test(body), "no rating happened — swipe navigates, it does not judge");

  // A tap still flips.
  const beforeFlip = await page.locator("body").innerText();
  await card.tap();
  await page.waitForTimeout(700);
  const afterFlip = await page.locator("body").innerText();
  check(beforeFlip !== afterFlip, "a tap still flips the card");

  // And that tap revealed the arrows, because touch has no hover.
  const next = page.getByRole("button", { name: "Next card" });
  check(
    await opacityOf(next) > 0.9,
    "tapping reveals the arrows on a touch screen",
    `opacity ${await opacityOf(next)}`,
  );
  await page.screenshot({ path: `${OUT}/flashcard-touch.png` });

  await page.close();
}

await browser.close();
console.log(
  `\n${problems.length === 0 ? "flashcard navigation smoke passed" : `${problems.length} problem(s)`}`,
);
for (const p of problems) console.log(`  - ${p}`);
process.exit(problems.length === 0 ? 0 : 1);

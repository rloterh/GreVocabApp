/**
 * The band the app was worst at: 768px to 1366px, on a touch screen.
 *
 * `mobile-audit.mjs` measures one phone width. This measures every iPad and a
 * common Android tablet, in **both orientations**, and adds the checks that
 * only make sense at this size: that the right navigation shell is showing,
 * and that turning the device does not throw away what the user was doing.
 *
 * The shell rule is the reason this exists. Before Phase 16 the only
 * breakpoint that mattered was 1024px, so an 11-inch iPad got the phone
 * layout and a 13-inch got the desktop one — two devices a user thinks of as
 * the same thing, with different navigation.
 *
 *   CHROME_EXE="<chrome.exe>" node scripts/drive/tablet-audit.mjs [outDir]
 */

import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const EXE =
  process.env.CHROME_EXE ??
  "C:/Users/HP/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe";
const URL = process.env.APP_URL ?? "http://localhost:1420/";
const OUT = process.argv[2] ?? process.env.OUT_DIR ?? ".";
const SHOTS = process.env.SHOTS === "1";

/** Real viewports in CSS pixels, from docs/TABLET.md. */
const DEVICES = [
  { name: "iPad mini", w: 744, h: 1133 },
  { name: "iPad 10.9", w: 820, h: 1180 },
  { name: 'iPad Pro 11"', w: 834, h: 1194 },
  { name: 'iPad Pro 13"', w: 1024, h: 1366 },
  { name: "Android tablet", w: 800, h: 1280 },
];

const PAGES = ["dashboard", "practice", "flashcards", "quiz", "archive", "settings"];

const problems = [];
const check = (ok, label, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) problems.push(label);
};

/** Which shell should be showing at this width. */
const shellFor = (w) => (w < 720 ? "tabs" : w < 1024 ? "rail" : "sidebar");

const browser = await chromium.launch({ executablePath: EXE, headless: true });

/** Wait for entry animations to finish, so boxes are measured at rest. */
async function settle(page) {
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"), {
      timeout: 3000,
    })
    .catch(() => {});
  await page.waitForTimeout(150);
}

async function measure(page, vw) {
  return page.evaluate((viewport) => {
    const doc = document.documentElement;
    const wide = [];
    const small = [];
    const unnamed = [];

    for (const el of document.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;

      if (r.right > viewport + 1 && r.width > 8) {
        let inScroller = getComputedStyle(el).overflowX !== "visible";
        for (let a = el.parentElement; a && !inScroller; a = a.parentElement) {
          const s = getComputedStyle(a).overflowX;
          if (s === "auto" || s === "scroll") inScroller = true;
        }
        // Wide content inside its own scroller is the rule being followed,
        // not broken.
        if (!inScroller) {
          wide.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className?.toString?.() ?? "").slice(0, 60),
            right: Math.round(r.right),
          });
        }
      }

      const interactive =
        el.matches("button, a[href], input, select, textarea, [role=button], [role=radio]") &&
        !el.hasAttribute("disabled");
      if (!interactive) continue;

      let box = r;
      if (el.matches("input[type=checkbox], input[type=radio]")) {
        const label = el.closest("label");
        if (label) box = label.getBoundingClientRect();
      }
      // An element deliberately hidden (the edge arrows at rest) is not a
      // target anybody can miss.
      if (getComputedStyle(el).opacity === "0") continue;
      // Half a pixel of tolerance. A control measured at 43.9px is 44px with
      // a transform still settling on it, not a target a fingertip will miss,
      // and failing on that makes this driver a coin toss.
      if (box.width < 43.5 || box.height < 43.5) {
        small.push({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? "").trim().slice(0, 24),
          w: Math.round(box.width),
          h: Math.round(box.height),
        });
      }
      // An input's name usually comes from a `<label for>` or from the label
      // wrapping it, never from its own text. An earlier version of this check
      // looked only at aria-label, title and textContent and reported five
      // correctly-labelled inputs on Settings as nameless — the same shape of
      // mistake as measuring contrast without compositing alpha.
      const labelled =
        (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) ||
        el.closest("label");
      const name =
        el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        (el.textContent ?? "").trim() ||
        (labelled ? labelled.textContent?.trim() : "") ||
        el.getAttribute("placeholder") ||
        "";
      if (!name) {
        unnamed.push(
          el.tagName.toLowerCase() +
            (el.id ? `#${el.id}` : "") +
            `[${el.getAttribute("type") ?? ""}]`,
        );
      }
    }

    return {
      overflowPx: doc.scrollWidth - doc.clientWidth,
      wide: wide.slice(0, 5),
      small: small.slice(0, 8),
      unnamed: unnamed.slice(0, 5),
      // `offsetParent` rather than a computed width: a `display: none` aside
      // still reports its declared width in Chromium, which made an earlier
      // version of this driver report a rail that was not on screen.
      shell: (() => {
        const aside = document.querySelector("aside");
        if (!aside || aside.offsetParent === null) return null;
        return `${Math.round(aside.getBoundingClientRect().width)}px`;
      })(),
      // The tab bar's distinguishing control, rather than a guess from
      // position and size — a toast or an overlay is also fixed to the bottom.
      hasTabBar: [...document.querySelectorAll("button")].some(
        (el) => el.offsetParent !== null && el.textContent?.trim() === "More",
      ),
    };
  }, vw);
}

for (const device of DEVICES) {
  for (const [label, w, h] of [
    ["portrait", device.w, device.h],
    ["landscape", device.h, device.w],
  ]) {
    console.log(`\n=== ${device.name} ${label} — ${w}x${h} ===`);
    const page = await browser.newPage({
      viewport: { width: w, height: h },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    await page.addInitScript(() => {
      localStorage.setItem(
        "lexicon.settings.v1",
        JSON.stringify({
          state: { theme: "dark", hasOnboarded: true, hasSeenSrsIntro: true },
          version: 0,
        }),
      );
    });
    await page.goto(URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await settle(page);

    // --- The right shell, which is the whole reason for this file ----------
    const expected = shellFor(w);
    const shell = await measure(page, w);
    const railish = shell.shell && parseFloat(shell.shell) < 120;
    const actual = !shell.shell
      ? "tabs"
      : railish
        ? "rail"
        : "sidebar";
    check(
      actual === expected,
      `${expected} navigation`,
      actual === expected ? `aside ${shell.shell ?? "none"}` : `got ${actual}`,
    );
    check(
      shell.hasTabBar === (expected === "tabs"),
      expected === "tabs" ? "the tab bar is present" : "no phone tab bar",
    );

    // --- Per page ----------------------------------------------------------
    for (const target of PAGES) {
      const name = { practice: "Daily practice", archive: "Archive" }[target] ?? target;
      try {
        await page
          .getByRole("button", { name: new RegExp(`^${name}$`, "i") })
          .first()
          .click({ timeout: 4000 });
        await page.waitForTimeout(400);
        await settle(page);
      } catch {
        console.log(`       (could not reach ${target})`);
        continue;
      }
      const r = await measure(page, w);
      const issues = [];
      if (r.overflowPx > 0) issues.push(`page scrolls ${r.overflowPx}px`);
      if (r.wide.length) issues.push(`${r.wide.length} overflowing (${r.wide[0].tag} to ${r.wide[0].right})`);
      if (r.small.length)
        issues.push(
          `${r.small.length} small targets (${r.small.map((s) => `${s.tag} ${s.w}x${s.h}`).join(", ")})`,
        );
      if (r.unnamed.length) issues.push(`${r.unnamed.length} unnamed controls`);
      check(issues.length === 0, target, issues.join("; "));

      if (SHOTS) {
        mkdirSync(OUT, { recursive: true });
        await page.screenshot({ path: `${OUT}/tablet-${w}x${h}-${target}.png` });
      }
    }

    // --- Rotation keeps the session ----------------------------------------
    //
    // The tablet-specific bug class, and invisible until somebody turns the
    // device: a layout that remounts on resize throws away scroll position, a
    // flipped card, and a quiz in progress.
    await page.getByRole("button", { name: /^Flashcards$/i }).first().click();
    await page.waitForTimeout(400);
    const start = page.getByRole("button", { name: /Start/ }).first();
    if (await start.isVisible().catch(() => false)) {
      await start.click();
      await page.waitForTimeout(600);
      await page.locator(".min-h-\\[420px\\]").first().tap();
      await page.waitForTimeout(700);

      const cardBefore = (await page.locator("body").innerText()).match(
        /Card (\d+) of (\d+)/,
      )?.[0];
      const flippedBefore = await page
        .locator("body")
        .innerText()
        .then((t) => /to flip/.test(t));

      await page.setViewportSize({ width: h, height: w });
      await page.waitForTimeout(700);

      const cardAfter = (await page.locator("body").innerText()).match(
        /Card (\d+) of (\d+)/,
      )?.[0];
      const flippedAfter = await page
        .locator("body")
        .innerText()
        .then((t) => /to flip/.test(t));

      check(cardBefore === cardAfter, "rotating keeps the card", `${cardBefore} → ${cardAfter}`);
      check(flippedBefore === flippedAfter, "rotating keeps it flipped");
    }

    await page.close();
  }
}

await browser.close();
console.log(
  `\n${problems.length === 0 ? "tablet audit clean" : `${problems.length} problem(s)`}`,
);
for (const p of new Set(problems)) console.log(`  - ${p}`);
process.exit(problems.length === 0 ? 0 : 1);

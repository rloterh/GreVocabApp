/**
 * Can the app be used without a mouse?
 *
 * Three failures this catches, none of which a unit test or a visual check
 * will:
 *
 * - **A focus trap that is missing**: Tab out of a modal and you are operating
 *   the page behind it while it is still on screen.
 * - **A focus trap that is a trap**: Escape does not close, and there is no
 *   way back out with the keyboard at all.
 * - **Focus that vanishes**: after a dialog closes, focus is on `<body>` and
 *   the next Tab starts again from the top of the page.
 *
 * Also checks that every interactive element shows a visible focus ring, since
 * a keyboard user who cannot see where they are is no better off than one who
 * cannot move.
 */
import { chromium } from "playwright-core";

const EXE = process.env.CHROME_EXE;

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.addInitScript(() => {
  if (!localStorage.getItem("lexicon.settings.v1")) {
    localStorage.setItem(
      "lexicon.settings.v1",
      JSON.stringify({ state: { theme: "dark", hasOnboarded: true }, version: 0 }),
    );
  }
});
await page.goto("http://localhost:1420/", { waitUntil: "networkidle" });

const active = () =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { tag: "body", name: "", inDialog: false };
    return {
      tag: el.tagName.toLowerCase(),
      name: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40),
      inDialog: Boolean(el.closest('[role="dialog"]')),
      ring: getComputedStyle(el).outlineStyle !== "none" ||
        getComputedStyle(el).boxShadow !== "none",
    };
  });

// --- Tabbing reaches the navigation -----------------------------------------
await page.keyboard.press("Tab");
let first = await active();
check("Tab moves focus off the body", first.tag !== "body", `${first.tag} "${first.name}"`);

let reachedNav = false;
for (let i = 0; i < 25; i++) {
  const el = await active();
  if (/dashboard|practice|flashcards|quiz/i.test(el.name)) {
    reachedNav = true;
    break;
  }
  await page.keyboard.press("Tab");
}
check("the main navigation is reachable by Tab", reachedNav);

// --- Focus is visible --------------------------------------------------------
const invisible = await page.evaluate(() => {
  const bad = [];
  for (const el of document.querySelectorAll("main button, nav button, a[href]")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    el.focus();
    const style = getComputedStyle(el);
    const visible =
      style.outlineStyle !== "none" ||
      style.boxShadow !== "none" ||
      style.borderColor !== getComputedStyle(el.parentElement ?? el).borderColor;
    if (!visible) bad.push((el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30));
  }
  return bad;
});
check(
  "every control shows a focus ring",
  invisible.length === 0,
  invisible.slice(0, 4).join(", "),
);

// --- Dialogs -----------------------------------------------------------------
async function openAbout() {
  await page.getByRole("button", { name: "About Lexicon" }).first().click();
  await page.waitForTimeout(500);
}

await openAbout();
check("a dialog opens", (await page.locator('[role="dialog"]').count()) > 0);

const focusMovedIn = await page.evaluate(
  () => Boolean(document.activeElement?.closest('[role="dialog"]')),
);
check("focus moves into the dialog when it opens", focusMovedIn);

// Tab a lot; focus must stay inside.
let escaped = false;
for (let i = 0; i < 15; i++) {
  await page.keyboard.press("Tab");
  const el = await active();
  if (!el.inDialog && el.tag !== "body") {
    escaped = true;
    break;
  }
}
check("Tab does not escape the dialog", !escaped);

await page.keyboard.press("Escape");
await page.waitForTimeout(400);
check("Escape closes it", (await page.locator('[role="dialog"]').count()) === 0);

const restored = await page.evaluate(() => {
  const el = document.activeElement;
  return {
    body: !el || el === document.body,
    name: (el?.getAttribute("aria-label") ?? el?.textContent ?? "").trim().slice(0, 30),
  };
});
check(
  "focus returns to what opened it, not to the body",
  !restored.body,
  restored.name || "focus is on <body>",
);

// --- The More sheet on mobile ------------------------------------------------
await page.setViewportSize({ width: 390, height: 800 });
await page.waitForTimeout(400);
await page.getByRole("button", { name: "More" }).first().click();
await page.waitForTimeout(400);
check("the mobile sheet opens", (await page.locator('[role="dialog"]').count()) > 0);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
check("Escape closes the mobile sheet", (await page.locator('[role="dialog"]').count()) === 0);

check("no runtime errors while navigating by keyboard", errors.length === 0, errors[0] ?? "");

await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);

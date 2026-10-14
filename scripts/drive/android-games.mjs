/**
 * One round of every game, inside the real Android WebView.
 *
 * The release checklist (ROADMAP Phase 25) asks for a signed build on the
 * emulator with a round of every shipped game played on it. This attaches to
 * the installed app's WebView through adb, so it drives the app the store
 * build ships — embedded assets, Android WebView, phone layout — rather than
 * a desktop browser pretending to be a phone.
 *
 *   adb install -r <signed apk> && adb shell monkey -p com.lexicon.app 1
 *   OUT_DIR=./shots node scripts/drive/android-games.mjs
 *
 * Playwright's `connectOverCDP` cannot attach to a WebView ("Browser context
 * management is not supported"); its `_android` API can, and needs only the
 * adb server.
 *
 * Wrong answers are fine: what is checked is that every game reaches its
 * results with ten (or fifteen) answers, and that nothing throws.
 */

import { _android } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = process.env.OUT_DIR ?? null;
if (OUT) mkdirSync(OUT, { recursive: true });

const problems = [];
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) problems.push(label);
};

const [device] = await _android.devices();
if (!device) throw new Error("No Android device or emulator: is adb running?");
// Start from a fresh process, so a round left open by an earlier run is not
// sitting over the tab bar. Stored progress survives a force-stop.
await device.shell("am force-stop com.lexicon.app");
await device.shell("monkey -p com.lexicon.app -c android.intent.category.LAUNCHER 1");
const webview = await device.webView({ pkg: "com.lexicon.app" });
const page = await webview.page();
await page.waitForLoadState("load");
await page.waitForTimeout(2500);
// A WebView click that cannot land should fail in seconds, not hang a round.
page.setDefaultTimeout(8000);
const ONLY = process.env.ONLY ?? null;
const log = (...a) => process.env.VERBOSE && console.log("   ", ...a);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = async (name) => OUT && page.screenshot({ path: join(OUT, `android-${name}.png`) });

const ua = await page.evaluate(() => navigator.userAgent);
check(/Android/.test(ua) && /; wv\)/.test(ua), "this is the Android WebView", ua.match(/Android [\d.]+/)?.[0]);

// First launch: the start-date screens. Skip takes their defaults.
for (let i = 0; i < 6; i++) {
  const skip = page.getByRole("button", { name: "Skip", exact: true });
  if (!(await skip.isVisible().catch(() => false))) break;
  await skip.click();
  await page.waitForTimeout(800);
}

const stage = page.getByTestId("game-stage");
const toGames = async () => {
  await page.getByRole("button", { name: "Games", exact: true }).last().click();
  await page.waitForTimeout(900);
};
const pressPlay = async () => {
  await page.waitForFunction(
    () => [...document.querySelectorAll('[role="dialog"] button')].some((b) => b.textContent === "Play" && !b.disabled && b.getAttribute("aria-disabled") !== "true"),
    null,
    { timeout: 20000 },
  );
  await page.getByRole("dialog").getByRole("button", { name: "Play", exact: true }).click();
  await stage.waitFor({ timeout: 10000 });
};

/** Answer whatever the stage is asking until the results appear. */
async function playThrough(name) {
  const deadline = Date.now() + 8 * 60_000;
  let shotTaken = false;
  while (Date.now() < deadline) {
    if (await page.getByTestId("best-line").isVisible().catch(() => false)) return true;
    if (!shotTaken && (await stage.isVisible().catch(() => false))) {
      await page.waitForTimeout(700);
      await shot(`${name}-stage`);
      shotTaken = true;
    }
    const cont = stage.getByRole("button", { name: "Continue" });
    if (await cont.isVisible().catch(() => false)) {
      await cont.click();
    } else if ((await stage.locator('[aria-label="Words"] button:not([disabled])').count()) > 0) {
      const ids = await stage
        .locator('[aria-label="Words"] button:not([disabled])')
        .evaluateAll((els) => els.map((e) => e.getAttribute("data-pair")));
      for (const id of ids) {
        log("pair", id);
        await stage.locator(`[aria-label="Words"] [data-pair="${id}"]`).click();
        await stage.locator(`[aria-label="Meanings"] [data-pair="${id}"]`).click();
        await page.waitForTimeout(150);
      }
    } else if (await stage.locator("#spell-input:not([disabled])").isVisible().catch(() => false)) {
      await stage.locator("#spell-input").fill("zzzz");
      await page.keyboard.press("Enter");
    } else if ((await stage.locator('[aria-label="Letters"]').count()) > 0) {
      // Unscramble: no way to finish but the right word or the clock; wait.
      await page.waitForTimeout(1000);
      continue;
    } else {
      const option = stage.locator('[role="radiogroup"] button:not([disabled])').first();
      if (await option.isVisible().catch(() => false)) await option.click();
    }
    await page.waitForTimeout(450);
  }
  return false;
}

const GAMES = [
  ["Closest Meaning", "Standard"],
  ["Fact or Fiction", "Standard"],
  ["Opposites", "Standard"],
  ["Fill the Gap", "Standard"],
  ["Odd One Out", "Standard"],
  ["Match Up", "Standard"],
  ["Spell It", "Standard"],
  ["Unscramble", "Standard"],
  ["Picture It", "Play"],
];

await toGames();
await shot("hub");

// Leaving the app pauses a round. The Android WebView fires no
// visibilitychange, so this rests on MainActivity's lexicon:pause signal
// (src/lib/app-lifecycle.ts); before it, the clock ran behind the home screen.
if (!ONLY || ONLY === "Background pause") {
  const card = page.locator("section").filter({ hasText: "Closest Meaning" }).first();
  await card.getByRole("button", { name: "Standard", exact: true }).click();
  await pressPlay();
  await page.waitForFunction(
    () => [...document.querySelectorAll('[data-testid="game-stage"] [role="radiogroup"] button')].some((b) => !b.disabled),
  );
  await device.shell("input keyevent KEYCODE_HOME");
  await page.waitForTimeout(1500);
  await device.shell("monkey -p com.lexicon.app -c android.intent.category.LAUNCHER 1");
  await page.waitForTimeout(1500);
  check(await stage.getByText("Paused", { exact: true }).isVisible(), "leaving the app pauses the round");
  await stage.getByRole("button", { name: "Quit to Games" }).click();
  await page.waitForTimeout(600);
}
for (const [name, button] of GAMES) {
  if (ONLY && ONLY !== name) continue;
  log("start", name);
  await toGames();
  const card = page.locator("section").filter({ hasText: name }).first();
  await card.scrollIntoViewIfNeeded();
  await card.getByRole("button", { name: button, exact: true }).click();
  await pressPlay();
  const done = await playThrough(name.toLowerCase().replace(/\s+/g, "-"));
  check(done, `${name}: a full round reaches its results`);
  if (!done) continue;
  const line = await page.locator("main").innerText();
  const counted = name === "Match Up" ? /of 15/.test(line) : /of 10/.test(line);
  check(counted, `${name}: the results count every answer`);
  await shot(`${name.toLowerCase().replace(/\s+/g, "-")}-results`);
}

// The Daily Round, from its card on the hub.
if (!ONLY || ONLY === "Daily Round") {
await toGames();
await page.getByTestId("daily-card").getByRole("button").filter({ hasText: /Play/ }).first().click();
await pressPlay();
check(await playThrough("daily"), "Daily Round: a full round reaches its results");
await shot("daily-results");
}

check(errors.length === 0, "no uncaught errors in the WebView", errors.slice(0, 3).join(" | "));
await device.close();
if (problems.length) {
  console.log(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log("\nAll clear.");

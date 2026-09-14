/**
 * Can you reach the primary action without scrolling?
 *
 * The complaint this answers: "users shouldn't scroll all the way down in
 * order to click the button to navigate, to start a section, or to go to next
 * or back." That is measurable — find the button that moves the user forward
 * on each screen, and check whether it is inside the viewport on arrival.
 *
 * Reports, per screen and viewport, how far below the fold the action sits.
 * A positive `below` is how many pixels of scrolling the user must do before
 * the primary action is even visible.
 *
 * Usage: `npm run dev` in one terminal, then
 *   node scripts/drive/reach-audit.mjs
 */
import { chromium } from "playwright-core";

const EXE =
  "C:/Users/HP/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe";
const URL = "http://localhost:1420/";
const OUT = process.argv[2] ?? ".";

/** Phone, small laptop, desktop. The middle one is where this usually bites. */
const VIEWPORTS = [
  { name: "phone   390x844", width: 390, height: 844 },
  { name: "laptop 1280x720", width: 1280, height: 720 },
  { name: "desktop 1920x1080", width: 1920, height: 1080 },
];

/**
 * Each screen, how to get there, and the action that moves you on.
 * `nav` is the sidebar/tab label; `action` is an accessible-name regex.
 */
const SCREENS = [
  { nav: "Flashcards", mobile: "Cards", action: /^Start studying$/ },
  { nav: "Quiz", mobile: "Quiz", action: /^Start quiz$|^Not enough words in pool$/ },
  { nav: "Exam", mobile: null, action: /^Start the exam$/ },
  { nav: "Sentences", mobile: null, action: /^Check my sentences$/ },
];

const word = (track, w, i) => ({
  id: `${track}-${w}`,
  word: w,
  partOfSpeech: "adjective",
  definition: `The quality of being ${w}.`,
  example: `A thoroughly ${w} affair.`,
  mnemonic: `Sounds like ${w}.`,
  synonyms: ["alpha", "beta"],
  antonyms: ["gamma"],
  _i: i,
});

const WORDS = [
  "abate", "cogent", "ephemeral", "laconic", "obdurate", "quixotic",
  "risible", "truculent", "venal", "zealous",
];

const MONTHS = {
  "gre/01": {
    track: "gre",
    ordinal: 1,
    title: "An alphabet of essentials",
    days: Array.from({ length: 10 }, (_, d) => ({
      day: d + 1,
      words: WORDS.slice(0, 3).map((w, i) => word("gre", `${w}${d}${i}`, i)),
    })),
  },
};

const browser = await chromium.launch({ executablePath: EXE });
const rows = [];

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
  });
  await page.addInitScript((months) => {
    localStorage.setItem(
      "lexicon.vocab.v1",
      JSON.stringify({
        state: {
          months,
          retiredWords: [],
          activeTrack: "gre",
          activeMonthKey: "gre/01",
          selectedDay: 1,
          schedules: {},
        },
        version: 2,
      }),
    );
    localStorage.setItem(
      "lexicon.settings.v1",
      JSON.stringify({ state: { hasOnboarded: true }, version: 0 }),
    );
  }, MONTHS);

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  for (const screen of SCREENS) {
    try {
      const label = vp.width < 720 && screen.mobile ? screen.mobile : screen.nav;
      let nav = page.getByRole("button", { name: label, exact: true });
      if ((await nav.count()) === 0) {
        // Below `rail` the extra destinations live behind More.
        const more = page.getByRole("button", { name: /^More$/ });
        if (await more.count()) {
          await more.first().click();
          await page.waitForTimeout(600);
        }
        nav = page.getByRole("button", { name: label, exact: true });
      }
      const target = nav;
      if ((await target.count()) === 0) {
        rows.push([vp.name, screen.nav, "unreachable", ""]);
        continue;
      }
      await target.first().click();
      await page.waitForTimeout(700);

      const action = page.getByRole("button", { name: screen.action }).first();
      if ((await action.count()) === 0) {
        rows.push([vp.name, screen.nav, "no action found", ""]);
        continue;
      }
      await page.screenshot({
        path: `${OUT}/${vp.width}-${screen.nav.replace(/\s+/g, "-")}.png`,
      });
      const box = await action.boundingBox();
      if (!box) {
        rows.push([vp.name, screen.nav, "action not visible", ""]);
        continue;
      }
      // How far past the bottom of the viewport the button's bottom edge sits.
      const below = Math.round(box.y + box.height - vp.height);
      const text = (await action.innerText()).replace(/\s+/g, " ").trim();
      rows.push([
        vp.name,
        screen.nav,
        below > 0 ? `SCROLL ${below}px` : "reachable",
        text.slice(0, 28),
      ]);
    } catch (error) {
      rows.push([vp.name, screen.nav, `error: ${String(error).slice(0, 40)}`, ""]);
    }
  }
  // The study session itself. "Go to next or back" lives here, and this is
  // where it bit hardest: the 2x2 rating grid ran under the mobile tab bar, so
  // "Good" and "Easy" were half-hidden behind the navigation on every card.
  try {
    const cards = vp.width < 720 ? "Cards" : "Flashcards";
    await page.getByRole("button", { name: cards, exact: true }).first().click();
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: /^Start studying$/ }).first().click();
    await page.waitForTimeout(800);
    await page.keyboard.press("Space"); // flip, so the ratings are live
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/${vp.width}-session.png` });

    for (const name of ["Again", "Hard", "Good", "Easy", "Next"]) {
      // Unanchored: a rating button's accessible name leads with its shortcut.
      const b = page.getByRole("button", { name: new RegExp(name) }).first();
      if ((await b.count()) === 0) {
        rows.push([vp.name, "session", `${name}: not found`, ""]);
        continue;
      }
      const box = await b.boundingBox();
      const below = box ? Math.round(box.y + box.height - vp.height) : 0;
      rows.push([
        vp.name,
        "session",
        below > 0 ? `SCROLL ${below}px` : "reachable",
        name,
      ]);
    }
  } catch (error) {
    rows.push([vp.name, "session", `error: ${String(error).slice(0, 40)}`, ""]);
  }

  await page.close();
}

await browser.close();

const w = [18, 16, 20, 30];
const line = (r) => r.map((c, i) => String(c).padEnd(w[i])).join(" ");
console.log(line(["viewport", "screen", "primary action", "label"]));
console.log("-".repeat(w.reduce((a, b) => a + b + 1, 0)));
let last = "";
for (const r of rows) {
  if (r[0] !== last) {
    console.log("");
    last = r[0];
  }
  console.log(line(r));
}
const bad = rows.filter((r) => String(r[2]).startsWith("SCROLL"));
console.log(`\n${bad.length} of ${rows.length} need scrolling to reach.`);

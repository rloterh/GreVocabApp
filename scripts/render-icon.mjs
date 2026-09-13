/**
 * Render public/icon.svg to a 1024px PNG for `tauri icon`.
 *
 * Tauri's icon generator reads rasters, not SVG, and this repo already carries
 * Playwright's Chromium for the browser drivers — so the renderer that will
 * actually draw the favicon is the one that draws the app icon. No new
 * dependency, and no chance of the two disagreeing.
 *
 *   node scripts/render-icon.mjs [out.png] [size]
 */

import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";

const OUT = process.argv[2] ?? "src-tauri/icons/source-1024.png";
const SIZE = Number(process.argv[3] ?? 1024);
const EXECUTABLE =
  process.env.CHROME_PATH ??
  "C:/Users/HP/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe";

const svg = readFileSync("public/icon.svg", "utf-8");

const browser = await chromium.launch({ executablePath: EXECUTABLE });
const page = await browser.newPage({
  viewport: { width: SIZE, height: SIZE },
  deviceScaleFactor: 1,
});

// Transparent page behind the artwork: the icon's own rounded square is the
// shape, and a white page would print a square halo into every corner.
await page.setContent(
  `<style>html,body{margin:0;padding:0;background:transparent}
   svg{display:block;width:${SIZE}px;height:${SIZE}px}</style>${svg}`,
);
const png = await page.screenshot({ omitBackground: true });
writeFileSync(OUT, png);
await browser.close();

console.log(`${OUT} — ${SIZE}x${SIZE}, ${(png.length / 1024).toFixed(1)} KB`);

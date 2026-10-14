/**
 * Share a file to the installed Android app from the Files app, the way a
 * person does, and check it was imported.
 *
 * Through the real share sheet rather than `am start`, because only a real
 * sharer can hand over the read grant: `adb shell` cannot grant access to a
 * MediaStore or documents URI it does not own, so a shell-sent intent fails
 * with a SecurityException that no user would ever see.
 *
 * Two arrivals, because the code path differs: a share that brings the
 * running app back to the front (`onNewIntent`, then `visibilitychange`), and
 * a share that starts it cold (`onCreate`, then the hook's first drain).
 *
 *   adb install -r <apk>      # built after `node scripts/android-prepare.mjs`
 *   ADB=<path to adb> node scripts/drive/android-share.mjs
 *
 * Native taps go through `uiautomator dump` and `input tap`, not Playwright's
 * Android driver, which would need its own helper app on the device.
 * See ROADMAP.md, Phase 9, and docs/MOBILE.md.
 */

import { _android } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PKG = "com.lexicon.app";
const ADB = process.env.ADB ?? "adb";
const problems = [];
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) problems.push(label);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (cmd) => execFileSync(ADB, ["shell", cmd], { encoding: "utf-8" });

/** Centre of the first on-screen node whose text or description matches. */
function find(re) {
  const xml = execFileSync(ADB, ["exec-out", "uiautomator", "dump", "/dev/tty"], { encoding: "utf-8" });
  for (const [node] of xml.matchAll(/<node [^>]*>/g)) {
    const label = `${node.match(/ text="([^"]*)"/)?.[1] ?? ""}|${node.match(/content-desc="([^"]*)"/)?.[1] ?? ""}`;
    const b = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (re.test(label) && b) return [(+b[1] + +b[3]) >> 1, (+b[2] + +b[4]) >> 1];
  }
  return null;
}
async function tap(re, { long = false, tries = 10 } = {}) {
  for (let i = 0; i < tries; i++) {
    const at = find(re);
    if (at) {
      sh(long ? `input swipe ${at[0]} ${at[1]} ${at[0]} ${at[1]} 900` : `input tap ${at[0]} ${at[1]}`);
      return;
    }
    await wait(500);
  }
  throw new Error(`nothing on screen matches ${re}`);
}

/** A one-word CSV in Downloads; the YYYY-MM in its name is its month. */
function stage(word, month) {
  const name = `share-${month}-${word}.csv`;
  const local = join(mkdtempSync(join(tmpdir(), "lexicon-share-")), name);
  writeFileSync(
    local,
    `word,partOfSpeech,definition,example,mnemonic,day\n${word},adjective,A test word shared from another app.,The ${word} arrived by share.,Shared.,1\n`,
  );
  execFileSync(ADB, ["push", local, `/sdcard/Download/${name}`]);
  return name;
}

/** Files → Download → long-press the file → Share → Lexicon. */
async function shareFromFiles(name) {
  // Start Files fresh at its root; a failed stop only means it was not running.
  try {
    sh("am force-stop com.google.android.documentsui");
  } catch {
    /* not running */
  }
  sh("am start -a android.intent.action.VIEW -d content://com.android.externalstorage.documents/root/primary -t vnd.android.document/root");
  await wait(2000);
  await tap(/^Download\|/);
  await wait(1500);
  await tap(new RegExp(name.replace(/\./g, "\\.")), { long: true });
  await wait(800);
  await tap(/\|Share$/);
  await wait(2000);
  await tap(/^Lexicon\|/);
}

const [device] = await _android.devices();
if (!device) throw new Error("No Android device or emulator: is adb running?");
async function page() {
  const webview = await device.webView({ pkg: PKG });
  const p = await webview.page();
  await p.waitForLoadState("load");
  return p;
}
const copies = (p, word) =>
  p.evaluate(
    (w) => ((localStorage.getItem("lexicon.vocab.v1") ?? "").match(new RegExp(`"word":"${w}"`, "g")) ?? []).length,
    word,
  );
async function waitForWord(p, word) {
  for (let i = 0; i < 30; i++) {
    if ((await copies(p, word).catch(() => 0)) > 0) return true;
    await wait(500);
  }
  return false;
}

sh("rm -f /sdcard/Download/share-*.csv /sdcard/Download/lexicon-share-*.csv");

// Warm: Lexicon is running in the background when the share arrives.
const warm = `warmshare${Date.now() % 100000}`;
const warmFile = stage(warm, "2031-05");
sh(`monkey -p ${PKG} -c android.intent.category.LAUNCHER 1`);
let p = await page();
await wait(2500);
sh("input keyevent KEYCODE_HOME");
await shareFromFiles(warmFile);
check(await waitForWord(p, warm), "Lexicon is in the share sheet, and a share to the running app is imported", warm);
const toast = await p.getByRole("status").innerText().catch(() => "");
check(/import|loaded|month/i.test(toast), "and the app says so, in a live region", toast.replace(/\s+/g, " ").slice(0, 100));

// Back to the app again: the inbox was drained, so nothing imports twice.
sh("input keyevent KEYCODE_HOME");
await wait(800);
sh(`monkey -p ${PKG} -c android.intent.category.LAUNCHER 1`);
await wait(2500);
check((await copies(p, warm)) === 1, "coming back to the app does not import it again", `${await copies(p, warm)} copies`);

// Cold: Lexicon is not running; the share starts it.
const cold = `coldshare${Date.now() % 100000}`;
const coldFile = stage(cold, "2031-06");
sh(`am force-stop ${PKG}`);
await shareFromFiles(coldFile);
await wait(2500);
p = await page();
check(await waitForWord(p, cold), "a share that starts the app is imported", cold);

sh("rm -f /sdcard/Download/share-*.csv");
await device.close();
if (problems.length) {
  console.log(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log("\nAll clear.");

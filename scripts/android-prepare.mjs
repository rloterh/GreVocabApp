#!/usr/bin/env node
/**
 * Put back everything `tauri android init` does not generate.
 *
 * `src-tauri/gen/android` is generated and untracked, so anything added to it
 * by hand disappears the next time it is regenerated — silently, and in ways
 * that do not fail the build. An unsigned release APK installs nowhere; a
 * missing drawable falls back to a generic system glyph. Neither says why.
 * Everything this project adds to that directory lives here instead, and this
 * script is safe to run repeatedly.
 *
 *   node scripts/android-prepare.mjs            # apply
 *   node scripts/android-prepare.mjs --check    # report, change nothing
 *
 * Run it after `tauri android init`, and before a release build. See
 * docs/MOBILE.md.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gradle = path.join(root, "src-tauri/gen/android/app/build.gradle.kts");
const properties = path.join(root, "src-tauri/gen/android/keystore.properties");
const resSource = path.join(root, "src-tauri/android-res");
const resTarget = path.join(root, "src-tauri/gen/android/app/src/main/res");

/** Tracked files copied into the generated `res/`, by path within it. */
const RESOURCES = ["drawable/ic_stat_lexicon.xml"];

const MARKER = "// lexicon:signing";

const SIGNING_BLOCK = `    ${MARKER}
    val keystoreProperties = Properties().apply {
        val f = rootProject.file("keystore.properties")
        if (f.exists()) f.inputStream().use { load(it) }
    }
    signingConfigs {
        create("release") {
            keystoreProperties.getProperty("storeFile")?.let {
                storeFile = file(it)
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }
`;

/**
 * Teach the generated project how to sign a release build.
 *
 * Credentials live in `src-tauri/gen/android/keystore.properties`, which is
 * already in that project's .gitignore. No keystore, no signing config, and
 * the release build still completes — unsigned, which is the right outcome
 * for a machine that has no business holding the release key.
 */
function applySigning(check) {
  const raw = readFileSync(gradle, "utf-8");
  // The generated file is CRLF on Windows. Normalise for matching and put the
  // endings back on write, so this does not rewrite every line as a side
  // effect of adding four.
  const crlf = raw.includes("\r\n");
  let source = crlf ? raw.split("\r\n").join("\n") : raw;

  if (source.includes(MARKER)) {
    console.log("ok   signing config already applied");
    reportKeystore();
    return;
  }
  if (check) {
    console.log("MISS signing config not applied");
    process.exitCode = 1;
    return;
  }

  // Insert the configs just inside `android {`, before `compileSdk`, so the
  // block is defined before the buildType that references it.
  const anchor = "android {\n";
  if (!source.includes(anchor)) {
    console.error("Could not find the `android {` block. Aborting.");
    process.exit(1);
  }
  source = source.replace(anchor, anchor + SIGNING_BLOCK);

  const release = '        getByName("release") {\n';
  if (!source.includes(release)) {
    console.error("Could not find the release build type. Aborting.");
    process.exit(1);
  }
  source = source.replace(
    release,
    release + '            signingConfig = signingConfigs.getByName("release")\n',
  );

  writeFileSync(gradle, crlf ? source.split("\n").join("\r\n") : source);
  console.log(`ok   signing config added to ${path.relative(root, gradle)}`);
  reportKeystore();
}

function reportKeystore() {
  console.log(
    existsSync(properties)
      ? "     keystore.properties found — release builds will be signed"
      : "     no keystore.properties — release builds will be unsigned;\n" +
          "     see docs/MOBILE.md to create one",
  );
}

/**
 * Copy tracked Android resources into the generated project.
 *
 * Only the notification small icon today, and it matters more than it looks:
 * without it the plugin falls back to `android.R.drawable.ic_dialog_info`, so
 * every reminder Lexicon posts wears a generic system glyph — and nothing
 * fails, so nobody finds out except the user.
 */
function applyResources(check) {
  let changed = 0;
  let stale = 0;

  for (const rel of RESOURCES) {
    const from = path.join(resSource, rel);
    const to = path.join(resTarget, rel);
    if (!existsSync(from)) {
      console.error(`Missing source resource ${path.relative(root, from)}.`);
      process.exit(1);
    }
    const same =
      existsSync(to) &&
      readFileSync(to, "utf-8") === readFileSync(from, "utf-8");
    if (same) continue;
    if (check) {
      console.log(`MISS res/${rel} is absent or out of date`);
      stale += 1;
      continue;
    }
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
    changed += 1;
  }

  if (stale) process.exitCode = 1;
  else if (changed) console.log(`ok   copied ${changed} resource(s) into res/`);
  else console.log("ok   resources already up to date");
}

/**
 * Permissions the generated manifest lacks.
 *
 * VIBRATE, so the games' haptic feedback reaches the motor: without it an
 * Android WebView ignores `navigator.vibrate` without a word, which is
 * exactly the kind of failure nobody finds. Normal-protection, so it is
 * granted at install and never prompts.
 */
const PERMISSIONS = ["android.permission.VIBRATE"];

function applyPermissions(check) {
  const manifest = path.join(root, "src-tauri/gen/android/app/src/main/AndroidManifest.xml");
  if (!existsSync(manifest)) {
    console.error(`No manifest at ${path.relative(root, manifest)}.`);
    process.exit(1);
  }
  let source = readFileSync(manifest, "utf-8");
  const missing = PERMISSIONS.filter((p) => !source.includes(`android:name="${p}"`));
  if (missing.length === 0) {
    console.log("ok   permissions already declared");
    return;
  }
  if (check) {
    for (const p of missing) console.log(`MISS ${p} not declared`);
    process.exitCode = 1;
    return;
  }
  const anchor = source.match(/<manifest[^>]*>\r?\n/);
  if (!anchor) {
    console.error("Could not find the <manifest> element. Aborting.");
    process.exit(1);
  }
  const eol = anchor[0].endsWith("\r\n") ? "\r\n" : "\n";
  const lines = missing.map((p) => `    <uses-permission android:name="${p}" />${eol}`).join("");
  source = source.replace(anchor[0], anchor[0] + lines);
  writeFileSync(manifest, source);
  console.log(`ok   declared ${missing.join(", ")}`);
}

/**
 * Tracked Kotlin copied into the generated source.
 *
 * `ShareActivity.kt` receives files shared from other apps — the share
 * sheet's half of the import path (src-tauri/src/share.rs is the other).
 * `MainActivity.kt` tells the page when the app pauses and resumes, which the
 * WebView does not (src/lib/app-lifecycle.ts). `tauri android init` knows
 * nothing about either, and would regenerate MainActivity without it.
 */
const SOURCES = [
  {
    from: "src-tauri/android-src/MainActivity.kt",
    to: "src-tauri/gen/android/app/src/main/java/com/lexicon/app/MainActivity.kt",
  },
  {
    from: "src-tauri/android-src/ShareActivity.kt",
    to: "src-tauri/gen/android/app/src/main/java/com/lexicon/app/ShareActivity.kt",
  },
];

function applySources(check) {
  let changed = 0;
  let stale = 0;
  for (const { from, to } of SOURCES) {
    const source = path.join(root, from);
    const target = path.join(root, to);
    const same = existsSync(target) && readFileSync(target, "utf-8") === readFileSync(source, "utf-8");
    if (same) continue;
    if (check) {
      console.log(`MISS ${path.basename(to)} is the generated one, not ${from}`);
      stale += 1;
      continue;
    }
    copyFileSync(source, target);
    changed += 1;
  }
  if (stale) process.exitCode = 1;
  else if (changed) console.log(`ok   copied ${changed} source file(s)`);
  else console.log("ok   sources already up to date");
}

/**
 * The share sheet: offer Lexicon for the file types it imports.
 *
 * Declared on its own ShareActivity, not on MainActivity: the share sheet
 * launches with NEW_DOCUMENT | MULTIPLE_TASK, and a running singleTask
 * MainActivity is then brought forward without the intent ever being
 * delivered. See ShareActivity.kt.
 *
 * Deliberately not `text/plain` — that would list Lexicon for every shared
 * sentence and link, which is noise. `application/octet-stream` is there
 * because that is what most file managers call an Anki `.apkg`.
 */
const SHARE_MARKER = "<!-- lexicon:share-activity -->";
const SHARE_TYPES = [
  "application/json",
  "text/csv",
  "text/comma-separated-values",
  "application/octet-stream",
  "application/zip",
];

function applyShareTarget(check) {
  const manifest = path.join(root, "src-tauri/gen/android/app/src/main/AndroidManifest.xml");
  let source = readFileSync(manifest, "utf-8");
  if (source.includes(SHARE_MARKER)) {
    console.log("ok   share activity already declared");
    return;
  }
  if (check) {
    console.log("MISS share activity not declared");
    process.exitCode = 1;
    return;
  }
  const anchor = source.match(/[ \t]*<\/application>/);
  if (!anchor) {
    console.error("Could not find </application>. Aborting.");
    process.exit(1);
  }
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const block = [
    `        ${SHARE_MARKER}`,
    "        <activity",
    '            android:name=".ShareActivity"',
    '            android:exported="true"',
    '            android:excludeFromRecents="true"',
    '            android:noHistory="true"',
    '            android:theme="@android:style/Theme.NoDisplay">',
    "            <intent-filter>",
    '                <action android:name="android.intent.action.SEND" />',
    '                <action android:name="android.intent.action.SEND_MULTIPLE" />',
    '                <category android:name="android.intent.category.DEFAULT" />',
    ...SHARE_TYPES.map((t) => `                <data android:mimeType="${t}" />`),
    "            </intent-filter>",
    "        </activity>",
  ].join(eol);
  source = source.replace(anchor[0], block + eol + anchor[0]);
  writeFileSync(manifest, source);
  console.log("ok   share activity declared");
}

function main() {
  if (!existsSync(gradle)) {
    console.error(
      `No generated Android project at ${path.relative(root, gradle)}.\n` +
        "Run `npx tauri android init` first.",
    );
    process.exit(1);
  }
  const check = process.argv.includes("--check");
  applySigning(check);
  applyResources(check);
  applyPermissions(check);
  applySources(check);
  applyShareTarget(check);
}

main();

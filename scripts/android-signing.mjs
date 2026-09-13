#!/usr/bin/env node
/**
 * Teach the generated Android project how to sign a release build.
 *
 * `src-tauri/gen/android` is generated and untracked, so the signing block
 * cannot simply be committed — `tauri android init` would wipe it, and the
 * next person would find `assembleRelease` producing an APK no device will
 * install, with nothing in the repo explaining why. This script puts the
 * block back, and is safe to run repeatedly.
 *
 * Credentials live in `src-tauri/gen/android/keystore.properties`, which is
 * already in that project's .gitignore. No keystore, no signing config, and
 * the release build still completes — unsigned, which is the right outcome
 * for a machine that has no business holding the release key.
 *
 *   node scripts/android-signing.mjs            # apply
 *   node scripts/android-signing.mjs --check    # report, change nothing
 *
 * See docs/MOBILE.md for generating the keystore.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gradle = path.join(
  root,
  "src-tauri/gen/android/app/build.gradle.kts",
);
const properties = path.join(root, "src-tauri/gen/android/keystore.properties");

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

function main() {
  const check = process.argv.includes("--check");

  if (!existsSync(gradle)) {
    console.error(
      `No generated Android project at ${path.relative(root, gradle)}.\n` +
        "Run `npx tauri android init` first.",
    );
    process.exit(1);
  }

  const raw = readFileSync(gradle, "utf-8");
  // The generated file is CRLF on Windows. Normalise for matching and put the
  // endings back on write, so this does not rewrite every line as a side
  // effect of adding four.
  const crlf = raw.includes("\r\n");
  let source = crlf ? raw.split("\r\n").join("\n") : raw;

  if (source.includes(MARKER)) {
    console.log("Signing config already applied.");
    reportKeystore();
    return;
  }
  if (check) {
    console.log("Signing config NOT applied. Run without --check to add it.");
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

  // Point the release build type at it.
  const release = '        getByName("release") {\n';
  if (!source.includes(release)) {
    console.error("Could not find the release build type. Aborting.");
    process.exit(1);
  }
  source = source.replace(
    release,
    release +
      '            signingConfig = signingConfigs.getByName("release")\n',
  );

  writeFileSync(gradle, crlf ? source.split("\n").join("\r\n") : source);
  console.log(`Applied signing config to ${path.relative(root, gradle)}.`);
  reportKeystore();
}

function reportKeystore() {
  if (existsSync(properties)) {
    console.log("keystore.properties found — release builds will be signed.");
  } else {
    console.log(
      "No keystore.properties — release builds will be unsigned.\n" +
        "See docs/MOBILE.md to create one.",
    );
  }
}

main();

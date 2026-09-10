/**
 * Wrapper around the Tauri CLI that finds cargo even when the shell cannot.
 *
 * rustup adds ~/.cargo/bin to the *persisted* PATH, so a shell opened before
 * Rust was installed never sees it. Tauri then fails with
 *
 *   failed to run 'cargo metadata' … program not found
 *
 * which names the symptom and not the cause, and sends people looking for a
 * broken Rust install that is in fact fine. Restarting the terminal fixes it,
 * but only once you know that — so this looks in the standard location itself
 * and, if Rust genuinely is missing, says so in those words.
 *
 * Used by the tauri/tauri:dev/tauri:build npm scripts. Forwards every argument
 * and the exit code untouched.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { delimiter, join } from "node:path";

const WINDOWS = platform() === "win32";
const CARGO_BIN = join(homedir(), ".cargo", "bin");
const CARGO_EXE = join(CARGO_BIN, WINDOWS ? "cargo.exe" : "cargo");

/** Can cargo be run with this environment? */
function cargoRuns(env) {
  const result = spawnSync("cargo", ["--version"], {
    env,
    shell: true,
    stdio: "ignore",
  });
  return result.status === 0;
}

const env = { ...process.env };

if (!cargoRuns(env)) {
  if (existsSync(CARGO_EXE)) {
    // Rust is installed; this shell just predates it.
    env.PATH = CARGO_BIN + delimiter + (env.PATH ?? env.Path ?? "");
    console.log(
      `[tauri] cargo was not on PATH; using ${CARGO_BIN} for this run.\n` +
        "[tauri] Open a new terminal and this notice goes away.",
    );
  } else {
    console.error(
      [
        "",
        "Rust is required to build the desktop app, and cargo was not found.",
        "",
        `  Looked on PATH, and in ${CARGO_BIN}`,
        "",
        "Install it with https://rustup.rs (or `winget install Rustlang.Rustup`),",
        "then open a new terminal. On Windows you also need the Visual Studio",
        "Build Tools with the C++ workload for the linker.",
        "",
        "The web app does not need any of this: `npm run dev`.",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }
}

const result = spawnSync("tauri", process.argv.slice(2), {
  env,
  shell: true,
  stdio: "inherit",
});

// A signal (Ctrl+C) leaves status null; report it as a failure rather than 0.
process.exit(result.status ?? 1);

# Desktop

Windows, macOS and Linux from the same Rust binary. Windows is the platform
this has actually been built and run on; the other two are configured for and
untested, which this document says rather than implies.

## What desktop has that mobile does not

Four things are `#[cfg(desktop)]` and are the reason a desktop build is not
just "the web app in a window":

- **A tray icon**, so the app can be closed to the tray rather than quit.
- **A global shortcut**, `Ctrl+Shift+L`, which opens today's practice from
  anywhere. Registration failure is not fatal — another app may already hold
  the combination — and it logs rather than aborts.
- **The watched folder.** Drop a vocabulary file in and it loads. Android's
  scoped storage makes this the wrong model there; see MOBILE.md.
- **The OS keychain** for the Anthropic API key, so it is encrypted at rest and
  never in the settings blob a backup would export.

## Building on Windows

```bash
npm run tauri:build
```

That is the whole command. It runs `npm run build` first (see
`beforeBuildCommand`), compiles the Rust in release, and then bundles. Expect
six to eight minutes cold, and note that the Rust half is a *release* build —
`npm run tauri dev` is the fast path while working.

You need:

- **rustup**, and the `x86_64-pc-windows-msvc` target (the host default).
- **Visual Studio Build Tools with the C++ workload**, for the linker. This is
  the requirement people miss; cargo's error names the linker, not the missing
  installer.
- Nothing else. The CLI downloads WiX and NSIS itself on the first bundle, into
  `%LOCALAPPDATA%\tauri`, so the first run of this command needs a network and
  later ones do not.

If cargo is not found, `npm run tauri:build` goes through
[`scripts/tauri.mjs`](../scripts/tauri.mjs), which looks in `~/.cargo/bin`
before giving up — rustup adds that to the *persisted* PATH, so a shell opened
before Rust was installed never sees it.

## What comes out

| Artifact | Path under `src-tauri/target/release/` | Size |
| --- | --- | --- |
| Portable executable | `lexicon.exe` | ~20 MB |
| Installer (per-user) | `bundle/nsis/Lexicon_<version>_x64-setup.exe` | ~5.5 MB |
| Installer (per-machine) | `bundle/msi/Lexicon_<version>_x64_en-US.msi` | ~7.3 MB |

**Which installer to hand someone.** The NSIS `-setup.exe` installs for the
current user and needs no administrator rights, which is the friendlier default
and the one to publish. The MSI installs per machine and therefore prompts for
elevation; it exists because group policy and deployment tooling want an MSI,
not because it is the better choice for a person.

The bare `lexicon.exe` runs without installing anything, but "portable" only
describes the binary — settings and progress still live in the usual per-user
app-data directory, not beside the exe.

**WebView2.** The app renders in the system WebView2, which ships with Windows
11 and current Windows 10. Where it is missing, the installers download the
bootstrapper silently. That is the one case where installing needs a network.

## Signing, and the warning you get without it

Both installers are **unsigned**, so Windows SmartScreen shows "Windows
protected your PC" on first run, and the user has to choose *More info → Run
anyway*. Nothing is wrong; the binary simply has no reputation.

The only real fix is an Authenticode code-signing certificate — an OV
certificate clears the warning slowly as downloads accumulate reputation, an EV
certificate clears it immediately. Both cost money annually and require
identity verification, so this is a decision to make before a public release
rather than a build flag to flip. Tauri signs via
`bundle.windows.certificateThumbprint` once a certificate is installed.

Until then, publishing a SHA-256 of each artifact alongside it is the honest
substitute: it does not stop the warning, but it lets someone verify they have
what was built.

## Verified

On Windows 11, 2026-09-14, from a clean `npm run tauri:build`:

- `lexicon.exe` launches, and the window is the **desktop** layout — sidebar
  rather than the mobile tab bar.
- The tray icon registers and carries the app mark.
- Both bundles are produced, and the MSI reads back as a valid installer
  package with the right `ProductName`, `ProductVersion` and `UpgradeCode`
  (the last is what lets a later version upgrade in place rather than install
  beside it).

## macOS and Linux

Configured, never built. `bundle.targets` is `"all"`, so the same command
produces `.dmg`/`.app` on macOS and `.deb`/`.rpm`/`.AppImage` on Linux, on
those platforms — Tauri does not cross-compile bundles. macOS additionally
needs an Apple Developer account for notarisation, without which Gatekeeper
refuses the app outright rather than merely warning. Treat both as unstarted
work, not as "should just work".

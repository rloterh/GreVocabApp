# Mobile

Android first, iOS designed for but not buildable here. Plus the responsive work
that both need, which also improves the web app on a narrow window.

## The constraint, first

**iOS cannot be built or submitted without a Mac and a paid Apple Developer
account.** Xcode is macOS-only; there is no cross-compilation path, no CI
substitute that avoids the account, and no way around the $99/yr fee for
distribution. Neither is available for this project today.

So: the layout work, the platform abstraction and the capability detection are
all written to serve both. The Android toolchain, build and store submission are
real work in this plan. iOS is specified in enough detail that it becomes a
short phase the day a Mac exists — and is not pretended to be closer than that.

See [adr/0004-android-first.md](./adr/0004-android-first.md).

## Responsive layout

The app is currently desktop-shaped: a fixed 240px sidebar, content beside it.
Below roughly 1024px that is wrong, and below 640px it is unusable.

### The shell

One responsive shell, not a parallel set of mobile components:

```
lg and up          below lg
┌────┬─────────┐   ┌───────────┐
│ nav│ content │   │  content  │
│    │         │   │           │
│    │         │   ├───────────┤
└────┴─────────┘   │ ▣ ▤ ▥ ▦ ▧ │  bottom tabs, safe-area padded
                   └───────────┘
```

Five tabs below `lg` — Dashboard, Practice, Flashcards, Quiz, More — with the
remaining destinations behind More. The sidebar's ten entries do not fit a
thumb-reachable bar, and choosing which five earn a tab is a product decision
recorded here: the five are the things a user does *daily*.

### Per-screen work

| Screen | What breaks below `sm` | Fix |
| --- | --- | --- |
| Dashboard | 4-column stat grid | 2×2, then single column |
| Flashcards | card is fine; rating row is 4 across | 2×2 grid, larger targets |
| Quiz | option rows too tight | full-width stacked, 48px min |
| Progress | year heatmap is 53 columns wide | horizontal scroll in its own container, never the page |
| Settings | fine | verify inputs are not zoomed into on iOS (16px min font) |
| Archive | 2-col month grid | single column |
| WordDetail / dialogs | fixed max-width, can exceed viewport | full-screen sheet below `sm` |

### Rules

- **Touch targets ≥ 44×44 CSS px.** The rating buttons and quiz options are the
  offenders today.
- **Safe areas.** `env(safe-area-inset-*)` on the bottom bar and any fixed
  element. Android gesture navigation and iOS home indicators both need it.
- **No hover-only affordances.** The share button on Archive month cards is
  currently discoverable only by hovering; it becomes always-visible.
- **16px minimum font on inputs**, or iOS Safari zooms on focus.
- **The page never scrolls horizontally.** Wide content scrolls inside its own
  container. The heatmap is the only current offender.
- **Respect `prefers-reduced-motion`** — already wired through the
  `reduceMotion` setting; mobile makes it matter more.

All of this is verifiable in a browser at a phone viewport, so it lands and is
tested before any Android toolchain is involved.

## Android

### Toolchain

Tauri v2 Android needs, beyond what the desktop build already has:

- JDK 17
- Android Studio, or the command-line SDK tools
- Android SDK Platform 34+, NDK, and Build Tools
- `ANDROID_HOME` and `NDK_HOME` set
- Rust targets: `aarch64-linux-android`, `armv7-linux-androideabi`,
  `i686-linux-android`, `x86_64-linux-android`

Then `npm run tauri android init` generates `src-tauri/gen/android/`, which is
already gitignored and should stay that way — it is generated output.

### Platform differences to handle

- **The watched folder does not apply.** Android's scoped storage makes "watch a
  directory" the wrong model. The import path there is the system file picker
  and a share-target intent. `useWatchedFolder` already no-ops outside Tauri;
  it needs to no-op on Android specifically too.
- **Notifications need the plugin and a runtime permission.** `POST_NOTIFICATIONS`
  is required from Android 13. This is also what finally makes daily reminders
  work when the app is closed — see below.
- **The global shortcut and tray are desktop-only.** Already `#[cfg(desktop)]`,
  which covers this correctly.
- **Back button.** Android's system back must navigate within the app before
  exiting. Currently nothing handles it.
- **WebView versions vary.** Android System WebView is updatable but old devices
  lag. Target a floor and state it; `build.target` in `vite.config.ts` already
  handles the desktop side of this question.

### Store submission

- A signing keystore, kept out of the repo, documented in the release runbook.
- Privacy policy URL — required by Play even for an app that collects nothing.
  It says so, which is the easiest privacy policy anyone has ever written.
- Data safety form: declare no collection, no sharing. True today and must stay
  true, which is another reason the no-telemetry rule is load-bearing.
- Content rating questionnaire.
- Screenshots per form factor, feature graphic, short and full description.

## Reminders that actually fire

The current reminder only fires while the app is open, which is honest but not
very useful. On Android and desktop, `tauri-plugin-notification` supports
scheduled notifications that survive the app being closed. That is the real
implementation, and the existing `useStudyReminder` becomes the web fallback.

The schedule is set from the same Settings UI; the difference is invisible to
the user except that it starts working.

Web stays as-is. Making it work with the app closed needs a service worker and
push infrastructure, which means a backend — ruled out.

## iOS, when a Mac exists

Specified so the phase is short, not started:

- Xcode, a paid Apple Developer account, `aarch64-apple-ios` targets.
- `npm run tauri ios init`, then build and run on simulator or device.
- Safe-area handling is already in the responsive work.
- App Store review notes: the app makes network requests only to a provider the
  user configured with their own key. Expect a question about it; the answer is
  the consent dialog and the privacy policy.
- Screenshots at the required device sizes.

## Deliberately not doing

- **No separate mobile codebase.** One React app, one set of components,
  responsive. A second codebase would double every future feature.
- **No native navigation.** The bottom bar is our component. Native feel is not
  worth a platform-specific dependency here.
- **No tablet-specific layout in v1.0.** Tablets get the `lg` sidebar, which is
  correct and already works.

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
- **The action that moves you on is never below the fold.** A setup screen is a
  list of choices as long as the app has options, and the commit button was at
  the end of it: "Start studying" 200px past the bottom of a 1280x720 laptop,
  "Start quiz" 250px past a phone's. Worse, the flashcard rating grid ran
  *under* the tab bar, so "Good" and "Easy" were half-hidden on every card of
  every session. Anything that starts, advances or rates goes in a
  `StickyActionBar`, which clears the tab bar's 58px plus its safe-area padding
  and fades the content out behind it rather than slicing it.

All of this is verifiable in a browser at a phone viewport, so it lands and is
tested before any Android toolchain is involved.
`scripts/drive/reach-audit.mjs` does exactly that for the rule above, across
phone, laptop and desktop, and fails loudly when something drifts back below
the fold.

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
- **Back button and back gesture.** Handled by `useSystemBack`, over the
  History API: every navigation away from the dashboard pushes an entry, so
  back walks in before it exits. The button and the edge-swipe gesture both
  arrive through the same dispatch, so one implementation covers both.
  Verified on an Android 14 emulator against a release build: swiping in from
  either edge on Flashcards returns to the dashboard, and the same swipe on the
  dashboard exits to the launcher.
  *Predictive* back — the Android 14 animation that previews the destination
  while the thumb is still down — is **not** opted into. It requires
  `android:enableOnBackInvokedCallback="true"`, and that switch also stops the
  legacy `onBackPressed` dispatch the WebView relies on, so turning it on
  without a matching `OnBackInvokedCallback` in the activity would trade an
  animation for a back button that quits the app from any screen. Revisit when
  wry registers the callback itself.
- **WebView versions vary.** Android System WebView is updatable but old devices
  lag. Target a floor and state it; `build.target` in `vite.config.ts` already
  handles the desktop side of this question.

### Preparing the generated project

`src-tauri/gen/android` is generated and untracked, so anything added to it by
hand disappears when it is regenerated — silently, and in ways that do not fail
the build. `node scripts/android-prepare.mjs` puts it all back; it is
idempotent, and `--check` reports without changing anything. Run it after
`tauri android init` and before a release build. Today it does two things:
adds the release signing config, and copies `src-tauri/android-res` into the
project's `res/`.

### Signing

Credentials go in `src-tauri/gen/android/keystore.properties`, which that
project's `.gitignore` already covers. The keystore itself belongs outside the
repository:

```bash
keytool -genkeypair -v -keystore ../lexicon-release.jks -alias lexicon \
  -keyalg RSA -keysize 2048 -validity 10000
```

```properties
storeFile=C\:/path/to/lexicon-release.jks
storePassword=...
keyAlias=lexicon
keyPassword=...
```

With no `keystore.properties` the release build still completes, unsigned —
the right outcome on a machine that has no business holding the release key.

Building on Windows needs one workaround: Tauri symlinks the built `.so` into
`jniLibs/` and Windows refuses without developer mode, so the build stops after
the (slow) Rust compile has already succeeded. Copy the library across and let
Gradle finish:

```bash
npx tauri android build --target x86_64 --apk            # fails at the symlink
cp src-tauri/target/x86_64-linux-android/release/liblexicon_lib.so \
   src-tauri/gen/android/app/src/main/jniLibs/x86_64/
cd src-tauri/gen/android
./gradlew.bat assembleX86_64Release -x rustBuildX86_64Release
```

The `-x` is required: Gradle's own Rust task cannot find `npm.bat`, and the
compile it would run has already happened. Verify the result with
`apksigner verify --print-certs`.

Two things that will waste an afternoon if forgotten. The emulator is x86_64,
so an arm64 build installs and then fails to start. And the frontend is
embedded, brotli-compressed, inside the `.so` — rebuilding only the APK ships
the previous UI, and grepping the `.so` for a new string will not find it.

### Store submission

- A signing keystore, kept out of the repo — see above.
- Privacy policy URL — required by Play even for an app that collects nothing.
  It says so, which is the easiest privacy policy anyone has ever written.
- Data safety form: declare no collection, no sharing. True today and must stay
  true, which is another reason the no-telemetry rule is load-bearing.
- Content rating questionnaire.
- Screenshots per form factor, feature graphic, short and full description.

## Reminders that actually fire

Done, and verified on an Android 14 emulator on 2026-09-13. `useStudyReminder`
hands the reminder to the OS whenever `canScheduleNotifications()` is true, and
its `setInterval` is now the web-only fallback — running both would notify
twice on any day the app happened to be open at the right moment.

Three things about this were only discoverable by running it on a device.

**`sendNotification` does not talk to Rust.** The plugin's JS helper calls
`new window.Notification(...)` and relies on an init script having replaced
that global. When that indirection fails there is no error and no log line —
the command never appears in `adb logcat` at all. `scheduleDailyReminder`
invokes `plugin:notification|notify` by name instead, so a failure is a
rejected promise this code can catch and show.

**A repeating `at` schedule repeats at the wrong interval.** The obvious
payload is `{ at: { date, repeating: true } }`, and on Android the repeat
interval is computed as `date - now`. A reminder set at 18:00 for 19:00 repeats
hourly; one set at 18:59 repeats every minute. `dumpsys alarm` said
`repeatInterval=119840` for a reminder two minutes out. The fix is the calendar
*pattern* form, `{ interval: { hour, minute, second: 0 } }`, which the OS
re-arms for the same clock time each day.

**Asking for a permission you already hold hangs forever.** On Android 13+,
`NotificationPlugin.kt` has:

```kotlin
if (getPermissionState(LOCAL_NOTIFICATIONS) !== PermissionState.GRANTED) {
  requestPermissionForAlias(LOCAL_NOTIFICATIONS, invoke, "permissionsCallback")
}
```

with no `else`, so the already-granted case never resolves the invoke. Worse,
the unresolved request takes `notify` and `checkPermissions` down with it for
the rest of the process. The symptom is a reminder checkbox that will not stay
switched on and nothing in the log to say why.
`src/lib/notification-permission.ts` checks before it asks, which is both the
fix and the more polite order.

### The alarm is inexact, on purpose

`setExactAndAllowWhileIdle` needs `SCHEDULE_EXACT_ALARM`, which Android 14 does
not grant by default, and Play reserves `USE_EXACT_ALARM` for alarm clocks and
calendars. A vocabulary nudge is neither, so the plugin falls back to
`setAndAllowWhileIdle` and the system may hold the reminder for up to an hour.
That is the right trade here; the settings copy says "at or shortly after"
rather than promising a minute.

### Testing it on an emulator

`adb shell am force-stop` is the wrong way to simulate a closed app: it sets the
package's *stopped* flag, and Android drops broadcasts to stopped packages, so
the alarm fires and the notification never appears. Background the app with
`input keyevent KEYCODE_HOME` and kill it with `am kill` instead, then move the
clock with `adb root && adb shell date MMDDhhmmCCYY.ss`. Check
`adb shell dumpsys alarm | grep -A3 tauri.notification` for a *pending*
`RTC_WAKEUP`; a line reading `Reason=alarm_cancelled` is a historical record,
not a scheduled alarm.

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

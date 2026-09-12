# Driving the app

These scripts launch the real app in a real browser and interact with it. They
exist because several defects in this project's history were invisible to
`tsc`, to `cargo check`, and to the unit suite — and visible the moment
something drove the screen:

| Found by driving | What the unit tests said |
| --- | --- |
| A Tauri config error meant the desktop app had **never launched** | `cargo check`, `cargo test`, CI and `tauri build` all green |
| The OpenRouter web sign-in never completed, because the resume lived in a component the redirect never mounted | Every unit test passed |
| A `{port}` placeholder was escaped to `%7Bport%7D`, so the callback went to a port nothing was listening on | Typechecked fine |
| The due deck was in authored order, so spaced repetition was presenting cards in the order the words were written | The scheduler's own tests passed |

They are not a replacement for the unit suite. They are the part of the system
the unit suite cannot reach: composition, routing, persistence across a reload,
and what a user is actually looking at.

## Running them

They need a dev server and a Chromium binary. Playwright's `chromium` is the
easiest source of one.

```bash
npm run dev                      # in one terminal

# in another
npm i --no-save playwright-core
npx playwright install chromium  # if you have no Chromium already

CHROME_EXE="<path to chrome.exe>" OUT_DIR=./shots node scripts/drive/exam-smoke.mjs
```

Every script exits non-zero if a check fails, so they compose into CI when a
runner with a browser is available. They are deliberately **not** wired into
`npm test`: they need a running server, and a unit suite that silently depends
on one is worse than no unit suite.

## What each one covers

| Script | Covers |
| --- | --- |
| `mobile-audit.mjs` | Every page at a given width: horizontal overflow, touch targets under 44px, inputs that make iOS zoom. `WIDTH=360`, `TOUCH=1\|0`. |
| `exam-smoke.mjs` | The 100-question exam, and the thing that matters — that it survives a reload mid-exam with answers intact. |
| `quiz-smoke.mjs` | Scope picker, periodic tests, distractor sanity, and that answering reaches the scheduler. |
| `craft-smoke.mjs` | Themes apply and differ, word order sorts and stays stable across a reload, the info dialog names its designer. |
| `plan-smoke.mjs` | The generation plan: preview costs nothing, a mid-run failure resumes, no word repeats. |
| `addwords-smoke.mjs` | Adding your own words to an existing month, and the collision warning firing before anything is generated. |
| `oauth-smoke.mjs` | The OpenRouter connect flow against a stubbed provider. |

## Writing another

Two rules, both learned the hard way in this repo:

1. **Assert against something that would be different if the feature were
   broken.** A check that counts zero elements and compares `0 === 0` passes
   forever. More than one check here has done exactly that and had to be fixed.
2. **Look at the screenshot.** Numbers said the themes were fine; a screenshot
   showed a toggle inflated into a circle. Numbers said the plan resumed; a
   screenshot showed a stale error still on screen.

## `tracks-smoke.mjs`

Seeds a **pre-tracks** store — calendar month keys, calendar-embedded word ids,
progress hanging off them — then loads the app and checks the migration kept
everything, the track switcher works, and nothing overflows at phone or iPad
sizes.

It reads the mastered count **off the screen**, not out of localStorage, and
that distinction is the whole reason it exists: zustand will discard a
persisted blob whose version it does not recognise, leaving storage perfectly
correct and the running app empty. Twenty-three unit tests could not see that,
because none of them hydrate a store. This one caught it on the first run.

## `schedule-smoke.mjs`

Walks the first-run start-date screen, then moves the start month, shuffles and
unshuffles the months, and redeals every word — checking after each that the
mastered count on the dashboard has not moved. That last assertion is the whole
point of the ordinal redesign, so it is made against the running app rather
than against the pure functions, which were all green on the day the progress
store was silently dropping records.

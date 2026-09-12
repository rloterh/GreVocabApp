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

## `flashcard-nav-smoke.mjs`

The edge arrows and the swipe, neither of which is unit-testable: whether a
control is *visible*, whether moving a pointer toward it makes it disappear
first, whether a drag of a given distance navigates or rates.

It checks the arrows are hidden at rest, revealed by hover, focus and touch
separately, greyed rather than removed at the ends, and hidden again only once
the pointer **and** focus have both left. Then it drags the card on a touch
viewport — a short drag that must do nothing, a long one each way — and
asserts nothing was rated, because swipe navigates and rating keeps its
buttons.

## `tablet-audit.mjs`

Five real devices from the table in `docs/TABLET.md`, both orientations, six
pages each: no horizontal scroll, 44px targets, named controls, the right
navigation shell for the width, and a rotation mid-session that keeps the card
and its flipped state.

It earned its place on the first run by finding that the iPad mini is 744px
and so fell below Tailwind's `md` — the smallest iPad was still getting the
phone layout. Two of its own assertions were wrong before the app was: a
`display: none` aside still reports its declared width in Chromium, and an
input's accessible name comes from its label, not from its text content.

## `library-smoke.mjs`

Loads the whole bundled corpus through the library and checks it lands: months
marked rather than re-offered, nothing fetched until asked for, everything
surviving a reload, and no word repeated across the track.

It waits for the month count to **stop moving** rather than for a fixed few
seconds. Loading is sequential and each month rewrites a store that grows
toward a megabyte, so a fixed wait counted a run still in progress and reported
a working feature as broken — twice, with a different number each time.

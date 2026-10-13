# Games — visual and interaction spec

Companion to [GAMES.md](./GAMES.md). That document decides *what* the games
are; this one decides how they look, move and sound. Same conventions as the
rest of the app: Framer Motion with easing `[0.16, 1, 0.3, 1]`, Fraunces
(`display-serif`) for the word itself and Inter for everything else, `tabular`
on every number, and HSL tokens from `src/styles/globals.css` only.

**The bar is "premium".** In practice that means four things, and every screen
below is checked against them:

1. **One thing at a time.** The prompt owns the screen, and nothing competes
   with it.
2. **Every state is designed,** including loading, a pool too small to play,
   no speech available, paused, and a first ever round.
3. **Motion explains.** Things move to show cause and effect: the right answer
   slides in, the score counts up from what you just earned. Nothing moves for
   decoration.
4. **It is quiet.** No ads, no badges, no exclamation marks in copy except where
   a person would actually say one.

---

## 1. Screens

### 1.1 Hub (`games` page)

```
┌──────────────────────────────────────────────────────────────┐
│ Games                                       Advanced ▾       │  ← page title; track switcher as everywhere
│ Short timed rounds on the words you're learning.             │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │  DAILY ROUND · Tue 13 Oct                                │ │  ← hero card, full width
│ │  Ten mixed questions. Same round for everyone today.     │ │
│ │  ○ ○ ● ● ○ ● ● ● ○ ● ● ● ● ◐       [ Play today's round ]│ │  ← 14-day strip; ◐ = today
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌────────────────────────┐  ┌────────────────────────┐       │
│ │ ░ cover ░░░░░░░░░░░░░░ │  │ ░ cover ░░░░░░░░░░░░░░ │       │  ← game cards, 1 / 2 / 3 columns
│ │ Closest Meaning        │  │ Fact or Fiction        │       │
│ │ Pick the synonym.      │  │ True or false — and why│       │
│ │ Best 1,240 · Standard  │  │ No rounds yet          │       │
│ │ [Warm-up][Standard]    │  │ [Warm-up][Standard]    │       │  ← tier chips; the chip *is* Play
│ │ [Hard][Fiendish][Mine] │  │ [Hard][Fiendish][Mine] │       │
│ └────────────────────────┘  └────────────────────────┘       │
└──────────────────────────────────────────────────────────────┘
```

- **Columns:** 1 below `sm`, 2 from `sm`, and 3 from `xl`. The Daily Round card
  is always full width.
- **The last-used tier chip is filled.** Every other chip is outlined. Tapping
  any chip opens the rules card for that game and tier.
- **"Mine"** is the My words tier. It is disabled with a reason ("Study 40 words
  to unlock") when the pool is too small. It is never hidden, because a
  control that appears from nowhere later reads as a bug.
- **Best line:** `Best 1,240 · Standard`, which is the best on the last-used
  tier. "No rounds yet" before the first.

### 1.2 Rules card

A sheet, not a modal over a live HUD. Bottom sheet below `sm`, centred card
above.

```
        ┌──────────────────────────────────────┐
        │  ░ cover strip ░░░░░░░░░░░░░░░░░░░░░ │
        │  Closest Meaning · Standard           │
        │                                      │
        │  ◷  10 seconds a question             │
        │  ✦  Up to 150 points each — the       │
        │     faster you answer, the more you   │
        │     keep                              │
        │  ↺  10 questions · about 2 minutes    │
        │                                      │
        │  Timer: (Standard) Relaxed  Off       │  ← segmented; writes the setting
        │                                      │
        │            [   Play   ]               │  ← autofocused; Enter starts
        └──────────────────────────────────────┘
```

Three lines, each with an icon, numbers in `tabular`. The formula is stated,
not implied (GAMES.md §6.4). The timer control is here because this is the one
moment someone decides whether they want pressure.

### 1.3 Stage (in play)

```
┌──────────────────────────────────────────────────────────────┐
│ ❚❚   ▰▰▰▱▱▱▱▱▱▱  3/10                         1,240 pts      │  ← HUD: pause · progress · score
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━──────── :07   │  ← time bar, full width, digits at the end
│                                                              │
│                                                              │
│                         chagrin                              │  ← Fraunces, clamp(2.5rem, 8vw, 4.5rem)
│                         noun                                 │  ← muted, small caps
│                                                              │
│                                                              │
│   ┌──────────────────────────────────────────────────────┐   │
│   │ 1   surprise                                         │   │  ← key hint left, muted; hidden on coarse pointer
│   └──────────────────────────────────────────────────────┘   │
│   ┌──────────────────────────────────────────────────────┐   │
│   │ 2   embarrassment                                    │   │
│   └──────────────────────────────────────────────────────┘   │
│   … 3, 4                                                     │
└──────────────────────────────────────────────────────────────┘
```

- **Immersive.** The sidebar, the rail and the tab bar are hidden. The stage is
  `100dvh` with all four safe areas respected, as in Phase 16. Content is capped
  at 640 px and centred.
- **The HUD is one row,** not three boxed cells: pause button (44 px), a
  10-segment progress bar with `3/10`, and the score. Score changes count up
  over 400 ms (instant under reduced motion).
- **The time bar** is the full stage width, depleting right to left, with the
  digits after it. It is `--primary` normally, `--warning` from 50 %, and
  `--destructive` at ≤3 s. Its width is driven by `transform: scaleX`, never by
  `width`, so it costs no layout.
- **Option layout:** stacked full width on a phone. On `md` and up, a 2×2 grid
  when every option is ≤ 18 characters (synonyms, antonyms, headwords), and
  stacked otherwise (definitions). The rule is computed per question, so a
  round can mix the two.
- **Thumb zone:** below `sm`, options anchor to the bottom of the stage and the
  prompt centres in the space above them.

### 1.4 Feedback

```
   ┌──────────────────────────────────────────────────────┐
   │ ✗   surprise                             Your answer  │  ← destructive tint 12 %, ✗ icon, label
   └──────────────────────────────────────────────────────┘
   ┌──────────────────────────────────────────────────────┐
   │ ✓   embarrassment                                     │  ← success fill, ✓ icon
   └──────────────────────────────────────────────────────┘
   … other options fade to 40 %
                 +0 · chagrin: distress at being humiliated   ← one line, muted; tap to expand
```

- **Both are marked:** your pick and the right answer, as in the reference, plus
  a text label so colour is never the only signal.
- **Auto-advance after 900 ms** for choice games. A tap or Enter skips the wait,
  and **holding a finger down holds the feedback** for anyone who wants to read
  the one-line definition.
- **A time-out** marks the right answer only, and the HUD says "Time's up" in
  place of the points delta.
- **Fact or Fiction** does not auto-advance. The explanation card slides up, and
  **Continue** is a real button, muted rather than red ("tap anywhere" is kept as
  a secondary route).

### 1.5 Pause

A sheet over a blurred stage. **The prompt is hidden** while paused, so pausing
cannot buy time to think.

```
        Paused · 3 of 10 · 1,240 pts
        [ Resume ]                         ← primary, autofocused
        [ Restart this round ]
        [ Quit to Games ]
        ───────────────────
        Sound    (On)  Off                 ← the global soundEnabled
        Timer    (Standard)  Relaxed  Off  ← takes effect next round; says so
```

### 1.6 Results

```
                     8 of 10
               right on Standard            ← Fraunces, large: words right leads

                    1,240 pts
           New best — up from 1,060          ← or "First round on Standard. Score to beat."
                                               or "Best is 1,420"
     ┌─────────────────────────────────────────────┐
     │ Missed: reticent · laconic                  │
     │ [ Review these 2 in Flashcards ]            │  ← only for words already studied (GAMES.md §7)
     └─────────────────────────────────────────────┘
     [ Play again ]  [ Review answers ]  [ Games ]
```

- **Count-up:** right answers tick up first, then points. 900 ms in all, then
  confetti for a new best or a perfect round. All of it is skipped under
  reduced motion.
- **Play again is autofocused,** so Enter replays.

### 1.7 Review answers

The reference's list, made more useful.

```
  chagrin            embarrassment ✓
  reticent           voluble ✗           correct: reserved
  laconic            Time's up ✗         correct: terse
```

- **Tap a row to expand it in place:** the definition, the example, a
  `SpeakButton`, the root family where there is one, and **Review in
  Flashcards** (studied words) or **Find in library** (others).
- **Fact or Fiction rows** show the statement, your verdict, and the
  explanation.
- **Spell It rows** show what you typed with the differing letters underlined.

### 1.8 Per-game stage variations

| Game | Prompt area | Answer area |
| --- | --- | --- |
| Closest Meaning, Opposites | headword + POS (Opposites shows "opposite of" above it) | 4 options |
| Fact or Fiction | statement, Inter 1.5rem, the word in it set in Fraunces | two wide buttons, **Fact** / **Fiction** |
| Fill the Gap | the sentence, with the gap as an underlined 6ch slot; on answer the word drops in | 4 options |
| Odd One Out | "Which doesn't belong?" | 2×2 word tiles, Fraunces |
| Match Up | none: the whole stage is the board | two columns, words left in Fraunces, definitions right; on a phone the definitions sit below the words, and a selected word pins to the top |
| Spell It | 🔊 big round button (autoplays once), definition, POS, letter count as underscores | one text field with letter boxes drawn behind it, Hint, Submit |
| Unscramble | definition | letter tiles and slots, Fraunces |

## 2. Game identity: covers without new colours

Each game needs to be recognisable at a glance in the hub, as the reference's
covers are. Doing that with eight new hues would multiply into eighty token
values across ten themes, all of which the contrast test would then need to
cover. Instead:

- **Hue:** tints of existing tokens only. `--primary`, `--accent`, `--success`,
  `--warning` and `--secondary`, at 10–18 % alpha over `--card`, give eight
  distinguishable backgrounds in every theme.
- **Mark:** a typographic motif per game, set in Fraunces at low contrast and
  repeated as a pattern. The reference's "?"-pattern is the idea we keep; the
  marks are our own.

| Game | Tint | Pattern mark |
| --- | --- | --- |
| Closest Meaning | accent | `≈` |
| Fact or Fiction | success | `✓✗` |
| Opposites | warning | `⇄` |
| Fill the Gap | primary | `__` |
| Odd One Out | secondary | `○ ○ ○ ●` |
| Match Up | primary (rotated pattern) | `⟷` |
| Spell It | accent (rotated pattern) | `a b c` |
| Daily Round | gradient, primary → accent | the date, large |

The cover is one component, `GameCover`, that takes `{ tint, mark }` and renders
the pattern as an inline SVG `<pattern>` filled with `currentColor`. It is
theme-correct by construction. **No raster assets.**

## 3. Motion

All on `[0.16, 1, 0.3, 1]`. Under `reduceMotion`, every entry below becomes a
150 ms opacity fade or nothing.

| Moment | Motion | Duration |
| --- | --- | --- |
| Question enters | prompt fades + rises 8 px; options stagger 40 ms each | 320 ms |
| **Clock starts** | when the last option has finished entering (GAMES.md §6.3) | — |
| Option press | scale 0.98 | 120 ms |
| Correct | success fill sweeps left → right; ✓ pops 0.6 → 1 | 280 ms |
| Wrong | 2 × 4 px horizontal shake on the chosen option; the right one fills | 300 ms |
| Score delta | "+140" rises 12 px and fades beside the score; score counts up | 400 ms |
| Time ≤3 s | the bar changes colour (no pulsing — pulsing reads as an alarm) | 200 ms |
| Question exits | fade + rise 8 px | 200 ms |
| Match Up pair | the two cards translate toward each other 8 px, lock, fade to 30 % | 300 ms |
| Results | count-ups, then confetti variant | 900 ms + |

## 4. Sound

Synthesised in `src/lib/sound.ts` like the existing palette, behind
`soundEnabled` and off by default. New `SoundName`s:

| Name | When | Character |
| --- | --- | --- |
| `start` | Play pressed | two rising notes, soft |
| `tick` | each of the last 3 seconds | very short, very quiet click |
| `timeout` | time runs out | low single tone |
| `best` | new best on results | the `complete` motif, a third higher |

`correct`, `wrong` and `complete` already exist and are reused. The tick must
not be the only signal that time is short (GAMES.md §12).

**Haptics (P2):** `navigator.vibrate(10)` on correct and `[20, 40, 20]` on
wrong, gated by a `canVibrate` capability in `src/lib/platform.ts`, and tied to
the same sound switch rather than a third setting.

## 5. Copy

Plain, warm, brief. Sentence case everywhere. No exclamation marks except the
results heading on a perfect round.

| Moment | Copy |
| --- | --- |
| Hub subtitle | Short timed rounds on the words you're learning. |
| Tier too small | Study 40 words to unlock. · You've studied 12. |
| First round | First round on Standard. This is the score to beat. |
| New best | New best — up from 1,060. |
| Not a best | Best is 1,420. |
| Perfect | 10 of 10! |
| Time-out | Time's up |
| Wrong (live region) | Not quite. The answer was *embarrassment*. |
| Right (live region) | Correct. Plus 140. |
| Review action | Review these 2 in Flashcards |
| Review toast | 2 words added to today's reviews. |
| No speech | Your device can't speak words aloud, so Spell It will show the definition and the letter count instead. |
| Corpus loading | Getting the words ready… (a skeleton stage, never a spinner on a blank page) |
| Offline and the corpus fails | Couldn't load these words. Your own words still work — try *Mine*. |

## 6. Responsive matrix

| Width | Hub | Stage |
| --- | --- | --- |
| 360 (phone) | 1 column; tier chips wrap to two rows | options stacked and bottom-anchored; the prompt clamps to 2.5rem |
| 720–1023 (rail, tablet portrait) | 2 columns | 2×2 options for short answers |
| 1024+ landscape tablet / desktop | 2–3 columns | stage centred, max 640 px; key hints visible on a fine pointer |

Verified by extending `scripts/drive/tablet-audit.mjs` to the Games page and a
running stage.

# Schedule — start date, month order, reshuffling

When a user starts, what they study first, and what happens when they want it
in a different order.

Rests on [ADR 0012](./adr/0012-ordinal-content.md): content is ordinal, the
calendar is a separate mapping.

## The problem

The shipped corpus is 36 files named `2026-10.json` … `2029-09.json`. Three
things follow from that, all bad:

1. A user installing in March 2027 is handed months labelled 2026. The app
   looks abandoned on first launch.
2. Word ids contain the month (`2026-04-abstemious`), so moving a word to a
   different month changes its identity and orphans its progress.
3. Therefore reordering months — a feature the user asked for — would silently
   erase progress. There is no version of "let the user reshuffle" that works
   on top of calendar-keyed content.

The fix is not to make reordering rewrite ids carefully. It is to stop putting
the calendar in the content.

## The model

```ts
interface Schedule {
  track: Track;
  /** "2027-03" — the calendar month the first studied month falls in. */
  startMonth: string;
  /** Teaching position → corpus ordinal. A permutation of 1…36. */
  order: number[];
  /** Non-null once the user has reshuffled; drives word placement. */
  shuffleSeed: string | null;
}
```

Two pure functions, and they are the whole API:

```ts
/** Which calendar month does teaching position i fall in? */
calendarMonthOf(schedule, i): string        // "2027-03", "2027-04", …

/** Which corpus month am I studying in calendar month m? */
ordinalForCalendarMonth(schedule, m): number | null
```

`order[0] = 7` means "the corpus's seventh month is what you study first, and
it falls in your start month". Nothing on disk moves; nothing in progress
changes. Reordering is a permutation of 36 integers.

A schedule per track, because a user may start SAT a year after GRE.

## First run

Two questions, both answered by default, both skippable:

```
   When would you like to start?

   ● Today — 12 September 2026        ← proposed
   ○ Pick a date…                     ← month picker, past or future

   How should the months run?

   ● As taught    difficulty builds across three years
   ○ Shuffled     variety over progression

                                    [ Start ]
```

- **Today is proposed, not imposed.** Someone whose exam is in eighteen months
  may want to start where the difficulty suits them; someone reconstructing a
  study log may want a past date.
- **Past dates are allowed.** Choosing one means months before today are
  already "open" — which is exactly what a user importing existing study wants,
  and harmless otherwise.
- **"As taught" is selected.** The corpus was built with deliberate difficulty
  banding (core → mid → advanced) and the audit asserts the banding holds. The
  default should be the thing that was designed.
- The whole screen is one tap away from done. A setup flow that must be read
  before the app can be used is a setup flow most people resent.

Changing either later lives in Settings, with the same two controls and one
sentence about what reshuffling costs.

## Reshuffling

Three distinct things get called "shuffle". Conflating them is the mistake this
section exists to prevent.

| | What moves | Where | Reversible |
| --- | --- | --- | --- |
| **Word order** | Presentation within a day | `wordOrder` setting ([WORD-ORDER.md](./WORD-ORDER.md)) | Yes, freely |
| **Month order** | Which corpus month you study when | `Schedule.order` | Yes, freely |
| **Word redistribution** | Which month a word belongs to | `Schedule.shuffleSeed` | No — see below |

### Month order

A permutation. Free, reversible, and it never moves a word between months, so
progress is untouched. Offered at setup and in Settings.

Reordering after you have started keeps your completed months completed — they
are identified by corpus ordinal, not by position — and changes only what comes
next. The UI says which months you have already studied and that they stay
where they are.

### Word redistribution

This is the real one. It takes all of a track's words and deals them back out
across the 36 months by a seeded shuffle.

It is honest about its cost, in one sentence, before it happens:

> Reshuffling mixes the words across all 36 months. You keep everything you
> have learned, but the difficulty will no longer build from month to month.

- **Progress survives.** Word ids do not contain positions (ADR 0011), so a
  word that moves from month 3 to month 22 keeps its entire history. This is
  the property the whole redesign was for.
- **It discards the banding.** The corpus audit asserts later bands are not
  easier than earlier ones. A reshuffled corpus fails that by construction, and
  the user is choosing that.
- **Seeded, so it is stable.** The same seed gives the same layout across
  reloads and devices. Reshuffling again means a new seed.
- **It does not undo.** Reshuffling again gives another layout, not the
  original one: the authored placement is not recoverable from the words
  themselves, and storing a copy of it to make the button reversible would
  cost tens of kilobytes of the localStorage budget the corpus and progress
  already share. Restoring the authored layout means loading the months again
  from the library. The UI says so rather than implying a back button exists.
- **Offered at setup, and in Settings behind the sentence above.** Not a
  one-tap control on the main surface.

## Migration

Existing users have calendar-named months with progress hanging off
calendar-embedded word ids.

1. Sort their loaded months chronologically; assign ordinals 1…n.
2. Write a schedule: `startMonth` = their earliest month, `order` = identity,
   `shuffleSeed` = null.
3. Rewrite word ids `${monthKey}-${slug}` → `gre-${slug}`.
4. Rewrite every reference to those ids — progress records, activity entries,
   saved sentences, quiz and exam history, decks.

Step 4 is where months of a user's work is either kept or thrown away. It gets
its own test file, including one that starts from a real pre-migration backup.

### The acceptance test

**A backup taken before the migration, restored after it, shows the same words
on the same days with the same progress.**

Stated three times across these documents deliberately. If it does not hold,
the migration does not ship, and the fallback is keeping legacy ids as
permanent aliases.

A second, cheaper assertion runs on every launch after migration: **every
progress record points at a word that exists.** Orphans mean the rewrite
missed a reference, and it is better to find that in a test than in a support
message a year from now.

## What this deliberately does not do

- **No per-day scheduling.** Months map to calendar months; days within a month
  are day 1…n as they always were. Mapping day 7 of month 3 to a specific date
  would make the whole thing brittle for no gain.
- **No gaps or pauses.** Months run consecutively from the start month. A user
  who skips a month has an incomplete month, not a shifted calendar — the
  spaced-repetition scheduler already handles absence.
- **No rewriting the corpus on disk.** Every reshuffle stays a permutation or a
  seed. A reshuffle that rewrote files would be a migration triggered by a
  user's whim, and a migration that runs on a whim eventually runs badly.
- **No syncing schedules across tracks.** They are independent by design.

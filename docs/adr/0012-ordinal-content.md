# ADR 0012 — Content is ordinal; the calendar is a separate mapping

**Status:** accepted · 2026-09-12 · depends on [ADR 0011](./0011-tracks.md)

## Context

Three requirements arrived together, and they are the same requirement:

- A user picks a **start date** on first run (today, proposed), and the next 36
  months are populated from it.
- The **order of months** can be rearranged at setup.
- **Words can be reshuffled**.

The shipped corpus is currently 36 files named `2026-10.json` … `2029-09.json`.
A user starting in March 2027 would be handed months labelled 2026 — already
wrong — and any reordering would move words between months, changing their ids
([ADR 0011](./0011-tracks.md)) and orphaning their progress.

## Decision

**The corpus has no calendar in it. Month one is month one.**

```
public/vocab/gre/01.json … 36.json
public/vocab/sat/01.json … 36.json
```

```ts
interface VocabMonth {
  track: Track;
  ordinal: number;        // 1–36. The teaching position.
  title: string;          // "Criticism and praise" — not a date
  days: VocabDay[];
}
```

Calendar dates live in exactly one place, a **schedule**:

```ts
interface Schedule {
  track: Track;
  startMonth: string;          // "2027-03", chosen at setup
  /** Teaching position → calendar month. Index 0 is the first month studied. */
  order: number[];             // a permutation of 1…36
}
```

`order[0] = 7` means "the seventh month of the corpus is what you study first,
and it falls in your start month".

### Why this shape

Because it makes the hard requirements trivial and the trivial ones free:

| Requirement | What it becomes |
| --- | --- |
| Start on any date | Change `startMonth`. No content moves. |
| Reorder months | Permute `order`. No content moves. |
| Reshuffle words | A per-month seed; still no content moves. |
| Change your mind later | Both of the above, at any time. |

**No content moves** is the point. Word ids do not contain positions, progress
does not reference them, and a user who reshuffles in month 14 keeps everything
they have learned. The alternative — rewriting months on disk when the order
changes — makes every reshuffle a migration, and a migration that runs on a
user's whim is a migration that will eventually run badly.

### Reshuffling words

Two distinct things, and conflating them would be a mistake:

- **Presentation order within a day** is already the `wordOrder` preference
  ([docs/WORD-ORDER.md](../WORD-ORDER.md)). Unchanged, and still forbidden from
  touching the due deck, quiz or search.
- **Which words are in which month** is the corpus's teaching order. Reshuffling
  *that* is a real redistribution, offered **at setup only**, and it is a
  deliberate act: it discards the difficulty banding the corpus was built with.
  The UI says so in one sentence rather than hiding it.

A user who reshuffles the corpus is choosing variety over a curriculum. That is
a legitimate preference and it is not the default.

### The setup flow

First run, once:

```
   When would you like to start?
   [ Today — 12 September 2026 ]     ← proposed, one tap
   [ Pick a date ]

   How should the months run?
   [ As taught ]  difficulty builds across three years   ← default
   [ Shuffled ]   variety over progression
```

Two questions, sensible defaults, and skippable. A setup screen that must be
read before the app can be used is a setup screen most people will resent; this
one has a correct answer already selected.

## Migration

Existing users have calendar-named months with content in them. On first launch
after this ships:

1. Their months are sorted chronologically and assigned ordinals 1…n.
2. A schedule is written whose `startMonth` is their earliest month and whose
   `order` is the identity permutation.
3. Word ids are rewritten per ADR 0011, progress keys with them.

The result is a user whose app looks **exactly as it did**, because their
existing calendar months are reproduced by the schedule rather than stored. That
is the acceptance test: a pre-migration backup, restored after migration, shows
the same words on the same days with the same progress.

## Consequences

- `firstFreeMonthKey` and everything else that reasons about calendar months
  moves behind the schedule.
- The generator produces ordinal files, and `--start` disappears from it — a
  start date is a user's setting, not a property of the corpus.
- Two users who start in different months share the same corpus files. The
  corpus becomes cacheable, diffable content rather than dated data.
- A month's title has to carry its identity now that its name is not a date.
  The generator already writes a theme per month; that becomes the title.

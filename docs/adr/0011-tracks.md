# ADR 0011 — Exam tracks are a first-class dimension

**Status:** accepted · 2026-09-12

## Context

The app is one corpus of GRE vocabulary. The request is to let a user switch
between **GRE** and **SAT**, each with its own words, each generatable, each
progressing independently.

The naive reading is "add a filter". It is not, because of one line in
CLAUDE.md that everything else in this codebase has been built around:

> **Progress is orthogonal to vocab.** Progress records are keyed by `wordId`.
> Reloading the same JSON five times must never reset progress.

Two tracks means two answers to "what is the user studying", and the store's
`months: Record<string, VocabMonth>` is keyed by calendar month — `"2026-10"`.
A SAT October and a GRE October collide on that key. Whatever we do about it
decides how hard everything after this is.

## Decision

**A track is part of the identity of content, not a filter over it.**

```ts
export type Track = "gre" | "sat";
```

Three consequences, and they are the whole ADR:

### 1. Months are keyed by track and ordinal, never by calendar month

```
months: Record<string, VocabMonth>   //  "gre/01" … "gre/36", "sat/01" …
```

Calendar months are assigned by the schedule ([ADR 0012](./0012-ordinal-content.md)),
not baked into the key. A key that contains a calendar month cannot survive a
user changing their start date, and cannot hold two tracks at once.

### 2. Word ids are track-scoped and calendar-free

Today: `"2026-04-abstemious"`. After this: `"gre-abstemious"`.

This is the load-bearing change. An id containing a calendar month means the
word's identity changes when it moves — and moving words is precisely what the
start-date and reshuffling features do. Progress keyed by such an id is
progress that evaporates the first time a user reorders anything.

Track-scoped rather than bare, because `sat-abate` and `gre-abate` are
legitimately different rows: a user who studied *abate* for the SAT two years
ago and is now on the GRE should meet it again with a fresh schedule. Sharing
one progress record across tracks would tell them they already know a word they
are being asked to learn.

### 3. The active track is a setting, and every selector honours it

```ts
activeTrack: Track;   // default "gre"
```

Selectors — due deck, dashboard counts, search, archive, quiz pools — read the
active track's months only. The scheduler, the dedup index and the generation
plan all become per-track.

**Switching tracks is not a mode.** It is closer to opening a different
notebook: nothing is lost, nothing is merged, and coming back finds it as it
was. A confirmation dialog would be wrong; a visible, always-legible indicator
of which track is active is not optional.

## What this costs

A migration, and not a trivial one. Existing users have calendar-keyed months
and calendar-embedded word ids with progress hanging off them.

The migration must:

1. Read every loaded month, assign it to track `gre`, and give it an ordinal in
   chronological order.
2. Build a schedule mapping those ordinals back to the calendar months the user
   already had, so nothing appears to move.
3. Rewrite every word id from `${monthKey}-${slug}` to `gre-${slug}`.
4. **Rewrite every progress record's key to match**, and the activity, sentence
   and quiz-history references along with it.

Step 4 is where a user's months of work is either kept or silently thrown away.
It gets its own tests, including one that starts from a real pre-migration
backup and asserts every progress record still points at a word that exists.

A migration that loses progress is worse than not shipping the feature. If the
tests cannot demonstrate it holds, this ADR is wrong and the fallback is
keeping legacy ids as aliases forever.

## Alternatives considered

**A separate store per track.** Two zustand stores, two persisted keys. Simpler
to reason about, and rejected because every cross-cutting surface — search, the
dashboard, backup/restore, the dedup index — would need to know there are two
of everything. The complexity does not disappear, it just moves somewhere with
less structure.

**A `track` field on `VocabMonth`, keys unchanged.** Smallest diff, and it does
not work: the key still collides for a SAT and GRE month in the same calendar
month, which is the ordinary case rather than an edge one.

**Namespaced calendar keys, `"gre:2026-10"`.** Solves the collision and keeps
the calendar in the key — so it fails the start-date requirement for the same
reason bare calendar keys do.

## Consequences

- The dedup index is per-track. Two indexes, built the same way.
- Generation plans carry a track, and the corpus ships one directory per track.
- Backup and restore carry tracks; a restore from an older backup runs the
  migration above.
- The UI needs a permanent, quiet indicator of the active track. A user who
  cannot tell which notebook is open will eventually study the wrong one.

# ADR 0016 — Games are rounds, not a progression system

**Status:** accepted · 2026-10-13 · amends [ADR 0006](./0006-fun-vs-no-gamification.md)

## Context

ADR 0006 decided that fun in Lexicon means craft rather than points:
"XP, points, levels, badges, achievements, daily-goal pressure, anything
comparative" are out. Its test was whether a feature would need a legend to
explain it, and its specific fear was a second progress model that can
disagree with the first: "the moment a user can see both '87% mastered' and
'Level 12', they have to work out which one is real."

The owner has now asked for a games section modelled on Merriam-Webster's word
games: timed, scored, with difficulty tiers and a personal best. That is points.
ADR 0006 asked to be revisited "only with evidence"; this request is the product
owner changing the brief, which is a different and legitimate reason, and this
ADR says so plainly rather than pretending the new feature fits the old rule.

Two things already in the app are relevant. The quiz shows a percentage and
fires streamers for a personal best (Phase 5), and the exam has a score and a
history trend. So a score that measures one sitting is already accepted. What
ADR 0006 actually guards against is **accumulation**: a number that grows
across sittings and claims to represent the learner.

## Decision

**Scored games ship, inside a boundary.**

### Allowed

- **A score per round.** It is born when the round starts and is final when it
  ends, like a quiz percentage.
- **A best per game,** keyed by game, track, tier and timing, and shown only
  beside that game.
- **A Daily Round result per day** and a 14-day record of which days were
  played. It is a record, not a streak: missing a day shows nothing red.
- **A user-initiated share** of the Daily Round as plain text (P2). There is
  nothing comparative inside the app.

### Not allowed — the ADR 0006 line, restated for games

- **No cumulative total** of game points, anywhere, ever. No "lifetime score".
- **No XP, levels, ranks, badges, achievements, trophies or unlocks bought with
  points.** Tiers unlock by *studying* (My words) or are open from the start.
- **No game number on the Dashboard stat row** or anywhere else beside mastery.
  The Dashboard gets one Daily Round card, which says what you did today.
- **No leaderboards and no online comparison.**
- **No lives, energy, timers between rounds or "come back later".**

### Games and the scheduler

**A game never writes SM-2 state or creates a progress record on its own.**
Speed under a timer is not recall, and game pools include words from months the
user has not loaded, whose records would be orphans. The only path from a game
into the scheduler is an explicit action on the results screen: "Review these
in Flashcards", which applies *again* to missed words the user has already
studied, and says so.

A completed round **does** count as activity for the streak (`gamesPlayed` on
`DayActivity`). This is the one point where games touch an existing mechanic,
and it is argued the same way the streak freeze was: it makes an existing
number kinder, it adds no new one.

## Why the boundary is there

The fear in ADR 0006 was never "a number on screen". It was a number that
competes with mastery for the role of "how am I doing". A round score cannot
compete, because it does not persist as a total. A best per game cannot either,
because it answers a question nobody confuses with mastery: "what is my best at
*this game*?" A lifetime points total would compete, which is why it is the
first thing refused.

The test from ADR 0006 still applies to every screen: if it needs a legend, it
is out. The rules card states the scoring formula in one sentence for that
reason.

## Alternatives considered

**Unscored games** — timed rounds that report only "8 of 10". This honours ADR
0006 to the letter and loses most of what makes the reference fun: the race
against your own last attempt. The owner's brief was explicit about that feel.

**Points with an XP total and levels.** The most *expected* design, rejected for
every reason ADR 0006 gives. Nothing here needs it.

**Games feeding the scheduler automatically**, as quiz answers do. Rejected:
a seven-second Fiendish timer would push "again" ratings onto words the user
knows perfectly well, and the scheduler is the one part of the app that must
stay trustworthy.

## Consequences

- ROADMAP.md's "Explicitly not planned" line changes from "Gamification beyond
  streaks" to "Gamification beyond streaks and per-game bests — see ADR 0016".
  The rest of the line stands.
- ADR 0006 gets a status note: "amended by ADR 0016 for the games section".
- [docs/GAMES.md](../GAMES.md) §13 lists what is refused, and code review
  should hold every games PR to it.
- If a future request is for a points *total* or levels, it is a new ADR, and
  this one is the argument against it.

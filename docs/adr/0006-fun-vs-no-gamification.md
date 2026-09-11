# ADR 0006 — "Fun stuff" versus the no-gamification rule

**Status:** OPEN — needs an owner decision · 2026-09-11

## Context

ROADMAP.md has, since v0.1, listed under **Explicitly not planned**:

> **Gamification beyond streaks.** — No XP bars, no levels, no leagues.
> Streaks + heatmap are enough.

The v1.0 brief asks for "additional enhancement and fun stuff that can be added
if possible".

These are in tension. Most of what makes a vocabulary app fun is exactly what
that rule excludes, and silently building an XP bar because a later brief said
"fun" would be overriding a deliberate product decision without saying so.

## The decision required

Which of these is the rule?

**(a) The rule stands.** Fun means better craft, not more mechanics — sharper
copy, better animation, satisfying sound, delightful details. No points, no
levels, no streaks-as-pressure.

**(b) The rule is relaxed, narrowly.** Named exceptions only, listed here, each
argued. Everything else still excluded.

**(c) The rule is withdrawn.** Gamification is open; design it properly.

## Candidates, sorted by whether they need the rule relaxed

### Compatible with the rule as written

These add delight without adding mechanics, and need no decision:

- **Streak freeze / rest day.** One token a week that forgives a missed day.
  Reduces the anxiety streaks create rather than amplifying it — arguably it
  *serves* the existing rule rather than bending it.
- **Word of the day** on the dashboard, pulled from what is due.
- **Audio pronunciation.** The Web Speech API is already used for the flashcard
  speak button; extending it is nearly free.
- **Etymology and root families.** Group words by shared root, show the family
  when studying one. Genuinely aids retention and is already in the parking lot.
- **Confusable pairs drill.** `affect`/`effect`, `discreet`/`discrete`. High
  educational value, no mechanics.
- **Better empty and success states.** Craft, not points.
- **Session recap card.** A shareable image of what you studied — the deck-share
  code already proves the plumbing.

### Require relaxing the rule

- Points, XP, levels
- Badges and achievements
- Daily goals with pressure mechanics
- Any comparison against other people

## Recommendation

**(b), relaxed narrowly — and in practice that may mean nothing changes.**

Everything in the first list is worth building and none of it needs the rule
touched. The list is long enough to satisfy "fun" on its own. Adopting XP and
badges would make Lexicon resemble every other vocabulary app, and the current
restraint is part of why it does not.

If a mechanic is wanted, the one worth arguing for is the **streak freeze**,
because it makes an existing feature kinder rather than adding a new axis of
competition.

## Until this is decided

Only the first list is scheduled. Nothing in the second list is built.

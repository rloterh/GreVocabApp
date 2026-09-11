# ADR 0006 — Fun means craft, not points

**Status:** accepted · 2026-09-11

## Context

ROADMAP.md has listed, since v0.1, under **Explicitly not planned**:

> **Gamification beyond streaks.** — No XP bars, no levels, no leagues.
> Streaks + heatmap are enough.

The v1.0 brief asked for "fun stuff", and then, when the conflict was raised,
for the best recommendation that keeps it **fun and not confusing**.

Those two words are the decision. Most gamification is fun in the first week and
confusing forever after: a number goes up, the user cannot say why, and the
number is not the thing they came for. Vocabulary is the thing they came for.

## Decision

**The no-gamification rule stands.** Fun in Lexicon means craft, surprise and
satisfying feedback — not a second scoring system layered on top of the one the
scheduler already runs.

One narrow exception, argued below: the **streak freeze**.

### What ships (Phase 11)

Each of these is fun *and* does work for the learner. Nothing here needs
explaining in a tooltip, which is the test for "not confusing".

| Feature | Why it is fun | Why it is not noise |
| --- | --- | --- |
| **Streak freeze** | Removes the dread of losing a 40-day streak to one bad day | Makes an existing feature kinder; no new number to track |
| **Word of the day** | A small gift on opening the app | Drawn from what is actually due |
| **Audio pronunciation** | Hearing a word makes it real | Extends the speak button that already exists |
| **Etymology and root families** | "Oh — *that* is why it means that" | Roots are the highest-leverage vocabulary technique there is |
| **Confusable pairs drill** | Genuinely satisfying to finally nail | `affect`/`effect` is a real, repeated failure |
| **Session recap card** | Worth sharing | Uses the deck-share plumbing already built |
| **Confetti variants** | Already shipped, already good | Costs nothing |
| **Craft in empty and success states** | The app feels made rather than generated | — |

### What does not ship

XP, points, levels, badges, achievements, daily-goal pressure, anything
comparative. If it would need a legend to explain, it is out.

## Why the streak freeze is the one exception

It is not an addition — it is a **correction** to a mechanic already shipped.

Streaks motivate until the day one is broken, at which point they become a
reason to stop entirely: the user has lost the thing they were protecting and
the app now reads as a record of failure. A freeze — one token a week, spent
automatically on a missed day — keeps the motivation and removes the cliff.

It adds no number to chase. It makes an existing number less punishing. That is
why it passes a rule the rest of the list would fail.

## Why not the rest

Taking the strongest candidate seriously: an XP bar would be the most
*expected* feature here, and that is precisely the objection. Every vocabulary
app has one. Lexicon's actual differentiators are the scheduler, the four import
formats, the Anki round-trip and the fact that it works with no account and no
server. An XP bar competes with none of that and costs a permanent slice of
screen space plus a second progress model that can disagree with the first.

The moment a user can see both "87% mastered" and "Level 12", they have to work
out which one is real. That is the confusion the brief asked to avoid.

## Consequences

- Phase 11 is scoped to the table above. No task in it needs this ADR relaxed.
- ROADMAP.md's "Explicitly not planned" section stands unchanged, with a pointer
  here so the next reader finds the reasoning rather than re-arguing it.
- Revisit only with evidence — a real user who stopped, and a specific mechanic
  that would plausibly have kept them. Not a hunch.

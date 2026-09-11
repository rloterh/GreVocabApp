# Word order

Whether a month's words appear in the order they were written, alphabetically,
or shuffled — and, more importantly, where that preference does *not* apply.

## The three orders

```ts
type WordOrder = "authored" | "alphabetical" | "random";
```

**`authored`** — the order the words are stored in: day 1 first, and within a
day, the order the author or generator produced. **This is the default.**

It is the default because it is not arbitrary. A generated month builds
difficulty deliberately across the horizon, and a hand-authored one groups
related words on the same day. Alphabetising that throws away a teaching
decision, and shuffling it throws away the same decision plus any sense of
progress. Most users should never change this setting; it exists for the ones
who want to.

**`alphabetical`** — A to Z across the whole month, ignoring day boundaries for
listing purposes. Useful for looking something up, and for the kind of learner
who wants to see the shape of the corpus rather than a curriculum.

**`random`** — shuffled, but **stably**. See below; this is the detail that
decides whether the option is pleasant or maddening.

## Where it applies, and where it must not

This is the substance of the design. An ordering preference that silently
overrode the scheduler would quietly break the thing the app is for.

| Surface | Honours the preference? | Why |
| --- | --- | --- |
| Daily Practice, within a day | **Yes** | Presentation of a fixed set. |
| Archive — a month's word list | **Yes** | Browsing. |
| Flashcards — month / day / mastered / still-learning decks | **Yes**, as the initial state of the session's shuffle toggle | The user is choosing what to study, not when. |
| **Flashcards — the `due` deck** | **No — scheduler order wins** | The whole point of SM-2 is that something decides what you see. Overdue first, then by due date. |
| Quiz and exam question order | **No — always randomised** | A quiz whose answers arrive alphabetically is a quiz you can game. |
| Search results | **No — relevance order** | The user typed a query; the best match goes first. |
| Calendar, Progress | **No** | Chronological by nature. |

The rule underneath: **ordering is a presentation preference, and presentation
never overrides scheduling or fairness.** Anywhere something is already ordered
for a reason, that reason wins.

## "Random" means stable

Naive shuffling is worse than no shuffling. If the order changes on every
render, a re-render mid-session moves the card you were reading; if it changes
on every visit, you lose all sense of having seen a month before, and "where was
that word" becomes unanswerable.

So random is **seeded**, and the seed is stable for as long as it should be:

```ts
seed = hash(monthKey + deckKind + todayDateKey)
```

- Stable **within a day and a deck**: the same month opens in the same order all
  day, so position is a usable memory aid.
- Different **tomorrow**: the point of shuffling is to break the ordering effect,
  where a word is remembered by its neighbours rather than its meaning.

The shuffle is a seeded Fisher–Yates over a small deterministic PRNG — a dozen
lines in `src/lib/order.ts`, no dependency, and testable: the same seed must
always produce the same permutation, and different seeds must usually not.

## Interaction with the existing shuffle toggle

Flashcards already has a per-session **Shuffle cards** switch. Two independent
controls over the same thing would be confusing, so they are not independent:

- The global preference sets the **initial state** of that toggle.
- The toggle remains a per-session override, and does not write back to
  settings.

One source of truth, one place to change it permanently, and a session-level
escape hatch that behaves the way a session-level control should.

## Where it lives

```ts
// Settings
/** How a month's words are ordered where nothing else decides. */
wordOrder: WordOrder;   // default "authored"
```

And the ordering itself:

```ts
// src/lib/order.ts — pure, no React, no stores
export function orderWords(
  words: VocabWord[],
  order: WordOrder,
  seed?: string,
): VocabWord[];
```

`seed` is passed by the caller rather than read from a clock, so the function is
deterministic and the tests do not need a frozen date — the same pattern as
`schedule(rating, ..., now)` in `sm2.ts`.

Alphabetical sorting uses `localeCompare` with `sensitivity: "base"`, so
`Élan` sorts next to `elan` rather than after `Zeal`.

## Tests

- Each order returns exactly the same set, only rearranged — nothing is lost or
  duplicated. This is the property that matters most, and it holds for all three.
- `authored` is the identity.
- `alphabetical` is case- and accent-insensitive.
- `random` with the same seed is identical; with a different seed it usually is
  not.
- The due deck ignores the preference entirely, for all three values.

## Deliberately not doing

- **Ordering by difficulty or ease factor.** Sounds useful, is a different
  feature — a *filter* on what to study, not an order to show it in, and the
  due deck already does the scheduling version of it properly.
- **Per-month order overrides.** One preference. A per-month setting would be a
  setting nobody remembers changing.
- **Reverse alphabetical.** No one has ever wanted this.

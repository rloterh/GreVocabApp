# ADR 0005 — Duplicate detection is stem-based, and removal retires rather than frees

**Status:** accepted · 2026-09-11

## Context

The requirement is that a newly generated word must never repeat one the user
already has. Two sub-problems:

1. A model will produce `abate` in one month and `abatement` in another. These
   are not equal strings but are the same thing to learn.
2. If a user removes a month, are its words available again?

## Decision

**Collision is by stem.** Normalise (lowercase, strip diacritics and
punctuation), then apply a conservative suffix stripper. Two words collide if
their stems match.

The stemmer is deliberately under-aggressive. Over-matching would reject
legitimately distinct words worth teaching separately — `industry` and
`industrious` are a real pair a learner benefits from meeting twice.

**Removal retires.** A removed month's words are marked `retiredAt` and continue
to block regeneration. They are not deleted from the index.

## Why retirement

Progress records are keyed by word id and are deliberately independent of
whether a month is loaded — that is CONTINUING.md principle 1, and it is why you
can re-import the same file five times without losing anything.

If removal freed the words, a user could remove April, regenerate, and be handed
April's words as "new" — while their existing progress records silently
reattached to them. The user would be shown words they have already studied,
with a scheduler state they did not earn.

Retirement makes identity behave the same way progress already does.

## Consequences

- Over a year the index reaches ~1,100 entries. A `Map` lookup, rebuilt at
  startup from months plus the retired ledger. Negligible.
- Users who genuinely want a word back need an explicit "release retired words"
  action. It exists, in one place, with a warning.
- The stemmer is a rule set with a fixture test. Wrong behaviour is fixed by a
  test and a rule, not a rewrite.

## Rejected

- **Exact string matching.** Fails on the most common real case.
- **Embeddings / semantic similarity.** Solves a different and much less
  valuable problem — "similar meaning" is not "duplicate" — and costs a model
  call per word or a shipped model.
- **Deleting on month removal.** See above; it silently corrupts the
  relationship between progress and vocabulary.

# ADR 0013 — Words may repeat across tracks, never within one

**Status:** accepted · 2026-09-12 · depends on [ADR 0011](./0011-tracks.md)

## Context

[ADR 0005](./0005-dedup-by-stem-with-retirement.md) established that a
duplicate is the one failure a vocabulary app cannot explain away, and the
dedup index enforces it. With a second track, the question becomes: is
`abate` appearing in both the SAT and GRE corpora a duplicate?

It is a real question. The SAT and GRE vocabularies genuinely overlap — perhaps
a third of a good SAT list would not be out of place on a GRE list.

## Decision

**Uniqueness is enforced within a track and deliberately not across them.**

- The SAT corpus contains each word once.
- The GRE corpus contains each word once.
- A word may appear in both.

### Why

Forcing disjointness would damage both corpora, in opposite directions:

- **SAT would lose its best words.** The overlap is not accidental — it is the
  useful middle of the English academic register, and it is exactly what an SAT
  candidate needs most. Excluding it because a GRE corpus claimed it first
  would leave SAT with the leftovers.
- **GRE would be pushed toward obscurity.** The corpus audit already found that
  3,240 words is at the ceiling of the *excellent* GRE vocabulary. Removing a
  thousand overlapping words and demanding the count be made up would push the
  remainder into words nobody writes.

And the pedagogy points the same way. A student who met *abate* at sixteen for
the SAT and meets it again at twenty-two for the GRE is not being cheated. They
are being tested on it again, at a different level, in a different sentence,
after six years — which is what spaced repetition would have recommended anyway.

The tracks are separate curricula, not two halves of one.

## What this means concretely

- Two dedup indexes, built identically, never consulted across tracks.
- `sat-abate` and `gre-abate` are different rows with independent progress
  ([ADR 0011](./0011-tracks.md)), independent scheduling and independent
  mastery. Learning one does not mark the other.
- The corpus audit asserts uniqueness **per track**, and separately reports the
  overlap between them as information rather than as a failure. A GRE/SAT
  overlap near zero would be as suspicious as one near total: it would mean one
  of the corpora is not what it claims to be.

## What it turned out to be

The SAT corpus was generated in Phase 17 and the audit measured the overlap:

> gre and sat share 1,420 words (59% of the smaller corpus)

That is **higher than this record guessed**. The context section above says
"perhaps a third", and a third was wrong: nearly three in five SAT words are
also GRE words. Two things account for it, and only one is about the language.

The real one is that the register genuinely converges. *Candid*, *austere*,
*fastidious*, *laconic* belong on both lists, and an SAT corpus that excluded
them would not be an SAT corpus. The other is a property of how these were
made: the same model wrote both, and the exclusion list it sees while choosing
SAT words contains only SAT words, so nothing pushes it away from vocabulary
it had already reached for once.

The figure is recorded rather than corrected because it is the kind of number
that should be argued with evidence. If a future reader thinks 59% is too high
for two corpora that claim to be different levels, the lever is the generation
prompt — ask for words *below* the GRE register rather than merely for SAT
words — not a dedup rule. Forcing disjointness remains the wrong fix, for the
reasons above.

## The one thing this must not become

Silent duplication *within* a track, excused by "it is in the other one too".
The per-track guarantee is unchanged and remains the harder one to hold, since
each corpus is near the ceiling of its own vocabulary. The audit keeps failing
on a within-track collision, loudly.

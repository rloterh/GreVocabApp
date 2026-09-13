# ADR 0014 — `dev` is the default branch; `main` is what shipped

**Status:** accepted · 2026-09-12

## Context

Until now every commit landed on `main`, which was also the branch a visitor to
the repository sees first and the branch a release is cut from. That was fine
while changes were small and independently shippable.

The tracks work is neither. It changes word ids, month keys, the corpus layout
on disk and the persisted store shape, and it is only coherent once all of it
has landed. A half-migrated `main` is not a state anyone should be able to
clone — it would show a corpus in the new layout and a store that cannot read
it, and there is no commit ordering that avoids the window.

## Decision

**`dev` is the default branch. `main` holds releases.**

- Feature work branches from `dev` and merges to `dev`.
- `dev` merges to `main` when a coherent set of work is finished and verified.
- `main` is never committed to directly.
- Both are pushed; neither is rewritten once pushed.

The GitHub default branch is `dev`, so pull requests target it by default and a
visitor sees current work rather than the last release.

### What must be true before `dev` merges to `main`

Not a ceremony — this is the list that would have caught the things that
actually went wrong in this project:

1. `npm run typecheck` and `npm run build` green.
2. The full test suite green, including the migration tests.
3. The corpus audit passes for **every** track.
4. The browser drivers pass: desktop, keyboard, mobile, and tablet.
5. The migration acceptance test holds — a pre-migration backup, restored
   after migration, is unchanged ([SCHEDULE.md](../SCHEDULE.md)).
6. README and CHANGELOG describe what is on the branch.

## Consequences

- Release notes have an obvious boundary: whatever `main` gained.
- A user cloning the repository gets a working app, not a mid-migration one.
- Two branches to keep in sync, and the discipline to actually merge rather
  than letting `main` rot six months behind. The mitigation is that the merge
  is cheap while it is frequent, so it happens at the end of each phase rather
  than being saved up.

## Alternatives considered

**Keep committing to `main`, use tags for releases.** What we had. It works
only when every commit is independently shippable, which this work is not.

**Long-lived feature branches off `main`.** Same protection, but the shared
integration point disappears — two feature branches touching the store shape
would discover each other at merge time rather than on `dev`.

**Trunk-based with feature flags.** The honest alternative, and rejected for
this specific change: a flag around a data migration means shipping code that
can read two store shapes, indefinitely, which is more permanent complexity
than a branch that lives for a few weeks.

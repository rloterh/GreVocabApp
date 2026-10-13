# ADR 0017 — Tracks are shown as Advanced and Easy; their ids stay `gre` and `sat`

**Status:** accepted · 2026-10-13

## Context

ADR 0011 made tracks first-class as `"gre" | "sat"`, and the UI labels them
"GRE" and "SAT". The owner wants the app to stop presenting itself as exam
prep: the tracks should read as **Advanced** and **Easy**.

The ids are not just labels. They are inside every word id (`gre-abstemious`),
every month key (`gre/07`), every progress record's key, the corpus directory
layout (`public/vocab/gre/`), backups users already hold, and the dedup
ledger. ADR 0011 spent a whole migration getting calendar months *out* of
those ids, and the migration's tests are the only reason it did not lose
anybody's progress.

## Decision

**Rename the display, never the identity.**

- `TRACK_META.gre.label` becomes `"Advanced"` and `TRACK_META.sat.label`
  becomes `"Easy"`. Descriptions drop the exam names: "Demanding,
  lower-frequency words" and "Essential academic words".
- The switcher lists Easy first. `TRACKS` keeps its order, and display order is
  a separate constant, so nothing that iterates tracks changes behaviour.
- `Track`, word ids, month keys, directories, storage keys and backups are
  **unchanged**. No migration.
- Text that steers the generator ("GRE high-frequency", "demanding GRE
  vocabulary") stays, because it describes a register to a model that knows
  what the GRE is. User-visible placeholders that show those strings change.

## Why not rename the ids too

It would be a second ADR 0011 migration (every progress key, every reference,
every backup ever exported) for a change nobody can see. And the labels may
change again — "Easy" undersells words like *ubiquitous* — so tying identity to
today's label would make every future rename a migration.

## Consequences

- Anyone reading code sees `gre` where the screen says Advanced. Comments at
  `src/lib/track.ts` and `src/types/index.ts` say so, and point here.
- **Do not "finish" this rename.** A PR that renames `gre` to `advanced` in ids
  is the migration this ADR refuses.
- Tests asserting on the strings "GRE" and "SAT" in rendered output change with
  the labels. Tests asserting on ids do not.
- The name of the Hard game tier is chosen not to collide: the tracks are
  *Advanced* and *Easy*, and the tiers are *Warm-up, Standard, Hard,
  Fiendish*.

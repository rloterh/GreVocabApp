# ADR 0018 — Picture It is drawn in-house, as theme-native diagrams

**Status:** accepted · 2026-10-14 · the Phase 24 spike ([ROADMAP.md](../../ROADMAP.md))

## Context

Picture It is the Merriam-Webster *Name That Thing* analogue: an image, an
arrow at one part of it, and four names to choose from (a guitar's *fret*, a
house's *lintel*). It was deferred from the start (docs/GAMES.md §4.10)
because it is the one game the corpus cannot feed. Lexicon's words are
abstract — *abstemious*, *chagrin* — and almost none can be drawn. Picture It
needs its own pack of concrete things *and their parts*, with art.

The question for the spike was where that art comes from, at what cost, and
under what licence, for an MIT app sold on a store.

## What was measured

| Source | Licence (checked at source) | Fit for "name this part" | Cost for ~150 |
| --- | --- | --- | --- |
| [Openclipart](https://openclipart.org/faq) | CC0, public domain | Whole objects in mixed styles; parts would still need annotating, and the mixed styles would not read as one app | Free, plus annotation |
| [Fluent Emoji](https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE) (Microsoft) | MIT | Whole objects only (amphora, abacus, trident); **no parts**; perhaps 40–60 vocabulary-grade objects in the whole set | Free |
| [Noto Emoji](https://github.com/googlefonts/noto-emoji) (Google) | Apache 2.0 for image resources | As Fluent | Free |
| [OpenMoji](https://openmoji.org/faq) | CC BY-SA 4.0 | As Fluent, plus attribution and share-alike obligations on anything adapted | Free, with obligations |
| Commissioned illustration | Owned outright | Exactly right | $50–150 per spot illustration at entry rates ([Solohourly](https://solohourly.com/rates/illustrator-rates-in-united-states), [Automateed](https://automateed.com/childrens-book-illustration-cost)) — **about $7,500–22,500**, before revisions |
| **In-house diagrams** | Ours, MIT with the app | Built for it: each part is an addressable shape | Engineering time |

The emoji sets fail the format itself: an emoji is a whole object, and the
best question in the reference — *which part is this?* — has nothing to point
at. The figures on illustration rates come from general blogs, not a 2025
survey; they are a band, not a quote.

## The prototype

`docs/spikes/picture-it/house.html` is a working question: a house front in
twelve shapes, nine named parts (gable, eave, gutter, bargeboard, finial,
chimney, lintel, sill, transom), one highlighted, a callout to it, and four
options. Screenshots, light and dark, are beside it.

What it showed:

- **It reads as part of the app,** not as stock art. Line, fill and highlight
  are theme tokens, so it is right in all ten themes — the contrast test
  covers it — with no raster asset and no per-theme work.
- **The highlight is unambiguous,** even for a thin part like a bargeboard: a
  filled shape plus a callout tip on it.
- **The options are other parts of the same object.** That is what makes the
  question fair and hard at once — every option is a real part of a house —
  and it needs no distractor scorer at all.
- **It is schematic, not illustrated.** Clean and consistent, not painterly.
  A commissioned illustrator would do more; whether the difference is worth
  $7,500 or more is the owner's call, and the in-house set does not prevent
  commissioning later — the question format and data shape would not change.

## Decision

**Draw Picture It in-house**, as a pack of about ten diagrams with eight to
ten named parts each — 80 to 100 questions:

- *Candidates:* a house front, a classical column and its entablature, a
  ship, a guitar, a castle, a church (nave, apse, transept), a book (spine,
  gutter, colophon), a clock, a flower, the human ear or eye.
- *Data:* each diagram is an SVG whose part shapes carry ids, plus a small
  table of part → name → anchor point → definition. Distractors are the
  same diagram's other parts.
- *Not tied to a track.* These are general words, not Advanced or Easy
  vocabulary; the game takes no tier and no Mine.
- *Reviewed like the rest.* A blind read of every question: is the
  highlighted part unambiguous, and is the key its right name? Fewer than 2%
  flagged, as for every other game.
- *Never feeds the scheduler,* since none of these words are in a track.

## Consequences

- Phase 24 becomes: draw ten diagrams, add the game, review it, ship it.
  No budget, no licence, no attribution line.
- If the owner would rather commission, this ADR's data shape is the brief:
  an illustrator delivers SVGs with named part layers, and the game code is
  unchanged.
- The house prototype stays in `docs/spikes/` as the reference for style.

## Outcome

Accepted by the owner on 2026-10-14 and built the same day. The pack is ten
diagrams with 86 parts: a house, a classical temple, a sailing ship, an
acoustic guitar, a castle, a church in plan, a wristwatch, a flower, a human
eye and a shoe. The book and the clock gave way to the watch and the shoe,
which have more parts that a non-specialist can name.

The blind review was run from rendered sheets, with the tiles shuffled and
unlabelled, and the reviewer naming each lit part from the diagram's full
list. It earned its keep: the first pass flagged **10 of 86** (11.6%) —
nothing mislabelled, but parts drawn so that a fair player could not be sure.
Redrawn, a fresh shuffle flagged 2 (2.3%), both from one cause, a jib drawn
larger than the mainsail. The ship, guitar and watch went round again, and
the watch twice more — its minute and second hands were too alike once lit,
then a callout ran along a hand and changed its apparent shape. Every
diagram's last pass, on a fresh shuffle, flagged none, and every pass named
every part correctly. What the review taught is in docs/GAMES.md §4.10:
two parts that differ only in size or position need a shape that tells them
apart, not just a different place on the page.

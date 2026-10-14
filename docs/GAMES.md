# Games

A section of short, timed, scored rounds: the same vocabulary the scheduler
teaches, practised at speed and for fun.

**Status: v1.2, in progress.** Phase 19 is built: the engine, the shell, the
hub and Closest Meaning. The rest is sequenced as Phases 20–25 in
[`../ROADMAP.md`](../ROADMAP.md). The decision that makes it possible at all —
scored rounds in an app that has refused points since v0.1 — is
[ADR 0016](./adr/0016-games-are-rounds-not-progression.md), accepted
2026-10-13. The track rename that ships with it is
[ADR 0017](./adr/0017-track-display-names.md).

Visual and interaction detail is in [GAMES-UI.md](./GAMES-UI.md). Ready-to-run
implementation prompts, one per phase, are in [GAMES-PROMPTS.md](./GAMES-PROMPTS.md).

---

## 1. The problem

Lexicon is good at teaching and measuring vocabulary: the scheduler decides what
is due, flashcards drill recall, and quizzes and exams check what you know.
What it does not have is anything you would open *for fun* on a day
you do not feel like studying. That day is when a streak breaks, and a broken
streak is when people stop.

The request is a games section modelled on Merriam-Webster's word games:
several game types, difficulty tiers, a timer, a score, and a personal best. It
should feel premium and complete, not like a demo.

## 2. What the reference does

Twenty-five screenshots of the Merriam-Webster Android app (tablet, portrait and
landscape), studied screen by screen. They are kept outside the repo; nothing
from them is copied (see §2.4).

### 2.1 Structure

| Screen | What it shows |
| --- | --- |
| **Home** | Two tiles: Word of the Day and Word Games ("Play M-W Quizzes ›"). |
| **Games hub** | Three full-width banners, each a typographic cover on the left and tier buttons on the right. Tapping a tier goes straight into that game. |
| **Rules card** | Modal over a dimmed HUD: game name, then three lines: "You'll have 10 seconds to answer each question. The faster you answer, the higher your score. The harder the question, the higher your score." One action: **Play ›**. |
| **Question** | HUD at the top with three cells: pause button + **QUESTION 3/10**, **TIME :08**, **SCORE 440**. Prompt centred and large. Four full-width option bars below. |
| **Feedback** | The chosen wrong option keeps its colour and gains a red ✗; the right option turns green. A correct pick turns green with a ✓. It auto-advances after about a second. |
| **Timer** | Counts down in orange. At ≤3 s the TIME cell turns red. When it runs out, the question is lost and recorded as "time ran out". |
| **Pause** | Modal: Resume quiz ›, New *Light* quiz ›, Exit quiz ›, and an **Audio: ON | OFF** toggle. |
| **Results** | "SCORE **620!** That's a Personal Best", then "WORDS YOU GOT RIGHT 2 of 10", then Replay *Light Vocab* ›, Review answers ›, Exit quiz ›. |
| **Review** | "Review Answers · Tap for definitions". One row per question: word on the left; your answer in green ✓ or red ✗ on the right, and for misses "correct: *slaughterhouse*" underneath. Time-outs read "time ran out". |

### 2.2 The three games

| Game | Prompt → answer | Tiers | Timer |
| --- | --- | --- | --- |
| **How Strong Is Your Vocabulary?** | A word (*chagrin*) → its closest synonym from four (*embarrassment*) | Light · Medium · Hard · Devilish | 10 s |
| **True or False** | A statement (*"The flying squirrel is the only flying mammal."*) → TRUE / FALSE, then a one-sentence explanation and "Tap anywhere to continue" | Light · Difficult | 15 s |
| **Name That Thing** | An illustration with an arrow pointing at a part (a guitar's fret) → its name from four | Light · Difficult | 10 s |

### 2.3 Observations

What it does well:

- **Zero setup.** One tap from the hub, one tap on the rules card, and you are
  playing. The tier *is* the start button.
- **The HUD is always legible.** Three numbers, fixed positions, large digits.
- **Feedback is instant and unambiguous:** your pick and the right answer, both
  marked, together.
- **The T/F explanation is the learning moment.** You find out *why*, and the
  timer waits while you read.
- **Review is where a round turns into study.** Every miss, with the right
  answer, one tap from a definition.

What it does badly, which is our opportunity:

- **Distractors are sometimes defensible.** *leverage* → "power" was correct
  over "flexibility" and "cooperation". Both are arguable. A game that marks you
  wrong for a defensible answer stops being fun quickly.
- **"Personal best" on the first ever round** (2 of 10 right, 620 points). It is
  praise for nothing, and it teaches you to ignore the message.
- **Scores do not explain themselves.** 440 points stays flat across misses, and
  a T/F round reached 2,100. Nothing on screen says how speed and difficulty
  turned into that number.
- **"Tap anywhere to continue" is red**, the colour the screen uses for wrong.
- **Ads cover a fifth of the screen**, and one sat between the options and the
  thumb.
- **No keyboard, no reduced motion, no light theme**, and the rules card blocks
  a HUD that is already rendered underneath it.
- **True or False is general trivia,** not vocabulary. Fun, but it teaches
  nothing this app is for.
- **Name That Thing needs a commissioned illustration for every question.**
  That is a content operation, not a feature.

### 2.4 What we take, and what we must not

**Take:** the flow (hub → rules → ten questions → results → review), tiers
that start the game, the three-number HUD, a per-question timer that changes
colour near the end, both-answers-marked feedback, an explanation that pauses
the clock, a pause menu with an audio toggle, and a review list.

**Do not take:** names, cover typography (the ✓-for-U and ✗-for-A marks),
questions, statements, illustrations, colours or copy. Every game below has its
own name and its own content, and that content comes from Lexicon's corpus.
"Devilish", "Name That Thing" and "How Strong Is Your Vocabulary?" are theirs.

## 3. Constraints that are real

1. **ADR 0006 refuses points.** Accepting a scored game means amending it, not
   ignoring it. [ADR 0016](./adr/0016-games-are-rounds-not-progression.md)
   draws the line: a score lives and dies inside a round, and the only thing
   that persists is a best per game. There is no total, no XP, no level, no
   badge.
2. **Progress is orthogonal to vocab, and the scheduler is the source of truth
   about what you know.** A ten-second timer is a measure of speed under
   pressure, not of recall. Games must not quietly rewrite SM-2 state (§7).
3. **No progress record may be orphaned.** That rule is asserted at launch and
   in the migration tests. Games draw words from months the user has *not*
   loaded, so a game that wrote progress for those words would create orphans
   by design (§7).
4. **Three stores, and nothing else touches `localStorage`.** Game history goes
   into `useProgressStore`; game preferences go into `useSettingsStore`. There
   is no fourth store.
5. **The `localStorage` budget is shared** by the corpus, progress and settings.
   Game history is capped and stores word ids, not text.
6. **Selectors return primitives or stable references**
   ([CONTINUING.md](../CONTINUING.md) principle 6). The games hub reads bests
   and history, which is exactly the shape that caused the blank-window bug
   twice. Use a pure function plus a memoised hook (§8.4).
7. **It has to work offline, on Android, at 360 px**, with touch, keyboard and a
   screen reader, in all ten themes.

## 4. The catalogue

Eight games and a daily challenge. Every one is built from fields the corpus
already has: all 5,421 words have a definition, part of speech and example,
5,418 have synonyms and 4,952 have antonyms. Nothing new needs authoring except
the picture pack in §4.10, which is drawn in-house.

Names are working titles, chosen to be plain, ours, and self-explanatory.

| # | Game | Mechanic | Answer | Timer | Phase | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **Closest Meaning** | word → its synonym | 4 options | 10 s | 19 | P0 |
| 2 | **Fact or Fiction** | statement about a word → true/false, then *why* | 2 options | 15 s | 20 | P0 |
| 3 | **Opposites** | word → its antonym, with a synonym as the trap | 4 options | 10 s | 20 | P0 |
| 4 | **Fill the Gap** | example sentence with the word blanked → the word | 4 options | 15 s | 20 | P1 |
| 5 | **Odd One Out** | four words, three share a meaning → the outsider | 4 tiles | 12 s | 21 | P1 |
| 6 | **Match Up** | five words, five definitions → pair them | board | 60 s / board | 21 | P1 |
| 7 | **Spell It** | hear it + read the definition → type it | text | 20 s | 21 | P1 |
| 8 | **Unscramble** | definition + shuffled letter tiles → the word | tiles | 25 s | 23 | P2 |
| 9 | **Daily Round** | ten mixed questions, the same for everyone that day | mixed | per type | 22 | P1 |
| 10 | **Picture It** | a diagram with one part lit → that part's name | 4 options | 12 s | 24 | P2 |

The first three cover all three of the reference's games: Closest Meaning is
*How Strong*, Fact or Fiction is *True or False* turned into vocabulary, and
Picture It is the *Name That Thing* analogue, with its own drawn pack for
the reason in §4.10. The rest are where this section stops being a copy.

### 4.1 Closest Meaning

> **chagrin**
> ◻ surprise  ◻ embarrassment  ◻ amusement  ◻ satisfaction

- **Correct option:** the card's **first** usable synonym (single word, not a
  form of the headword, ≤ 16 characters), on every tier. The lists were
  written best-first. The draft's shortest-first ranking chose *inquisitive* →
  "nosy" over "curious", and a blind review caught it.
- **Eligibility:** at least **two** usable synonyms. A card with one is usually
  a word with no true synonym (*deciduous* → "broadleaf", *bracken* →
  "fern"). That costs 68 of 5,421 words.
- **Distractors:** three words chosen by the existing scorer
  (`pickDistractors`, same part of speech first), but **without its same-month
  bonus**. Months are themed, so a same-month word is the likeliest
  near-synonym in the corpus. Each is shown as **one of its own synonyms**
  rather than its headword, so all four options sit at the same register.
- **The defensibility guard** (§6.2) runs on every option. It is the reason
  this game exists in our version, given that the reference fails it.
- **Fiendish:** the same key; distractors are matched to its length, and the
  timer is 30% shorter. The draft took the *least* familiar synonym instead,
  which turned out to mean the loosest one (*harrow* → "cultivator").

### 4.2 Fact or Fiction

*As built:* the Synonym and Opposite templates state a pair only when **both
cards name it**. One card's list was too weak: blind reads found *dread* called
the opposite of "anticipate". Without a confirmed pair, the builder falls back
to Means or Root. Definitions written "Describing …" read as "“x” describes …".
The Usage template is still P2. Review history: 4.0% → 2.0% → 0.5%.

> **"Laconic" means using very few words.**
> [ Fact ]  [ Fiction ]
> *Laconic: using very few words. "His laconic reply — 'No.' — ended the meeting."*

Statement templates, all generated from the corpus:

| Template | True form | False form | Tiers |
| --- | --- | --- | --- |
| **Means** | "*X* means ‹X's definition›." | "*X* means ‹a distractor's definition›." | all |
| **Synonym** | "*X* and *S* mean nearly the same thing." | *S* is an antonym of *X*, or an unrelated same-POS word | all |
| **Opposite** | "*X* is the opposite of *A*." | *A* is a synonym of *X* | Standard+ |
| **Usage** | "*X* is used correctly here: ‹X's example›" | another word's example with *X* substituted for it | Hard+ — **P2**, see below |
| **Root** | "*X* shares a root with *Y*." | *Y* from a different family | Hard+ (only where `roots.ts` has a family) |

- **Explanation, always.** After the answer, the card shows the word's
  definition and example, and for a false statement the line that was swapped
  in, with its own word ("That's the definition of *loquacious*"). The timer is
  stopped while it shows. **Continue** is Enter, Space, a tap, or the button.
- **Balance:** 50 % true ± 1 per round, and never four of the same in a row.
  This is seeded, so a round is reproducible in a test.
- **Usage is P2** because a substituted sentence is often ungrammatical, which
  gives the answer away. It needs either an inflection-aware substitution or
  AI-written misuse sentences ([GAMES-PROMPTS.md](./GAMES-PROMPTS.md) §B.2),
  validated before use.

### 4.3 Opposites

*As built:* the key is the card's first usable antonym, and the word needs two.
For **nouns and verbs** the key must also be confirmed by the antonym's own
card. Their unconfirmed lists produced *silt* → "gravel" and *supplant* →
"retain", while adjectives' lists held up. A key that the word's own lists also
treat as a synonym disqualifies the word. Review history: 2.5% → 3.0% → 0.5%.

The antonym version of Closest Meaning, with one twist that makes it a real
skill rather than a reflex: **from Standard upwards, one distractor is a
synonym of the word.** It is the classic trap in antonym questions, and
learning to spot it is worth more than the antonym itself.

- Only words with at least one eligible antonym are drawn (91 % of the corpus).
- The trap is visible in review: "*verbose* means the same as *garrulous*, not
  the opposite."

### 4.4 Fill the Gap

*As built:* a sentence that still contains the word after blanking ("for want
of a nail … for want of a shoe") is skipped. Wrong options are the same part of
speech and pass the Closest Meaning guard, because a near-synonym fits a
sentence as well as its partner. Review history: 2.5% → 0.5%.

> She was ________ about her plans, refusing every question with a smile.
> ◻ reticent  ◻ voluble  ◻ candid  ◻ strident

- **Sentence:** the word's own example, blanked by `blankOut` from
  `src/lib/confusables.ts`. It already handles inflections (*belied* for
  *belie*). A word whose example cannot be blanked is skipped, never shown
  half-blanked.
- **Options:** headwords, same part of speech, through `pickDistractors`.
  Options are shown as base forms, with "any form" in the instruction line
  because the gap may be inflected.
- **After the answer:** the full sentence with the word in place and
  highlighted.

### 4.5 Odd One Out

*As built:* the two synonyms must be linked to each other — one listing the
other, or a third card listing both — and at least one must be confirmed. That
fixes split senses (*sobriety* → "abstinence" and "seriousness"). The note
says "close in meaning". Review history: 3.5% → 1.0%.

> Which one doesn't belong?
> ◻ ephemeral  ◻ fleeting  ◻ transient  ◻ **tenacious**

- **The three:** the target word plus two of its eligible synonyms.
- **The outsider:** a same-POS word with no synonym relation to *any* of the
  three, checked by the defensibility guard in both directions.
- **Fiendish:** the outsider is a high-scoring distractor (similar length, same
  register), and the three are shown in random order, not with the headword
  first.
- **After the answer:** what the three share ("all mean *short-lived*"), using
  the target's definition.

### 4.6 Match Up

*As built:* three boards, 60 s each. The five words are mutually unrelated,
and Warm-up boards prefer confirmed synonyms. Points: 40% of base per pair,
plus up to one base for the time left on a finished board. Tab and Enter play
it; arrow-key movement within a column was not built. Review history: 0.5% on
the first read.

A board of five words and five definitions. Tap a word, then its definition (or
the other way round). A right pair locks in, slides together and fades. A wrong
pair flashes and costs two seconds.

- **Round:** three boards, 60 s each. Points per pair, plus time left on the
  board as a bonus.
- **Warm-up variant:** words to synonyms instead of definitions. They are
  shorter, so they fit a phone better.
- **Definitions are shown in full**, not truncated. A truncated definition is a
  different definition. The board scrolls on a phone if it must.
- **Keyboard:** arrows move within a column, Tab switches columns, and
  Enter/Space selects.

### 4.7 Spell It

*As built:* `acceptedSpellings` takes the regular British/American patterns
(-ize/-ise, -or/-our, -er/-re, doubled l, -ense/-ence, -og/-ogue), ignores
hyphens, spaces and accents, and has a reviewed list of one-off variants. This
supersedes "nothing fuzzier" below: every flag in the first read was a correct
spelling marked wrong. Review history: 3.0% → 0.5%.

> 🔊 (plays the word)
> *adj.* — using very few words · 7 letters
> [ _ _ _ _ _ _ _ ]   Hint (−50 %)

- **Audio** through `src/lib/speech.ts`, using the user's chosen voice and rate.
  Replay is free and unlimited.
- **Input:** a single text field with `autocomplete="off"`,
  `autocorrect="off"`, `autocapitalize="off"` and `spellcheck={false}`. Mobile
  autocorrect would otherwise either answer for the user or "fix" a right answer
  into a wrong one.
- **Matching:** case-insensitive and trimmed. Exact spelling, or one of the
  word's listed spelling variants if the corpus ever carries them. Nothing
  fuzzier: this game *is* the spelling.
- **Hint:** reveals the first letter and halves that question's points.
- **No speech available** (`canSpeak()` false): the game is still playable from
  the definition and letter count, and the intro card says so rather than
  showing a dead speaker button.

### 4.8 Unscramble (P2)

*As built:* five to ten letters. A word is never asked if its letters spell
another word: one in the corpus (*discreet*/*discrete*), or one in SCOWL's
common-English levels (*tacit*/"attic"). The common-English check runs at
build time into `public/vocab/anagram-risk.json`. Wrong arrangements shake and
clear, costing only time. 25 seconds. Review history: 6.0% → 0%.

The definition plus the word's letters as shuffled tiles. Tap tiles into slots,
tap a slot to return its tile. Shuffles are re-drawn if they spell the word, or
a word in the pool.

### 4.9 Daily Round

*As built:* the mix is 3 Closest Meaning, 3 Fact or Fiction, 2 Opposites and
2 Fill the Gap, every question at 15 seconds. No best is kept for it. Each
round stores its right/wrong pattern, so a result shared later is the real
one. `daily-record.ts` holds the record of days played apart from the
builders, so the Dashboard can show it cheaply.

One round a day: ten questions drawn from four game types (Closest Meaning,
Fact or Fiction, Opposites, Fill the Gap), on the active track, at Standard.

- **Seeded by date and track**, like the word of the day
  (`src/lib/word-of-the-day.ts`), so everyone on the same version gets the same
  round, and it holds until midnight.
- **The first completed attempt counts.** It is recorded as that day's result.
  Replays are allowed and marked as practice.
- **A calendar strip** of the last fourteen days: played, missed, or today. It
  is *not* a second streak; it is a record, and missing a day shows nothing
  red.
- **Share** (P2, and only if ADR 0016 is accepted with that clause): a plain
  text summary for the clipboard — `Lexicon Daily · 13 Oct · 8/10` plus a
  row of ten squares. No link, no server, nothing comparative inside the app.

### 4.10 Picture It (P2, built in Phase 24)

> *A sailing ship* — a drawing with one part lit and a callout to it
> ◻ boom  ◻ jib  ◻ bowsprit  ◻ mainsail

The *Name That Thing* analogue, and the one game the corpus cannot feed:
Lexicon's words are abstract, and almost none can be drawn. It has its own
pack instead — [ADR 0018](./adr/0018-picture-it-in-house-diagrams.md) records
why it is drawn in-house rather than sourced or commissioned.

- **The pack:** ten diagrams — a house, a classical temple, a sailing ship, an
  acoustic guitar, a castle, a church in plan, a wristwatch, a flower, a human
  eye and a shoe — with **86 named parts** between them
  (`src/lib/games/pictures/diagrams.ts`). Each diagram is plain shapes on a
  440 × 330 canvas; a shape that belongs to a part carries its id.
- **Drawn in theme tokens** (`PictureDiagram.tsx`): outlines in the ink colour,
  pieces in the secondary surface, the asked part in the accent with a callout
  to it. Right in every theme, with no raster asset.
- **Options are three other parts of the same object.** "Which part of the
  house is this?" with *eave*, *lintel* and *bargeboard* beside the answer is a
  real question; with *keel* and *iris* it would be a matching exercise. No
  distractor scorer, no defensibility guard — the same-object rule is both.
- **Only parts you can point at on their own.** Wholes that contain an asked
  part are left out — *stamen* (anther and filament both show), *hull* (bow and
  stern are sections of it), *pediment* (the tympanum is its face) — because
  lighting a whole makes two answers defensible.
- **A round:** ten parts, at most two from one diagram, 12 seconds each.
- **Tierless and trackless.** These are general words, not Advanced or Easy
  vocabulary, so the card has one Play button, the best is kept once, and a
  round needs no word files — it plays offline from the first launch.
- **Never feeds the scheduler:** none of these words are in a track, so the
  review list shows the drawing and the definition, and never offers
  Flashcards or the library.
- **Quality:** every part is blind-reviewed from rendered, unlabelled sheets
  (§9). The first pass flagged 10 of 86 — a gutter and an eave drawn as two
  identical bars, watch hands told apart only by a few pixels, a buckle that
  read as a strap keeper, a shoe whose eyelets sat on the vamp, a moat drawn as
  a slab. Redrawn, a fresh pass flagged 2 (a jib larger than the mainsail).
  The ship, guitar and watch were checked again: the minute and second hands
  were still too alike once lit, and then one callout ran along its hand and
  stretched it. Every diagram's last pass, on a fresh shuffle, flagged none.
  A second hand has a counterweight for a reason.

## 5. Tiers

Every game has the same four tiers plus one personal deck. A tier picker that
changed shape from game to game would need learning.

| Tier | Words drawn from | Distractors | Timer | Base points |
| --- | --- | --- | --- | --- |
| **Warm-up** | first third of the active track's months | standard scorer | standard | 100 |
| **Standard** | middle third | standard scorer | standard | 150 |
| **Hard** | final third | standard scorer + same-length bias | standard | 200 |
| **Fiendish** | final third | strictest (§4 per game) | **−30 %** | 300 |
| **My words** | words the user has studied (`timesReviewed > 0`) on the active track | standard scorer | standard | 150 |

- **Thirds are computed from `public/vocab/index.json`**, never hard-coded. The
  Advanced track has 38 months and Easy has 36. Any regeneration moves the
  boundaries, and nothing else should have to know.
- **Tiers are per track.** Easy's Hard tier is easier than Advanced's Warm-up
  in absolute terms, and that is fine: a track is a different notebook
  ([ADR 0011](./adr/0011-tracks.md)). Bests are kept per track.
- **My words** is the bridge back to study. It is the default tier once a user
  has studied 40 words, and the only deck where review actions (§7) appear.
- **No adaptive difficulty within a round,** for the reason QUIZ-AND-EXAMS.md
  gives: it makes rounds incomparable.

## 6. The engine

All pure, all in `src/lib/games/`, with randomness and the clock injected.

```
src/lib/games/
  types.ts           GameId, Tier, GameQuestion (discriminated union), GameRound, GameResult
  catalogue.ts       one GameDefinition per game: id, name, blurb, timer, tiers, builder
  pool.ts            tier → word pool (bands from the index; "My words" from progress)
  relations.ts       synonym/antonym graph, eligibility, the defensibility guard
  builders/          one pure builder per game: (pool, ctx) → GameQuestion | null
  round.ts           buildRound(game, tier, pool, seed) → GameRound (10 questions, no repeats)
  session.ts         the play state machine (reducer) — §6.3
  scoring.ts         points per answer, round totals, best comparison — §6.4
  daily.ts           the Daily Round seed and composition
```

### 6.1 Questions

```ts
type GameQuestion =
  | { kind: "choice";  wordId: string; prompt: Prompt; options: string[]; answer: number; explain: Explanation }
  | { kind: "verdict"; wordId: string; statement: string; truth: boolean; explain: Explanation }
  | { kind: "odd";     wordIds: string[]; options: string[]; answer: number; explain: Explanation }
  | { kind: "match";   pairs: Array<{ wordId: string; left: string; right: string }> }
  | { kind: "spell";   wordId: string; definition: string; pos: string; length: number; answer: string }
  | { kind: "tiles";   wordId: string; definition: string; tiles: string[]; answer: string };
```

A builder returns `null` rather than a weak question, the same rule
`buildQuestion` already follows ("a question the user can guess by elimination
is worse than one question fewer"). `buildRound` draws until it has ten, and
reports a shortfall rather than padding. A pool too small for a round
(My words with fifteen studied words, say) is reported to the hub, which then
shows "Study a few more words to unlock this tier". It never starts a short
round silently.

### 6.2 The defensibility guard

The single most important function in the section. A game that marks a
defensible answer wrong is worse than no game.

As built (`src/lib/games/relations.ts`). Every comparison is by `stem()` and
in both directions. A wrong option is refused if its stem is in the target's
**meaning neighbourhood**, which is:

1. the headword and its inflections;
2. its synonyms, and the headwords that list it as a synonym;
3. **one-sided second hops**: synonyms of its synonyms, and headwords sharing
   a synonym with it. (The design draft required both sides to agree. The
   audit showed that over-rejecting is cheap, with 100% of eligible words still
   building, and under-rejecting is not.)
4. **content words of its own definition.** If *jaunty* is defined as
   "lively, cheerful and confident", "cheerful" is right whatever its card says;
5. **words that share an opposite with it**, and their synonyms. *Illegal* and
   *illegitimate* are both the opposite of *legal*.

The word supplying a wrong option is refused as well if its own synonyms
overlap the neighbourhood, if its definition uses a word from the
neighbourhood, or if its definition shares **any** content word with the
target's. Filler such as "showing", "quality" and "feeling" doesn't count.
Options are also unique by stem.

**Reviewed exclusions.** Some closeness lives in no card: "uncover" is a fair
answer to *unravel* (key: "solve"), and nothing links them. `REVIEWED_EXCLUSIONS`
in `relations.ts` holds what reads of the audit sample found and no general
rule could catch without wrecking the pool. Entries only ever remove options.

**The graph is the whole corpus, not the round's tier.** The link that makes an
option defensible is often on a card in another month: *extol* was offered as
wrong for *eulogize* because *laud → extol* lived in a different third of the
track. So the graph is read from `public/vocab/relations.json`, generated by
`scripts/build-relations.ts`. It is 400 KB, where fetching every month would
be 3.6 MB, and the audit fails if the file is stale.

And a **correct** option is only eligible if it is a single word, has no
spaces, is not stem-equal to the headword, and is ≤ 16 characters.

**This is a measurement problem as much as a code problem.** The synonym lists
were model-generated to complete the corpus, and some are weak (*sinecure* →
*cinch* is the kind of thing that slips through). Phase 19 therefore ends with
an **eligibility audit** (`scripts/audit-games.ts`): per track and tier, how
many words can host each game, plus a 200-question sample printed for a reader.
The game does not ship until a read finds fewer than 2% of the sample
defective.

**How to read it honestly.** Fixes tuned against one sample must be judged on
a **fresh** one: `audit-games.ts <vocab> <out> <seed>` draws a different 200.
The reader should be **blind** — told the rubric, not what earlier reads found.
In Phase 19, the first independent read found 5.0% on seed 1, mostly
near-synonym distractors. After the general fixes, a blind read of seed 2
found 2.0%, half of it wrong keys. After the key fixes, a third blind reader
found **1.5% on seed 3, with no wrong keys**, which passes. Every later game
gets the same treatment: a fresh seed and a blind reader for each round of
fixes.

### 6.3 Session state machine

```
            START                ANSWER / TIMEOUT
  intro ───────────▶ asking ─────────────────────▶ feedback
                      ▲   │ PAUSE                     │ (auto 900 ms, or CONTINUE for verdicts)
                      │   ▼                           ▼
                      └ paused ◀── PAUSE ──── next question ──▶ … ──▶ results ──▶ review
```

- A reducer, `(state, event, now) → state`. **Time is computed from
  timestamps,** never from counting ticks. A backgrounded tab throttles
  `setInterval` to once a minute, and a tick-counting timer would then give a
  user nine minutes to answer.
- **The question clock starts when the question finishes entering,** not when it
  begins animating, so reduced motion and full motion get the same time.
- **Paused time is excluded.** `visibilitychange` to hidden, the system back
  gesture (`useSystemBack`), Escape and the pause button all emit `PAUSE`.
  Coming back never resumes by itself: the pause menu is waiting.
- **Feedback holds the clock.** The explanation in Fact or Fiction can be read
  at leisure.
- The component tests drive the reducer with an injected `now`. They do not use
  `vi.useFakeTimers()`, because `user-event` hangs under it
  ([CONTINUING.md](../CONTINUING.md), Gotchas).

### 6.4 Scoring

```
points(correct, tier, remaining, limit) =
  correct ? roundTo10( base[tier] × (0.4 + 0.6 × remaining / limit) ) : 0
```

- Instant answer: 100 % of base. Answer in the last instant: 40 %. Wrong or
  timed out: 0. **No negative marking**, for the reason QUIZ-AND-EXAMS.md gives.
- **Match Up:** base per pair, plus `5 × seconds left` per board; a wrong pair
  costs two seconds, not points.
- **Spell It:** a hint halves that question's points.
- **Untimed play** (Settings → Games → Timer: Off) scores 60 % of base per
  right answer, flat, and keeps its own best.
- **The rules card states the formula in words,** which fixes the reference's
  unexplained 440: "Up to 150 points a question. The faster you answer, the more
  you keep."
- **The results screen leads with words right** ("8 of 10"), with points under
  it. Points are the game; words right are the point.

### 6.5 Bests

- **Keyed by** `game · track · tier · timing` — for example
  `closest:gre:standard:timed`.
- **"New best"** is shown only when a previous best existed *and* was beaten.
  The first round on a key says "Your first round on Standard. This is the score
  to beat." That fixes the reference's praise for 2 of 10.
- Celebration reuses the existing confetti variants: streamers for a new best,
  emoji rain for a perfect round, nothing otherwise. Respects `reduceMotion`.

## 7. Games and the scheduler

**Games never change SM-2 state on their own.** Specifically:

- No game calls `applyStudyRating` or `recordQuizAnswer` automatically. Speed
  under a 7-second Fiendish timer is not recall, and quiz accuracy on the
  Progress page should keep meaning what it says.
- **Games never create a `WordProgress` record.** Tier pools draw from months
  the user may not have loaded, and a record for one of those words would be an
  orphan, which the launch audit and the migration tests treat as data loss.
- **Review is an explicit choice.** On the results screen, missed words *that
  the user has already studied* get one action: **"Review these 3 in
  Flashcards"**. It applies "again" to each, which brings them due today, and
  says so in a toast. Missed words from unloaded months get **"Find in library"**
  instead, which shows the month they are in.
- **A completed round counts as activity for the streak.** It adds
  `gamesPlayed` to that day's `DayActivity`, beside `quizzesTaken`. Playing is
  practice, and a user who only had time for one game should not lose a
  forty-day streak for it. *This is an open decision (D2); the alternative is
  that games never touch the streak.*

This is the boundary ADR 0016 records: games feed the learning loop only
through a door the user opens.

## 8. Data model

### 8.1 Settings (`useSettingsStore`)

```ts
interface Settings {
  // …existing
  /** Per-question timer for games. "relaxed" doubles every limit. */
  gameTimer: "standard" | "relaxed" | "off";   // default "standard"
  /** The tier each game last started on, so Play repeats it. */
  lastGameTier: Partial<Record<GameId, Tier>>;  // default {}
}
```

Sound is the existing `soundEnabled`. The pause menu's audio toggle writes to
it, so there is one switch with two places to reach it, not two switches.

### 8.2 Progress (`useProgressStore`)

```ts
interface GameRoundSummary {
  id: string;
  game: GameId;
  track: Track;
  tier: Tier;
  timing: "timed" | "relaxed" | "untimed";
  daily: string | null;        // "2026-10-13" for a Daily Round, else null
  finishedAt: string;          // ISO
  score: number;
  right: number;
  total: number;
  ms: number;
  /** Word ids only, never text — see the storage budget. */
  missed: string[];
}

interface GameBest { score: number; right: number; total: number; at: string; roundId: string }

interface ProgressState {
  // …existing
  gameRounds: GameRoundSummary[];          // newest first, capped at 200
  gameBests: Record<string, GameBest>;     // key from §6.5, never capped
  recordGameRound: (round: GameRoundSummary) => void;   // writes both, plus DayActivity
}
```

- **Bests are stored, not derived.** Derived from a capped history, a best set
  201 rounds ago would silently vanish.
- **`DayActivity.gamesPlayed?: number`**, optional like `studySessions`.
- **Persistence is the risk, not the shape.** The v1.1 progress store once
  discarded every record over a version mismatch, and 23 unit tests passed
  while it did. As built: **no version bump.** The new fields are new keys,
  which zustand's default merge fills from the initial state, and the version
  stays where the tracks migration stamps it, since a bump would make every
  blob it wrote look stale. A test hydrates a v1.1-shaped blob, and the
  browser driver reads a best off the screen after a reload (§11.3).
- **Backup and restore** carry the new fields for free, since the export
  serialises the store. A restore from an older backup gets empty defaults.

### 8.3 The game corpus

Tier pools need whole thirds of a track, and most users have loaded only a few
months. So games **read** months without **loading** them:

- `src/hooks/useGameCorpus.ts` fetches `vocab/<track>/<NN>.json` for a tier's
  months, the same files `VocabLibrary` already fetches, and parses them
  through `parseVocabMonth`. There is still one definition of a valid month.
- **Cached in memory for the session, never persisted.** A third of a track is
  about 900 words, and writing that into `localStorage` would spend the budget
  the user's actual notebook needs.
- Loaded months take precedence over fetched ones, so a user's edited copy of a
  month is what they play.
- Works offline on desktop and Android: `public/` is embedded in the bundle.
- `useVocabStore` is never written. Playing a game must not add a month to the
  user's schedule.

### 8.4 Selectors

The hub needs "best per game for this track" and "today's Daily Round result".
Both are built objects. Following principle 6:

- As built for Phase 19, the hub needs neither: each card selects
  `s.gameBests[bestKey(...)]`, which returns a stored object by key and is
  stable. When the Daily Round needs a built value (Phase 22), it gets a pure
  function plus a memoised hook. Never
  `useProgressStore((s) => s.someGetterThatBuilds())`.
- `scripts/drive/legacy-state-smoke.mjs` is extended to open the Games page with
  state that has no `gameRounds` key at all.

## 9. Navigation and surfaces

- **A new page, `games`.** Page union in `useAppStore.ts`, `renderPage` in
  `App.tsx`, the sidebar, and the rail, per CLAUDE.md's four steps.
- **Mobile tab bar:** *open decision D4.* The recommendation is Home, Practice,
  Cards, **Games**, More, with Quiz moving into More beside Exam. Six tabs
  would leave every label cramped at 360 px.
- **Dashboard:** one card, under word of the day: "Daily Round · not played
  yet" or "8 of 10 today", with one tap to play. It is not a stat tile, and no
  game number joins the stats row.
- **Progress page:** a "Games" section with bests per game for the active track
  and the last 14 Daily Rounds. **No cumulative game total anywhere.**
- **Shortcuts:** `g` then a free letter opens Games, chosen against
  `src/lib/shortcuts.ts` at build time. In play: `1`–`4` choose (Fact or
  Fiction: `1`/`2` or `←`/`→`), Enter/Space continues, and `Esc`/`P` pauses.
  Spell It's text field swallows letter keys, so its pause key is `Esc` only.
- **Play is immersive.** During a round the tab bar and the rail hide and the
  stage takes the screen, because an accidental tap on "Cards" mid-question
  should not be possible. The pause menu is the only exit, and system back
  opens it.

## 10. Track names: Advanced and Easy

Shipped in Phase 19 alongside the games, because the game tiers sit inside
whichever track is open and the hub names it.

- **Display labels only.** `TRACK_META.gre.label` becomes "Advanced" and
  `sat` becomes "Easy". Descriptions lose the exam names: "Demanding,
  lower-frequency words" and "Essential academic words".
- **Ids never change.** `Track` stays `"gre" | "sat"`, word ids stay `gre-…`,
  month keys stay `gre/01`, and the corpus directories stay `gre/` and `sat/`.
  Renaming any of them is a migration of every progress record for a cosmetic
  gain. [ADR 0017](./adr/0017-track-display-names.md) records this so the next
  person does not "finish" the rename.
- **Display order** in the switcher becomes Easy, Advanced. The default track
  for existing users is unchanged.
- **Copy sweep:** the placeholders in `PlanBuilder` and `VocabGenerator`, the
  README, docs that are user-facing, and tests that assert on label text.
  Comments and generator prompt text that describe *register* ("GRE
  high-frequency") stay: they steer a model, and the model knows what GRE means.

## 11. Testing

### 11.1 Unit (Vitest, `src/lib/games/*.test.ts`)

- **Every builder, a property test over the whole shipped corpus** (both
  tracks, every tier): no option equals the answer; options are unique by stem;
  no option fails the defensibility guard; the answer index points at the
  answer; a `null` is returned rather than fewer than the required options.
- Fact or Fiction: truth balance per round; never four in a row; every false
  statement's explanation names the word it borrowed from.
- Fill the Gap: every emitted sentence contains exactly one blank and no copy
  of the word.
- `round.ts`: ten distinct words, deterministic for a seed, shortfall reported.
- `session.ts`: a table of event sequences (pause during a question, background
  during feedback, timeout at exactly the limit, answer after timeout ignored,
  double answer ignored). Time is injected.
- `scoring.ts`: the formula table, rounding, untimed and relaxed, best
  comparison including the first-round case.
- `daily.ts`: the same date and track give the same round; the next date gives
  a different one.
- **Performance:** building a Fiendish round over the full Advanced track takes
  under 50 ms. Assert it as a smoke alarm, not a budget, with the tolerance
  the distractor timing test learned it needs.

### 11.2 Component (`*.test.tsx`, jsdom)

The shell: rules → question → feedback → results → review; pause from every
state; keyboard paths; the live region announcing question changes and the 25 %
time warning; options exposed as a radio group.

### 11.3 Browser drivers (`scripts/drive/games-smoke.mjs`)

What unit tests cannot see:

1. Play a full Closest Meaning round at 360, 768 and 1280.
2. Background the tab mid-question (emulate `visibilitychange`), wait 5 s,
   return: paused, with the same time left.
3. Finish, reload, and **read the best off the hub**, not out of `localStorage`.
4. Before and after: **the Dashboard's mastered count and due count are
   unchanged.** A round must not have touched progress.
5. "Review these in Flashcards" moves exactly the missed studied words into the
   due deck.
6. The track switcher reads "Easy" and "Advanced"; switching tracks changes the
   hub's bests.
7. No horizontal scroll and 44 px targets on a coarse pointer, as in the tablet
   audit.

### 11.4 Corpus

`scripts/audit-games.ts`: eligibility counts per game × track × tier, and the
200-question human-read sample (§6.2). It joins `audit-corpus.ts` in the
pre-commit checklist for anything touching content.

## 12. Accessibility

- Options are a radio group with arrow-key movement, as QUIZ-AND-EXAMS.md
  already requires of quizzes.
- **The timer is never the only signal:** a visual bar, the digits, a colour
  change at ≤3 s, and a polite announcement at 25 % remaining. Sound is opt-in
  and never required.
- **Relaxed and Off timers** exist for anyone who reads more slowly, uses a
  switch device, or simply does not want pressure. They are not hidden behind
  an "accessibility" label; they sit in the pause menu and Settings.
- Correct and wrong are marked by **icon and text**, not colour alone: ✓ and ✗,
  plus "Correct" and "Not quite" in the live region.
- Reduced motion: no shake, no slide, no confetti, no score count-up. Fades
  only.
- All ten themes pass the existing contrast test. Game covers use theme tokens
  ([GAMES-UI.md](./GAMES-UI.md) §2), so they are covered by it automatically.

## 13. Deliberately not doing

- **No XP, no levels, no badges, no achievements, no lifetime points total.**
  ADR 0016's line.
- **No leaderboards and no online anything.** There is no server, and comparison
  with strangers is not what the app is for. The Daily Round share is a text
  paste the user chooses to make.
- **No lives, hearts, energy or "come back in 4 hours".** Play as much as you
  like.
- **No ads, ever.** The reference's worst screen had an ad between the options
  and the thumb.
- **No trivia.** Every question is about a word.
- **No automatic scheduler writes** (§7).
- **No adaptive difficulty within a round.**
- **No copying the reference's names, art or questions** (§2.4).
- **No "coming soon" tiles.**

## 14. Decisions

All recorded 2026-10-13. The owner took every recommendation.

| # | Decision | Taken |
| --- | --- | --- |
| **D1** | Accept ADR 0016: scored rounds and per-game bests, nothing cumulative | Accept |
| **D2** | Does a completed game round count toward the streak? | Yes, via `gamesPlayed` |
| **D3** | Picture It: commission a pack, source CC0, or drop | **Decided 2026-10-14:** drawn in-house ([ADR 0018](./adr/0018-picture-it-in-house-diagrams.md)) |
| **D4** | Mobile tab bar: Games in, Quiz to More? | Yes |
| **D5** | Daily Round share text | Ship in Phase 22 as P2, if D1 keeps the clause |
| **D6** | Track display names: "Advanced" / "Easy", or "Hard" / "Easy"? | "Advanced" / "Easy". "Hard" collides with the Hard tier |

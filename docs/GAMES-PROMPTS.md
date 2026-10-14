# Games — prompts

Two kinds of prompt live here:

- **Part A: session prompts.** Paste one into a fresh Claude Code session to
  run one phase of [ROADMAP.md](../ROADMAP.md) v1.2. Each is self-contained:
  it names what to read, what to build, what not to touch, and how to prove
  it is done.
- **Part B: in-app prompts.** The text Lexicon itself sends to a model for the
  P2 AI enhancements, kept beside the design so the prompt and the schema are
  reviewed together. They go into `src/lib/games/ai.ts` when built.

Every session prompt assumes the repo's own rules: [CLAUDE.md](../CLAUDE.md)
and [CONTINUING.md](../CONTINUING.md) first, a clean typecheck and build before
starting, work on `dev`, and no `Co-Authored-By` lines in commits.

---

## Part A — Session prompts

### A.0 Shared preamble

Put this at the top of every phase prompt.

```text
You are implementing part of Lexicon v1.2 (Games). Before writing code:
1. Read CLAUDE.md, CONTINUING.md, docs/GAMES.md, docs/GAMES-UI.md,
   docs/adr/0016-games-are-rounds-not-progression.md and
   docs/adr/0017-track-display-names.md.
2. Run `npm install`, `npm run typecheck` and `npm run build`. If either fails,
   stop and fix that first.
3. Confirm ADR 0016 and ADR 0017 say "accepted". If they do not, stop and say so.

Hard rules for every phase:
- Pure logic in src/lib/games/, with clock and randomness injected. Pages
  orchestrate; they own no domain logic.
- No new zustand store. Game history goes in useProgressStore; game
  preferences go in useSettingsStore. Never touch localStorage directly.
- A selector returns a primitive or a stable reference. Anything built (bests
  per track, today's daily result) is a pure function plus a memoised hook, as
  src/store/useAllMonths.ts does.
- Games never call applyStudyRating or recordQuizAnswer, and never create a
  WordProgress record, except through the explicit "Review these in
  Flashcards" action.
- Games never write useVocabStore. Tier pools are read through useGameCorpus.
- Never rename a track id, word id, month key or vocab directory (ADR 0017).
- Framer Motion with easing [0.16, 1, 0.3, 1]; reduceMotion respected
  everywhere. Fraunces (display-serif) for words; Inter for everything else;
  `tabular` on numbers; colours only from tokens in src/styles/globals.css.
- No XP, totals, levels, badges or leaderboards (ADR 0016).
- Tests: Vitest beside the code. Do not use vi.useFakeTimers() with
  user-event — inject `now` into the session reducer instead.
- A green unit suite is not enough for anything that persists. Drive it in a
  browser and read the number off the screen.

When done: `npm run typecheck && npm run build && npx vitest run`, plus every
driver named in the phase. Report failures verbatim. Update ROADMAP.md (strike
through done tasks, with the date and one line on anything surprising) and
CHANGELOG.md. Commit to dev with a message in the repo's existing style, with
no Co-Authored-By line.
```

### A.1 Phase 19 — Foundations, the rename, and Closest Meaning

```text
[A.0 preamble]

Build ROADMAP.md Phase 19. In this order, committing after each step:

1. Track display names (ADR 0017). Change TRACK_META labels to "Advanced"
   (gre) and "Easy" (sat), with descriptions "Demanding, lower-frequency
   words" and "Essential academic words". Add a TRACK_DISPLAY_ORDER constant
   (sat first) and use it in TrackSwitcher only; leave TRACKS alone. Sweep
   user-visible strings: grep src for \bGRE\b and \bSAT\b and change
   placeholders and UI copy, not comments or generator prompt text. Update
   tests that assert on rendered labels. Add a comment at the top of
   src/lib/track.ts pointing at ADR 0017. Run scripts/audit-corpus.ts and
   scripts/drive/tracks-smoke.mjs.

2. Engine: src/lib/games/{types,catalogue,pool,relations,round,session,
   scoring,bests}.ts, per GAMES.md §6. The defensibility guard (§6.2) gets a
   property test that runs every builder over every word of both shipped
   tracks (load public/vocab/*/*.json in the test) and asserts no option fails
   the guard. The session reducer gets a table test of event sequences (§11.1).

3. scripts/audit-games.ts: eligibility counts per game × track × tier, and a
   200-question sample for Closest Meaning written to audit-out/ as readable
   text. STOP after writing it and ask the owner to read the sample. Do not
   enable the game until they report a defect rate under 2%. If it is higher,
   tighten eligibility in relations.ts and regenerate; do not hand-edit the
   corpus without asking.

4. Persistence: gameRounds (cap 200), gameBests, recordGameRound, and
   DayActivity.gamesPlayed in useProgressStore; gameTimer and lastGameTier in
   useSettingsStore. Bump the progress store version with an explicit
   migration. Add a test that hydrates a real pre-change blob: export one from
   the running app before you change the store and commit it as a fixture.

5. src/hooks/useGameCorpus.ts: fetch the tier's months from
   vocab/<track>/<NN>.json, with thirds computed from vocab/index.json, parse
   through parseVocabMonth, prefer loaded months, cache in a module-level Map.
   Expose { status: "loading" | "ready" | "error", pool }.

6. The games page: register it in the four places CLAUDE.md lists. Build Hub,
   RulesSheet, Stage, Hud, TimeBar, OptionList, Feedback, PauseSheet, Results
   and Review as components under src/components/games/, per GAMES-UI.md §1.
   The stage is immersive: hide the sidebar, rail and tab bar during play.
   useSystemBack, Escape and visibilitychange all pause.

7. Closest Meaning builder and catalogue entry. Wire it through the shell.

8. scripts/drive/games-smoke.mjs covering GAMES.md §11.3 items 1–4 and 6.
   Extend scripts/drive/legacy-state-smoke.mjs to open Games with no
   gameRounds key in storage.

Ask before deciding D4 (tab bar) if the owner has not recorded it in
GAMES.md §14.
```

### A.2 Phase 20 — Fact or Fiction, Opposites, Fill the Gap

```text
[A.0 preamble]

Build ROADMAP.md Phase 20. The shell, engine and persistence exist; each game
is a builder in src/lib/games/builders/, a catalogue entry, and a stage variant
only if GAMES-UI.md §1.8 says it needs one.

- Fact or Fiction: the Means, Synonym, Opposite and Root templates (GAMES.md
  §4.2). Not Usage, which is P2. The feedback state holds the clock and waits
  for Continue. Balance: 50% ±1 true per round, never four of the same in a
  row, seeded.
- Opposites: antonym builder; from Standard up, one distractor is a synonym of
  the word, flagged so Review can label it as the trap.
- Fill the Gap: reuse blankOut from src/lib/confusables.ts. Skip words whose
  example cannot be blanked.
- "Review these in Flashcards" on Results (GAMES.md §7): applyStudyRating
  "again" for missed words with timesReviewed > 0, then a toast; "Find in
  library" for the rest. Add a test that greps src/lib/games and
  src/components/games for applyStudyRating and recordQuizAnswer, and allows
  only the one call site.

Extend the property test and audit-games.ts to the three new builders, and
produce a 100-question sample of each for the owner to read before enabling
them. Extend games-smoke.mjs with GAMES.md §11.3 item 5.
```

### A.3 Phase 21 — Odd One Out, Match Up, Spell It

```text
[A.0 preamble]

Build ROADMAP.md Phase 21. These need their own stages (GAMES-UI.md §1.8).

- Odd One Out: the three must be mutually related; the outsider must pass the
  guard against each of the three, in both directions.
- Match Up: a separate reducer for the board (selection, a locked pair, a wrong
  pair with a 2-second penalty), composed into the session. Keyboard: arrows
  within a column, Tab between columns, Enter/Space select. Definitions are
  never truncated; the board scrolls at 360px.
- Spell It: speech through src/lib/speech.ts with the user's voice and rate; an
  input with autocomplete/autocorrect/autocapitalize off and spellcheck
  false; a hint halves the points; exact match after trim and lower-case. When
  canSpeak() is false, the intro card says so and the game still works.

Run scripts/drive/tablet-audit.mjs with each stage open. If the Android
toolchain is available (CONTINUING.md runbook), install on the emulator and
confirm the Spell It keyboard does not autocorrect.
```

### A.4 Phase 22 — Daily Round and surfaces

```text
[A.0 preamble]

Build ROADMAP.md Phase 22.

- src/lib/games/daily.ts: seed from the local date plus the track, in the same
  way as src/lib/word-of-the-day.ts. Ten questions from Closest Meaning, Fact
  or Fiction, Opposites and Fill the Gap at Standard. The first completed
  attempt that day is the result (GameRoundSummary.daily = date); replays are
  practice.
- Hub hero card with the 14-day strip; Dashboard card under word of the day;
  a Games section on ProgressPage with bests per game for the active track and
  the last 14 Daily Rounds. Add a test that no component renders a sum of game
  scores.
- New synthesised sounds in src/lib/sound.ts: start, tick, timeout, best.
- Share text (P2) only if ADR 0016 kept its share clause: clipboard, plain
  text, no URL.
```

### A.5 Review prompt — run before merging any games phase

```text
Review the diff on dev against docs/GAMES.md, docs/GAMES-UI.md and ADR 0016.
Report only real defects, most severe first:
1. Any path where a game writes WordProgress, SM-2 state or useVocabStore other
   than the Review action.
2. Any cumulative game number, XP, level or badge.
3. Any selector that builds an object inside a zustand selector.
4. Any timer computed by counting ticks rather than from timestamps, or one that
   runs while paused, backgrounded or showing an explanation.
5. Any option that could be a defensible answer: find one by running the
   builders over the corpus, not by reading the code.
6. Any hardcoded colour, a missing reduceMotion branch, colour as the only
   signal, or a target under 44px on a coarse pointer.
7. Any rename of a track id, word id or month key.
```

---

## Part B — In-app model prompts (P2)

These go through the Phase 6 provider layer with `completeStructured()`. The
result is **always validated locally**, as with every other generated content,
and the heuristic games never depend on them. Results are cached in memory for
the session only.

### B.1 Synonym-key validation (optional audit tool, not shipped to users)

For the owner's audit pass over a sample, to triage the human read, not
replace it.

```text
You are checking answer keys for a vocabulary game.

For each item, the player sees WORD and must choose the option closest in
meaning. KEY is the intended answer. The other options are DISTRACTORS.

Return, per item:
- "keyValid": is KEY a reasonable synonym of WORD in its listed part of
  speech, as a strong student would accept?
- "defensible": the list of DISTRACTORS a strong student could reasonably
  defend as equally close in meaning (empty if none).
- "note": at most 12 words, only if something is wrong.

Judge by the most common sense of WORD for its part of speech. Do not reward
obscure senses.
```

Schema: `{ items: Array<{ id: string; keyValid: boolean; defensible: string[]; note?: string }> }`.

### B.2 Usage statements for Fact or Fiction

```text
Write test sentences for a vocabulary game. For each word, write:
- "correct": one natural sentence that uses the word correctly, in its listed
  part of speech and most common sense. 8–20 words. Different from the
  example given.
- "misused": one sentence of the same length that is grammatical but uses the
  word in a meaning it does not have. The misuse should be a mistake a real
  student makes (confusing it with a similar-sounding or related word), not
  nonsense.
- "why": one sentence, at most 20 words, explaining what is wrong with the
  misused sentence, naming the meaning the word actually has.

Rules: use the word in the same form in both sentences. No proper nouns, no
current events, nothing that dates. Plain English a 16-year-old reads easily.
```

Input per word: `{ id, word, partOfSpeech, definition, example }`.
Schema: `{ items: Array<{ id: string; correct: string; misused: string; why: string }> }`.

**Local validation before use:** both sentences contain the word (stem match,
the same check as `word-quality.ts`); neither equals the corpus example; the
lengths are in range; `why` names neither sentence verbatim. A failing item is
dropped, never repaired by hand.

### B.3 Distractor generation (enhancement to Closest Meaning)

Mirrors the AI-distractor P2 already on the Phase 10 list, so build both at
once if either is picked up.

```text
For each WORD, give three single-word distractors for a "closest meaning"
question whose answer is KEY. Each distractor must:
- share KEY's part of speech and roughly its frequency;
- be plausibly confusable for a student who half-knows WORD;
- be definitively NOT a synonym of WORD in any common sense.
Do not use WORD, KEY, any form of either, or any word in AVOID.
```

Input: `{ id, word, partOfSpeech, key, avoid: string[] }`, where `avoid` is
the word's synonyms and antonyms. The local defensibility guard runs on the
output exactly as it does on heuristic distractors.

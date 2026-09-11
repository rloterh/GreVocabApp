# Vocabulary generation

Generating a month, a quarter, six months or a year of vocabulary — without
ever repeating a word, and while honouring words the user insists on.

## What exists today

`src/lib/generate.ts` generates one month from a topic and a count, sends the
user's existing words as an avoid-list capped at 300, and lays the result out
three words per day. It works, and it is the seed of this design rather than
something to discard.

Three things it does not do, all of which v1.0 needs:

1. **Plan beyond one month.** A year is not twelve independent requests; the
   difficulty should build and the themes should not collide.
2. **Guarantee no repeats.** The avoid-list is a *request*, not an enforcement.
   A model will duplicate across batches, and the cap means it cannot even see
   the full history.
3. **Accept the user's own words.** "I want *perspicacious* in there" has no
   route in today's flow.

## The generation plan

A plan is a value object the user builds in the UI and the engine executes.
Making it data rather than a sequence of calls means it can be previewed,
edited, saved, re-run after a failure, and resumed if a month fails partway.

```ts
interface GenerationPlan {
  horizon: "month" | "quarter" | "half-year" | "year";
  startMonth: string;            // "2026-10"
  wordsPerDay: number;           // default 3
  /** Optional per-month themes; generated if absent. */
  themes?: string[];
  difficulty: "gentle" | "steady" | "aggressive";
  /** Words the user requires. Placed first, never dropped. */
  mustInclude: string[];
  /** Registers to prefer, e.g. "GRE high-frequency", "academic verbs". */
  register: string;
}
```

`difficulty` shapes a curve across the horizon rather than a constant: *gentle*
stays at everyday-academic throughout, *steady* climbs, *aggressive* starts hard
and stays there. For a year this is the difference between a usable plan and 365
days of undifferentiated obscurity.

Themes, when not supplied, are generated **once for the whole horizon** in a
single cheap request, so month 7 does not rediscover month 2's subject. The
user sees them and can edit before any word is generated. That preview is the
cheapest possible way to avoid burning a year's worth of tokens on the wrong
plan.

### Execution

Month by month, each month a separate structured request, checkpointed:

```
for each month in plan:
    request  words = ceil(needed * 1.25)      # deliberate overage
    filter   against the dedup index
    if short → one top-up request naming the shortfall
    if still short → keep what we have, record the gap, continue
    validate through parseVocabMonth
    commit   month to the store, add to the index
```

The 25% overage is the core trick: rather than trusting the model to respect a
long avoid-list, ask for more than needed and enforce uniqueness locally. Two
rounds maximum, then accept a short month and say so. A user who asked for a
year should not be blocked by one stubborn batch.

Every committed month updates the index immediately, so month 4's request
already knows about months 1–3 within the same run.

Progress is resumable. A year-long plan that fails at month 9 resumes at month
9, not month 1.

## The dedup index

This is the part that must be right, because a duplicate is the one failure a
vocabulary app cannot explain away.

### What counts as the same word

Exact string matching is not enough. `abate`, `Abate`, `abated` and `abatement`
are the same lexical item for a learner's purposes, and a generator will happily
produce two of them in different months.

Normalisation, in order:

1. Lowercase, trim, strip surrounding punctuation and quotes.
2. Strip diacritics (`naïve` → `naive`).
3. Reduce to a **stem** with a conservative suffix stripper — a Porter-lite
   rule set, hand-rolled rather than a dependency, covering `-s`, `-es`, `-ed`,
   `-ing`, `-ly`, `-ness`, `-ment`, `-tion`, `-able`, `-ity`.

Two entries collide if their stems match. Conservative on purpose: over-matching
would reject legitimately distinct words (`industry` / `industrious` are worth
teaching separately), so the stemmer stops well short of aggressive.

The rule set is data, and it is tested against a fixture of real word families.
When it gets something wrong the fix is a test plus a rule, not a rewrite.

### What the index remembers

```ts
interface VocabIndexEntry {
  stem: string;          // the collision key
  word: string;          // as originally written
  monthKey: string;      // where it came from
  source: "seed" | "import" | "generated" | "user";
  retiredAt?: string;    // set when its month is removed
}
```

**Removing a month does not free its words.** The entry is retired, not deleted.
Otherwise a user who removes April and regenerates would be handed April's words
again, having already studied them — and their progress records, which are keyed
by word id and survive independently, would silently reattach to "new" words.
This is the same orthogonality principle that governs progress (CONTINUING.md
principle 1), applied to identity.

A user can explicitly release retired words, in one place, with a clear warning.

### Scale

A year at three words per day is ~1,100 entries. The index is a `Map<string,
VocabIndexEntry>` built once from all loaded months plus the retired ledger,
held in the store, updated on every mutation. Lookups are O(1) and the whole
structure is well under 200 KB — no persistence concerns at the sizes this app
will ever see.

### The prompt side

The model still gets an avoid-list, because a model that avoids duplicates
produces better first-round results than one that does not. But the list is now:

- **the mustInclude words** (so it does not "helpfully" substitute them),
- **a sample of the index**, biased toward the same starting letters and register
  as the request, capped by the provider's context window rather than a fixed
  300.

The local filter is the enforcement. The prompt is an optimisation.

## User-supplied words

Two routes, both landing in the same place:

- **In the plan.** A textarea in the generation dialog: paste or type words, one
  per line or comma-separated. They are distributed across the horizon's early
  months and are never dropped by the dedup filter.
- **Into an existing month.** Add words to a month already loaded, generating
  only the definition, example and mnemonic for each.

Either way the word goes through the same pipeline: normalise, check the index,
warn if it is already present (with the month it is in), then generate its card
content and commit.

If the user supplies more words than the horizon holds, the plan says so before
generating rather than silently truncating.

## Quality controls

Generated content is the app's product, so the prompt does real work:

- Definitions: one sentence, plain English, no circularity (a definition may not
  contain the word or an obvious inflection of it — checked locally, regenerated
  once if violated).
- Examples: must contain the word, and must make the meaning inferable from
  context rather than restating the definition. The existing
  `heuristicVerify` overlap check in `verify.ts` already detects the restating
  case and is reused here.
- Mnemonics: a sound-alike, a root breakdown, or a vivid image. Never a
  paraphrase of the definition — the same overlap check applies.

These are cheap local validations run after generation, and each failure costs
one targeted regeneration rather than a whole batch.

## Deliberately not doing

- **No embeddings or semantic similarity.** Stem collision catches the real
  problem — the same word twice. Catching "two words that mean similar things"
  is a different and much less valuable feature, and it would mean shipping a
  model or calling one per word.
- **No cross-user or online word lists.** No backend, per ROADMAP.md.
- **No automatic regeneration of existing months.** Generated content is the
  user's data once committed. Replacing it silently would throw away their
  progress against it.

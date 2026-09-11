# Lexicon engineering docs

Design documentation for Lexicon v1.0 — the work that takes the app from a
single-provider desktop/web study tool to a multi-platform, multi-provider one.

Read in this order. Each document assumes the ones above it.

| Document | What it decides |
| --- | --- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | The shape of the system: layers, module boundaries, what may depend on what |
| [DATA-MODEL.md](./DATA-MODEL.md) | Persisted state, schema versioning, and the migration framework the growth demands |
| [AI-PROVIDERS.md](./AI-PROVIDERS.md) | How the app gets a model — detection, cascade, structured output, consent |
| [VOCAB-GENERATION.md](./VOCAB-GENERATION.md) | Generating a month/quarter/year, never repeating a word, honouring user-supplied lists |
| [QUIZ-AND-EXAMS.md](./QUIZ-AND-EXAMS.md) | Instant quizzes, periodic tests, and the 100-question sectioned exam |
| [MOBILE.md](./MOBILE.md) | Android and iOS: layout, platform work, store submission |
| [adr/](./adr/) | Decision records — the *why*, kept short, one per decision |

**Start with [ADR 0007](./adr/0007-authentication-strategy.md)** if you are
touching anything AI-related: it supersedes ADR 0002, which was wrong, and it
sets the boundary between what the app may and may not do with a user's
existing accounts and tools.

The phased plan that sequences all of this is [`../ROADMAP.md`](../ROADMAP.md).
Conventions and the day-to-day handoff are in
[`../CONTINUING.md`](../CONTINUING.md).

## How to read a design doc here

Each one states the **problem**, the **constraints that are real** (as opposed
to assumed), the **design**, and — importantly — **what it deliberately does
not do**. If a document does not say what it rejected, it is not finished.

Where a decision was genuinely contested, it lives in `adr/` and the design doc
links to it rather than re-arguing it.

## Status

These documents describe **intended** design. Nothing here is implemented until
ROADMAP.md says the phase is done, and a phase is not done until CI is green.
Where a design depends on an API whose shape could not be verified from this
environment — the browser built-in AI in particular — the doc says so and the
roadmap schedules a spike before the work that depends on it.

# Quizzes and exams

Three shapes of self-testing: an instant quiz, a periodic test, and a
100-question sectioned exam.

## What exists today

`src/pages/Quiz.tsx` has three modes (word→def, def→word, mixed) and three pools
(mastered, all, month). It works and its shape is kept. What it lacks: decent
distractors, any notion of a *period*, sectioning, resumability, and a review
pass afterwards.

## The three shapes

| | Instant quiz | Periodic test | Exam |
| --- | --- | --- | --- |
| Length | user picks, default 10 | 10 / 25 / 50 by period | 100, in sections |
| Setup | scope picker, then start | one tap | scope + section config |
| Timing | untimed | untimed | per-section timer, optional |
| Resumable | no | no | **yes** |
| Review | score + missed words | score + missed words | full per-question review |
| Pool | chosen scope | words of that period + due | across the whole corpus |

### Instant quiz

A scope picker first, then straight in — the picker is small and remembers the
last choice, so the second use is effectively one tap.

```
Scope:     [Due now] [This month] [All] [Still learning] [Mastered]
Questions: [10] [20] [30]
Mode:      [Word → definition] [Definition → word] [Mixed]
                                                    [ Start ]
```

Reachable from the Dashboard, from the shortcut overlay, and by a global
shortcut (`g` `i`). Defaults to **Due now** when the scheduler has anything due,
because that is the highest-value thing the user could be doing.

### Periodic tests

Daily 10, Weekly 25, Monthly 50 — each built from a defined pool rather than a
random draw:

- **Daily** — everything due today, topped up with the current day's words.
- **Weekly** — the last 7 days of introduced words, plus anything due, plus a
  sample of older material weighted toward low ease factors.
- **Monthly** — the whole month's words, weighted the same way.

The weighting matters: a test that samples uniformly will mostly ask about words
the user already knows. Biasing toward low ease factor and recent lapses makes a
25-question test worth more than a 50-question uniform one.

Each period tracks a personal best and a history, so the Progress page can show
a trend line — which is the point of testing on a schedule at all.

### The 100-question exam

Five sections of twenty by default, configurable. This is the GRE-shaped
artefact: long enough to be a real assessment, sectioned so it is survivable.

- Sections are **thematically coherent** where possible — grouped by month or by
  register — so a section reads as a unit.
- Each section has an optional timer. Default: off. GRE-style pacing is a
  preference, not an imposition.
- **Resumable.** An `ExamSession` is persisted on every answer. Closing the app
  mid-exam and returning must not lose it — a 100-question exam that evaporates
  is worse than no exam.
- Between sections: a break screen with progress, no score. Scores during an
  exam change how people answer.
- At the end: overall score, per-section breakdown, per-question review showing
  the word, the user's answer, the right answer, and the card in full.
- Every wrong answer feeds the scheduler — a missed word gets its interval cut,
  the same as an "Again" on a flashcard. **An exam is a study session, not just
  a measurement.**

## Distractor selection

This is what separates a quiz worth taking from one that is trivially passable,
and it is the most interesting engineering in this document.

Random wrong answers are too easy: if the answer is "to lessen in intensity" and
the distractors are about rivers, birds and furniture, the question tests
nothing. Good distractors are **plausible but wrong**.

Without embeddings, a scoring heuristic gets most of the way:

```
score(candidate, answer) =
    + 3  same part of speech
    + 2  definition length within 40% of the answer's
    + 2  from the same month (same register and difficulty band)
    + 1  shares a first letter with the answer      // surface confusability
    − 5  listed as a synonym of the answer          // it would be defensible
    − 3  the user has never seen it                 // tests recall of nothing
```

Take the top three by score, with a random tie-break so the same question does
not produce the same three distractors every time.

The synonym penalty is not optional. A distractor that is arguably correct makes
the quiz feel broken and is the fastest way to lose a user's trust in it.

Where an AI provider is available and the user opts in, distractors can be
**generated** — "give me three plausible but definitively wrong definitions for
this word" — which produces better questions than any heuristic. That is an
enhancement, not a dependency: the heuristic is always there, and the app never
requires a model to quiz you.

## Data model

```ts
interface ExamSession {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  config: { sections: number; perSection: number; timerSeconds: number | null };
  sections: ExamSection[];
  currentSection: number;
  currentQuestion: number;
}

interface ExamSection {
  title: string;
  questions: QuizQuestion[];
  answers: Array<{ chosen: string; correct: boolean; msToAnswer: number } | null>;
  startedAt: string | null;
  finishedAt: string | null;
}
```

`QuizQuestion` already exists and is unchanged. `answers` is sparse and
null-padded so a partially answered section is representable — that is what
makes resume work.

Exams are capped in history like quizzes and studies (the store already keeps
the last 100 of each) and are excluded from the backup size concern by storing
question ids rather than full question text.

## Accessibility

Options are radio-group semantics, not clickable divs. Number keys 1–4 select,
Enter confirms, and the current option is announced. The existing flashcard
shortcuts already establish this pattern; quizzes should match it rather than
invent a second one.

Timers, when enabled, must not be the only signal — a visual bar plus an
announcement at 25% remaining, never a sound alone.

## Deliberately not doing

- **No adaptive difficulty within a session.** It makes scores incomparable
  between attempts, which defeats the point of testing on a schedule.
- **No negative marking.** It teaches hesitation, not vocabulary.
- **No leaderboards or shared scores.** ROADMAP.md rules out accounts, and
  comparison against strangers is not what this app is for.

# ADR 0008 — The prompt bridge: use any AI, with no credentials at all

**Status:** accepted · 2026-09-11

## Context

Some users have no API key, no local model, and no intention of getting either.
Many of those same users *do* have a Claude, ChatGPT or Gemini tab open all day.

Asking them to obtain an API key — a separate, metered, billed product — in
order to use a vocabulary app is a real barrier, and for a once-a-month action
it is a disproportionate one.

## Decision

Lexicon can generate vocabulary **without talking to any AI itself**, by handing
the user a prompt and accepting the result back.

```
1. The user builds a generation plan in the app, as normal.
2. Instead of "Generate", they choose "Generate elsewhere".
3. The app copies a complete, self-contained prompt to the clipboard —
   including the output schema and the words to avoid.
4. The user pastes it into whatever AI they already use, and copies the reply.
5. They paste the reply back into the app, or save it and drop the file in.
6. The app validates it exactly as it validates an imported file, runs it
   through the dedup index, and commits it.
```

No key, no OAuth, no local model, no network call from Lexicon at all.

## Why this is the right shape

- **It works with every AI, including ones that do not exist yet.** The app has
  no integration to maintain.
- **It is unambiguously legitimate.** The user operates their own chat client
  themselves. Nothing impersonates them; no terms are strained.
- **It is zero-infrastructure.** No backend, consistent with ROADMAP.md.
- **The validation is already built.** Step 6 is `parseVocabMonth` plus the
  dedup index — the same path CSV, JSON and Anki imports take. A pasted blob
  from a stranger's model gets exactly as much trust as a file from disk, which
  is to say: checked.

## The prompt is the product

This only works if the generated prompt is genuinely good, because the model
receiving it gets no second chance and no tool schema to constrain it. The
prompt must carry:

- The task, the count, the theme and the difficulty band.
- **The exact output format**, with a worked example — CSV is the better default
  here, not JSON: chat models emit it more reliably, it survives copy-paste
  without brace-matching problems, and Lexicon already parses it.
- The words to avoid, sampled to fit a chat context.
- The quality rules that the API path enforces in code: one-sentence
  definitions, examples that make the meaning inferable rather than restating
  it, mnemonics that are real memory hooks.
- A closing instruction to emit **only** the CSV, with no commentary.

This is the same content the API path sends. It is written once, in
`src/lib/vocab/prompt.ts`, and both paths use it — so the prompt cannot drift
between them.

## Round-trip robustness

Chat models wrap output in prose and code fences no matter how firmly they are
told not to. The paste-back handler therefore:

- strips markdown fences and any leading or trailing commentary,
- finds the first line that looks like the expected header,
- parses with the existing RFC 4180 CSV reader,
- and on failure says **which line** was wrong and offers to re-copy the prompt.

The error message matters more here than anywhere else in the app, because the
user cannot see what went wrong on the other side of the clipboard.

## Consequences

- This becomes the **recommended path for users without a key**, and the app
  should say so rather than treating it as a fallback for the desperate.
- It also serves anyone whose employer forbids pasting API keys into desktop
  apps, and anyone who simply wants to see the prompt before it runs.
- It costs one dialog and a prompt builder that the API path needed anyway.

## Rejected

- **Deep links into chat UIs** (`chatgpt.com/?q=...`). Length-limited,
  provider-specific, and breaks whenever a URL scheme changes.
- **A browser extension** to automate the paste. Enormously more work, needs
  store review on two browsers, and re-creates the terms problem ADR 0007
  avoids.
- **JSON as the default paste format.** Chat models truncate and malform long
  JSON far more often than CSV, and a missing brace kills the whole batch where
  a bad CSV line kills one word.

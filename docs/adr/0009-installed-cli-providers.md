# ADR 0009 — Use AI tools already installed and authenticated on the machine

**Status:** accepted · 2026-09-11

## Context

The brief asked for connecting to "any AI that is connected in the browser **or
installed on the app/desktop**". The installed-on-the-desktop half is more
tractable than the browser half, and was under-served by the original design.

Many users already have an authenticated AI CLI on their machine — Claude Code,
Codex, Gemini CLI, or Ollama. Those tools hold their own credentials and are
invoked from a terminal. On desktop, Lexicon has a Rust process that can invoke
a program.

## Decision

On desktop only, Lexicon detects AI CLIs on `PATH`, and — with the user's
explicit, per-tool consent — uses one as a provider by invoking it as a
subprocess.

Detection is presence on `PATH` plus a cheap version probe. Nothing is invoked
for real until the user enables that tool in settings.

## Rules

1. **Never read another tool's credential store.** We invoke the program and let
   it authenticate itself. Lexicon never sees, stores or transmits a token.
   Reading `~/.config/<tool>/credentials` would be credential theft no matter
   how convenient.
2. **Opt-in per tool, never automatic.** The cascade may *detect* a CLI, but it
   does not use one until the user turns it on. Spending someone's subscription
   quota without asking is not acceptable even when it is technically possible.
3. **Name the tool in the UI whenever it is used**, so the user always knows
   what is running and where the cost lands.
4. **Prefer a structured-output flag** where the CLI offers one; fall back to
   the prompt-and-repair path otherwise.
5. **Argument safety.** Prompts go via stdin or a temporary file, never
   interpolated into a shell string. The Rust side uses argument vectors with no
   shell, and the tool list is a fixed allowlist — never a user-supplied command.
   A vocabulary app must not become a way to run arbitrary programs.
6. **Respect the tool's terms.** Some subscription CLIs are licensed for
   interactive use. The consent dialog says plainly that Lexicon will invoke
   that tool and that the user is responsible for its terms. If a tool's terms
   clearly forbid programmatic invocation, it is not added to the allowlist.

## Why this is different from the thing ADR 0007 rules out

The line is ownership and consent. Here the user installed the tool, the user
authenticated it, the user enabled it, and it runs on the user's machine under
the user's account. Lexicon adds no credential and impersonates nobody.

What ADR 0007 refuses is acting *as* the user against a service that has not
agreed to it — driving a web session, or lifting a token from another app's
storage. Invoking a program the user already runs is not that.

## Consequences

- A user with Claude Code installed gets AI in Lexicon with one toggle and no
  key. That is a direct answer to the "API keys are difficult" problem.
- Desktop only. The browser cannot spawn processes, and mobile has no PATH in
  this sense.
- CLI output formats change without warning. Each adapter pins a probe and
  degrades to the prompt bridge rather than breaking the feature.
- The subprocess surface is security-sensitive and gets a focused test: a fixed
  allowlist, argument vectors, no shell, prompts via stdin.

## Rejected

- **Automatic use on detection.** Quota is the user's to spend.
- **A user-supplied arbitrary command.** The obvious next request, and a remote
  code execution hole wearing a settings field. If it is ever added it needs its
  own ADR and a much louder consent step.

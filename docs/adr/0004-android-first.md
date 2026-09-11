# ADR 0004 — Android ships first; iOS is designed for, not attempted

**Status:** accepted · 2026-09-11

## Context

Mobile was requested for both Apple and Android. Building an iOS app requires
Xcode, which runs only on macOS, and distributing one requires a paid Apple
Developer account. Neither is available to this project.

## Decision

Android is a real target in this plan: toolchain, build, store submission.

iOS is designed for — responsive layout, safe areas, platform capability
detection, documented submission steps — but no iOS build is attempted and no
claim is made that it works.

## Consequences

- The responsive and platform-abstraction work serves both, so the iOS phase,
  when it becomes possible, is short rather than a rewrite.
- Nothing in the codebase assumes Android specifically; `#[cfg(desktop)]` and
  runtime capability checks already carry most of the weight.
- The roadmap and README must say iOS is unbuilt rather than implying a working
  app exists. Claiming otherwise would be the kind of overstatement this project
  has been careful to avoid.

## Revisit when

A Mac and a paid Apple Developer account both exist. The phase is then: install
toolchain, `tauri ios init`, fix whatever the simulator reveals, screenshots,
submit.

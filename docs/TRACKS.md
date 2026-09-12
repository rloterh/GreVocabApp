# Tracks — GRE and SAT

Two vocabularies in one app, switched like opening a different notebook.

Decisions this rests on: [ADR 0011](./adr/0011-tracks.md) (a track is part of
content identity), [ADR 0013](./adr/0013-cross-track-overlap.md) (words may
repeat across tracks, never within one).

## The problem

The app is a GRE tool with GRE baked into it — not as a label, but structurally.
Months are keyed by calendar month, word ids embed the month they were authored
into, and every selector assumes there is exactly one corpus. Adding a second
vocabulary is therefore not a filter; it is a change to what a word *is*.

## The model

```ts
export type Track = "gre" | "sat";

interface TrackMeta {
  id: Track;
  label: string;        // "GRE"
  description: string;  // "Graduate Record Examination"
}
```

A closed union, not an open registry. Two exams are a product decision; an
arbitrary number of user-defined tracks is a different feature with different
storage, and pretending the union is extensible now would cost work without
buying anything. Widening it later is a one-line change plus a migration —
exactly what it would be if we built the registry today and never used it.

### What is per-track

| Thing | Per-track? | Why |
| --- | --- | --- |
| Months / corpus | **Yes** | Different vocabularies |
| Word ids | **Yes** | `gre-abate` and `sat-abate` are different rows (ADR 0011) |
| Progress records | **Yes**, by consequence | Keyed by word id |
| Schedule (start date, month order) | **Yes** | A user may start SAT a year after GRE |
| Dedup index | **Yes** | Uniqueness is within a track (ADR 0013) |
| Generation plans | **Yes** | A plan produces months of one track |
| Streak, activity, daily goal | **No** | A day studied is a day studied |
| Theme, word order, reduce motion, all preferences | **No** | They are about the person, not the exam |
| Exam and quiz history | **Yes**, tagged | A GRE mock score is not an SAT score |

The streak line deserves the argument: splitting it would mean a user who
alternates tracks has two broken streaks instead of one intact one, and would
punish exactly the behaviour the app should encourage. The streak measures
showing up.

## Switching

```
┌──────────────────────────┐
│  Lexicon          [GRE ▾]│   ← always visible, in the header
└──────────────────────────┘
```

- A segmented control or small menu in the header, on every screen, at every
  breakpoint. A user who cannot tell which notebook is open will eventually
  study the wrong one — and worse, will not know they did.
- **No confirmation dialog.** Nothing is lost by switching. A dialog would
  imply otherwise and would be dismissed unread by the third day.
- Switching is instant: it changes `activeTrack`, and every selector reads it.
  No reload, no refetch of anything already loaded.
- The switch is remembered. Reopening the app finds the track you left.
- A track with no content shows its empty state — "No SAT months yet" with the
  two ways to get some — rather than an error or a blank screen.

## Selectors

Every read path filters by the active track. The list is the audit:

- due deck · dashboard counts · today's practice
- search · archive · word detail
- quiz pools · exam pools · distractor candidates
- dedup index · generation plan · "first free month"
- backup contents (all tracks) · restore (all tracks)

Two of those are deliberately *not* filtered: **backup and restore carry
everything**. A backup that silently contained only the track that happened to
be active is the kind of data loss a user discovers a year later.

Distractors are per-track for a reason that is not obvious: an SAT question
whose wrong answers are drawn from GRE-only vocabulary is harder than the
question it claims to be, and the difficulty is invisible to the person
grading themselves.

## Content

```
public/vocab/gre/01.json … 36.json     shipped
public/vocab/sat/01.json … 36.json     shipped
```

Both tracks ship complete. "Generated words are the app's defaults" — the user
gets three years of both on first launch, and generation is for going beyond
them or replacing them, never a prerequisite for using the app.

### User-generated content

Unchanged in shape, gaining a track:

- A generation plan names its track. The AI prompt names the exam, and the
  difficulty banding differs — SAT targets the academic register a strong
  high-school reader is reaching for; GRE targets the register above it.
- Imports land in the active track unless the file names one.
- The dedup index consulted is the active track's, so generating SAT words does
  not exclude every word already in the GRE corpus (ADR 0013).

## Migration

Existing installs have one unnamed track. They become GRE, keeping everything.
The mechanics are in [ADR 0011](./adr/0011-tracks.md) and the schedule half is
in [SCHEDULE.md](./SCHEDULE.md); the acceptance test is stated in both and is
the same test: **a backup taken before the migration, restored after it, shows
the same words on the same days with the same progress.**

## What this deliberately does not do

- **No cross-track transfer.** Knowing `abate` for the SAT does not pre-mark it
  for the GRE. It is the same spelling and a different encounter, six years
  apart, which is what the schedule would have asked for anyway.
- **No "both tracks at once" view.** A combined due deck sounds convenient and
  produces a session with no coherent difficulty level.
- **No third track, no custom tracks.** See the union above.
- **No per-track themes or settings.** Preferences belong to the person.

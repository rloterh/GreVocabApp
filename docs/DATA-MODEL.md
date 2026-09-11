# Data model and migrations

What Lexicon persists, and how it survives the schema changing underneath it.

## Today

Three `localStorage` keys, each a Zustand store with `persist`:

| Key | Holds |
| --- | --- |
| `lexicon.vocab.v1` | loaded months, active month, selected day |
| `lexicon.progress.v1` | per-word progress, daily activity, sentences, quiz and study history |
| `lexicon.settings.v1` | every preference |

The `v1` suffix is the only versioning that exists, and nothing reads it. That
was fine when `Settings` had six fields. It now has thirteen, and v1.0 adds
provider configuration, generation plans, exam sessions and the dedup index.

## The problem this creates

Zustand's `persist` merges a stored object over the store's defaults. That
handles **added** fields gracefully — a missing key takes its default, which is
exactly why every SM-2 field could be added as optional without breaking
anyone's saved progress.

It does not handle:

- **Renamed or moved fields.** A value silently disappears.
- **Changed shapes.** `theme: "dark"` becoming `theme: { name, accent }` yields
  a store in an impossible state and a crash somewhere far from the cause.
- **Split or merged stores.** The dedup index needs to live somewhere, and
  building it from months alone loses retired entries.
- **Data that must be derived once.** The index must be constructed from
  existing months on first run after the feature ships.

The app has been lucky so far because every change has been additive. The
migration framework exists so that luck is not load-bearing.

## The framework

```ts
interface Migration {
  /** The version this migration produces. */
  to: number;
  /** Human-readable, shown in the log if anything goes wrong. */
  describe: string;
  migrate(state: unknown): unknown;
}
```

Each store declares a `version` and a list of migrations. Zustand's `persist`
middleware already takes a `version` and a `migrate(persistedState, from)`
callback; this is a thin, typed, tested wrapper around that rather than a
parallel mechanism.

Rules:

- **Migrations are pure and total.** Input is unknown; output is a valid state
  for the target version, or it throws with a message naming the migration.
- **They run in order** and each one only knows about the step it performs.
  Migration 3 never reads what migration 1 did; it reads the shape migration 2
  produced.
- **They are never edited once shipped.** A wrong migration is fixed by a new
  migration, because the old one has already run on real data.
- **Every migration has a test** with a realistic fixture of the *previous*
  version, captured from an actual export rather than hand-written.

### Failure is not silent

If a migration throws, the store does not fall back to defaults — that would
erase the user's work without saying so. Instead:

1. The raw persisted value is copied aside to `lexicon.<store>.backup.<ts>`.
2. The store starts empty.
3. The app shows a recoverable-error screen offering to download the backup and
   explaining what happened.

Losing a year of vocabulary to a bad migration is the worst thing this app could
do to someone. The backup exists so that is recoverable rather than terminal.

## New persisted state in v1.0

```ts
// lexicon.ai.v1 — provider configuration. Keys are NOT here on desktop/mobile.
interface AiState {
  pinnedProvider: ProviderId | null;
  /** Cached detection, so startup does not re-probe every time. */
  lastDetection: { at: string; available: ProviderId[] } | null;
  /** Per-provider settings: base URL, model id, consent given. */
  providers: Record<ProviderId, ProviderSettings>;
}

// lexicon.vocab.v1 — extended
interface VocabState {
  // ...existing
  /** Retired words: their month is gone but they must never be regenerated. */
  retired: VocabIndexEntry[];
}

// lexicon.exams.v1 — separate store, because an in-flight exam is large
interface ExamState {
  active: ExamSession | null;
  history: ExamSummary[];     // capped at 100, question ids not text
}
```

The dedup index itself is **derived, not persisted** — rebuilt from months plus
`retired` at startup. Deriving it means it cannot drift out of sync with the
months, which is a whole class of bug avoided for the cost of a loop over ~1,100
entries at boot.

### Where API keys live

Not in `localStorage`, on any platform where something better exists:

| Platform | Store |
| --- | --- |
| Desktop, mobile | OS keychain via Tauri (`keyring` / stronghold) |
| Web | `localStorage`, with the UI saying so plainly |

This is a real improvement over today, where the Anthropic key sits in plain
`localStorage` on every platform. It is also a migration: an existing key must
move to the keychain on first run and be cleared from `localStorage`.

## Backup and restore

Settings already exports and restores a JSON blob of all three stores. That
must keep working across this, which means:

- The export gains a top-level `schemaVersions` map.
- Restore runs the same migrations, so a backup taken at v1 restores into v4.
- **A backup from a newer version than the app is refused**, with a clear
  message, rather than half-imported.
- API keys are **excluded** from the export. A backup file that leaks a key
  into a cloud drive is a security incident, and the current export includes
  the whole settings object.

That last point is a **defect in the current implementation**, not just a
future concern — `exportData()` in `Settings.tsx` serialises
`lexicon.settings.v1` wholesale, key included. It should be fixed in the first
phase that touches this area regardless of everything else here.

## Deliberately not doing

- **No IndexedDB.** `localStorage` is sufficient at these sizes (~200 KB for a
  heavy user) and is synchronous, which keeps the stores simple. Revisit only if
  audio or images are ever stored.
- **No cross-device sync.** Ruled out in ROADMAP.md.
- **No automatic cloud backup.** Export is a button the user presses.

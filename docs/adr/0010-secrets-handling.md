# ADR 0010 — How secrets are stored, and how they leave (they don't)

**Status:** accepted · 2026-09-11

## Context

Adding OAuth tokens and more provider keys multiplies the amount of secret
material the app holds. Before that happens, the handling needs to be right —
and today it is not.

**A live defect:** `exportData()` in `src/pages/Settings.tsx` serialises the
whole of `lexicon.settings.v1` into the backup file, **including
`anthropicApiKey`**. Users are told to keep backups, and backups go to cloud
drives, email and USB sticks. The app is currently writing a live API key into
files it encourages people to copy around.

That is the single worst security issue in the codebase and it exists today,
independent of everything planned.

## Threat model

Modest, matching what this app actually is:

| Threat | In scope? |
| --- | --- |
| Secret leaks into a backup file the user shares | **Yes** — happening now |
| Secret readable by another app / other users on a shared machine | **Yes** |
| Secret leaks via logs, errors or crash output | **Yes** |
| Secret sent to the wrong provider | **Yes** |
| Malware already running as the user | **No** — it has already won |
| Physical access to an unlocked machine | **No** |
| A backend compromise | **N/A** — there is no backend |

## Decision

### 1. Secrets never enter an export

Backups carry preferences, vocabulary and progress. They do not carry keys,
tokens or anything derived from them.

Mechanically: settings are split into `Settings` and `Secrets`, and the export
serialises `Settings` only. This is a type-level guarantee rather than a
remembered exclusion — a new secret field added to the wrong interface fails to
compile rather than silently shipping in the next backup.

The restore path tolerates old backups that contain a key: it **drops** it and
tells the user their key was not restored and why.

### 2. Secrets live in the OS keychain where one exists

| Platform | Store |
| --- | --- |
| Desktop, Android, iOS | OS keychain via Tauri (`keyring` / stronghold) |
| Web | `localStorage`, with the UI saying so plainly |

The browser has nowhere better. Saying so is more honest than implying safety
that does not exist, and it is a real argument for the desktop build.

Existing keys migrate out of `localStorage` on first run and the old value is
cleared.

### 3. Secrets are never logged, and cannot be

- A `Secret` wrapper type whose `toString()` and `toJSON()` return `"[redacted]"`.
  A key cannot reach a log or an error report by accident, including through a
  stringified request object.
- The error taxonomy in `docs/AI-PROVIDERS.md` carries a provider id and a
  status, never a request body.
- Redaction is tested: a test asserts that stringifying a populated config
  produces no substring of the secret.

### 4. Secrets go only to their own provider

Each secret is bound to a provider id and a base URL. A key for provider A can
never be attached to a request to provider B — checked at the transport, not
assumed by the caller.

This matters most for the OpenAI-compatible adapter, where one implementation
serves nine endpoints and a mix-up would mean sending an OpenAI key to whatever
custom base URL a user pasted.

### 5. A custom base URL is treated as user-supplied

Users may point the OpenAI-compatible adapter at any endpoint. That is a
feature, and it means a typo can direct a key somewhere unintended. So:

- On first use of a custom base URL, a confirmation naming the exact host that
  will receive the key.
- Plain `http://` is refused except for loopback, where there is no network to
  intercept.

### 6. The Rust request command is not a proxy

Per ADR 0003, desktop routes provider HTTP through Rust. That command takes a
**provider id and a path**, not an arbitrary URL — the host comes from the
stored, confirmed provider configuration. The frontend cannot ask it to fetch
anything else, so a UI bug cannot turn it into a general-purpose request
forwarder.

## Consequences

- The export defect is fixed in Phase 6 and gets its own test, because a
  regression here is silent and serious.
- Tauri gains the keyring plugin; the web build keeps `localStorage` and says so.
- Splitting `Settings` from `Secrets` is a schema migration, which the framework
  in `docs/DATA-MODEL.md` now exists to handle.
- The local-only routes — on-device, local server, installed CLI, prompt bridge —
  involve no secret at all. For those users this ADR is a no-op, which is
  another argument for keeping them first in the cascade.

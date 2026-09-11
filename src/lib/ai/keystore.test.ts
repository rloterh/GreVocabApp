/**
 * @vitest-environment jsdom
 *
 * These cover the browser path and the migration. The keychain path is Rust
 * and is tested in src-tauri/src/keystore.rs — `isTauri()` is false here, so
 * every call below takes the `localStorage` branch.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteSecret,
  getSecret,
  keystoreKind,
  migrateLegacySecrets,
  setSecret,
} from "@/lib/ai/keystore";

const KEY = "sk-ant-do-not-leak-me-0123456789";
const SETTINGS = "lexicon.settings.v1";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("keystoreKind", () => {
  it("says browser when there is no Tauri runtime", () => {
    // The UI shows this to the user, so being wrong here means telling
    // someone their key is encrypted when it is sitting in localStorage.
    expect(keystoreKind()).toBe("browser");
  });
});

describe("round trip", () => {
  it("returns what was stored", async () => {
    await setSecret("anthropicApiKey", KEY);
    const secret = await getSecret("anthropicApiKey");
    expect(secret?.reveal()).toBe(KEY);
  });

  it("returns null for a key that was never set", async () => {
    expect(await getSecret("openaiApiKey")).toBeNull();
  });

  it("hands back a Secret, not a bare string", async () => {
    await setSecret("anthropicApiKey", KEY);
    const secret = await getSecret("anthropicApiKey");
    // The point of the wrapper: it cannot be logged by accident.
    expect(`${secret}`).not.toContain(KEY);
    expect(JSON.stringify({ secret })).not.toContain(KEY);
  });

  it("keeps credentials apart from each other", async () => {
    await setSecret("anthropicApiKey", KEY);
    await setSecret("openaiApiKey", "sk-openai-other");
    expect((await getSecret("anthropicApiKey"))?.reveal()).toBe(KEY);
    expect((await getSecret("openaiApiKey"))?.reveal()).toBe("sk-openai-other");
  });

  it("stores outside the settings blob", async () => {
    localStorage.setItem(SETTINGS, JSON.stringify({ state: { theme: "dark" } }));
    await setSecret("anthropicApiKey", KEY);
    // A credential inside the settings blob is what leaked into backups.
    expect(localStorage.getItem(SETTINGS)).not.toContain(KEY);
  });
});

describe("deleteSecret", () => {
  it("removes the value", async () => {
    await setSecret("anthropicApiKey", KEY);
    await deleteSecret("anthropicApiKey");
    expect(await getSecret("anthropicApiKey")).toBeNull();
  });

  it("leaves nothing behind in storage", async () => {
    await setSecret("anthropicApiKey", KEY);
    await deleteSecret("anthropicApiKey");
    expect(JSON.stringify(localStorage)).not.toContain(KEY);
  });

  it("is fine deleting something that was never there", async () => {
    await expect(deleteSecret("groqApiKey")).resolves.toBeUndefined();
  });

  it("treats an empty write as a delete", async () => {
    await setSecret("anthropicApiKey", KEY);
    await setSecret("anthropicApiKey", "");
    expect(await getSecret("anthropicApiKey")).toBeNull();
  });
});

describe("migrateLegacySecrets", () => {
  /** The persisted shape zustand writes. */
  function legacyBlob(extra: Record<string, unknown> = {}) {
    return JSON.stringify({
      state: { theme: "sepia", anthropicApiKey: KEY, ...extra },
      version: 0,
    });
  }

  it("moves the key into the keystore", async () => {
    localStorage.setItem(SETTINGS, legacyBlob());
    expect(await migrateLegacySecrets()).toBe(true);
    expect((await getSecret("anthropicApiKey"))?.reveal()).toBe(KEY);
  });

  it("is a move, not a copy", async () => {
    localStorage.setItem(SETTINGS, legacyBlob());
    await migrateLegacySecrets();
    // Leaving the original behind would defeat the whole exercise: that copy
    // is the one that reached exported backups.
    expect(localStorage.getItem(SETTINGS)).not.toContain(KEY);
    const after = JSON.parse(localStorage.getItem(SETTINGS)!);
    expect(after.state).not.toHaveProperty("anthropicApiKey");
  });

  it("keeps every other setting", async () => {
    localStorage.setItem(SETTINGS, legacyBlob({ hasOnboarded: true }));
    await migrateLegacySecrets();
    const after = JSON.parse(localStorage.getItem(SETTINGS)!);
    expect(after.state.theme).toBe("sepia");
    expect(after.state.hasOnboarded).toBe(true);
    expect(after.version).toBe(0);
  });

  it("is idempotent — a second run finds nothing to do", async () => {
    localStorage.setItem(SETTINGS, legacyBlob());
    await migrateLegacySecrets();
    expect(await migrateLegacySecrets()).toBe(false);
    // and does not clobber what the first run stored
    expect((await getSecret("anthropicApiKey"))?.reveal()).toBe(KEY);
  });

  it.each([
    ["no settings at all", null],
    ["a settings blob with no key", JSON.stringify({ state: { theme: "dark" } })],
    ["an empty key", JSON.stringify({ state: { anthropicApiKey: "  " } })],
    ["a null key", JSON.stringify({ state: { anthropicApiKey: null } })],
    ["a non-string key", JSON.stringify({ state: { anthropicApiKey: 42 } })],
    ["no state property", JSON.stringify({ version: 0 })],
  ])("reports nothing migrated for %s", async (_name, blob) => {
    if (blob) localStorage.setItem(SETTINGS, blob);
    expect(await migrateLegacySecrets()).toBe(false);
  });

  it("survives a corrupt settings blob rather than blocking startup", async () => {
    localStorage.setItem(SETTINGS, "{not json");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // This runs on mount: throwing here would mean a white screen.
    await expect(migrateLegacySecrets()).resolves.toBe(false);
  });

  it("does not delete the original if the store write fails", async () => {
    localStorage.setItem(SETTINGS, legacyBlob());
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(await migrateLegacySecrets()).toBe(false);
    vi.restoreAllMocks();
    // Losing the user's key to a failed migration would be worse than the
    // leak the migration exists to fix.
    expect(localStorage.getItem(SETTINGS)).toContain(KEY);
  });
});

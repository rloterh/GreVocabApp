import { describe, expect, it } from "vitest";
import {
  containsSecret,
  redactSecrets,
  REDACTED,
  SECRET_KEYS,
  Secret,
  secretForUrl,
  secretMatchesHost,
  stripSecrets,
  type BoundSecret,
} from "@/lib/secrets";
import { useSettingsStore } from "@/store/useSettingsStore";
import type { SettingsState } from "@/types";

const KEY = "sk-ant-do-not-leak-me-0123456789";

/** A fully populated store state, the way a real user's would look. */
function populated(): SettingsState {
  return {
    ...useSettingsStore.getState(),
    anthropicApiKey: KEY,
    theme: "sepia",
    watchedFolder: "C:/vocab",
    hasOnboarded: true,
  } as SettingsState;
}

describe("SECRET_KEYS", () => {
  it("is not empty", () => {
    // An empty list would make every other test in this file vacuous.
    expect(SECRET_KEYS.length).toBeGreaterThan(0);
  });

  it("names the Anthropic key", () => {
    expect(SECRET_KEYS).toContain("anthropicApiKey");
  });
});

describe("stripSecrets", () => {
  it("removes every secret key", () => {
    const stripped = stripSecrets(populated()) as Record<string, unknown>;
    for (const key of SECRET_KEYS) {
      expect(stripped).not.toHaveProperty(key);
    }
  });

  it("keeps every non-secret setting", () => {
    const stripped = stripSecrets(populated()) as Record<string, unknown>;
    expect(stripped.theme).toBe("sepia");
    expect(stripped.watchedFolder).toBe("C:/vocab");
    expect(stripped.hasOnboarded).toBe(true);
    expect(stripped.studyReminderTime).toBe("19:00");
  });

  it("leaves the input untouched", () => {
    const original = populated();
    stripSecrets(original);
    expect(original.anthropicApiKey).toBe(KEY);
  });

  it("survives an object with no secrets at all", () => {
    expect(stripSecrets({ a: 1 })).toEqual({ a: 1 });
  });
});

describe("the serialised form carries no credential", () => {
  it("contains no substring of the key", () => {
    // The assertion that actually matters: whatever the shape, the key's
    // characters must not appear anywhere in the output.
    const json = JSON.stringify(stripSecrets(populated()));
    expect(json).not.toContain(KEY);
    expect(json).not.toContain("sk-ant");
  });

  it("holds for a nested persisted blob, the shape a backup uses", () => {
    const persisted = { state: populated(), version: 0 };
    const safe = { ...persisted, state: stripSecrets(persisted.state) };
    expect(JSON.stringify(safe)).not.toContain(KEY);
    // and the rest of the backup is intact
    expect(JSON.stringify(safe)).toContain("sepia");
  });
});

describe("containsSecret", () => {
  it("detects a populated credential", () => {
    expect(containsSecret(populated())).toBe(true);
  });

  it("ignores a null or empty credential", () => {
    expect(containsSecret({ anthropicApiKey: null })).toBe(false);
    expect(containsSecret({ anthropicApiKey: "" })).toBe(false);
  });

  it("is false for anything that is not an object", () => {
    expect(containsSecret(null)).toBe(false);
    expect(containsSecret("sk-ant-xxx")).toBe(false);
    expect(containsSecret(undefined)).toBe(false);
  });

  it("is false once stripped", () => {
    expect(containsSecret(stripSecrets(populated()))).toBe(false);
  });
});

describe("redactSecrets", () => {
  it("keeps the shape but hides the value", () => {
    const redacted = redactSecrets(populated());
    expect(redacted.anthropicApiKey).toBe(REDACTED);
    expect(redacted.theme).toBe("sepia");
    expect(JSON.stringify(redacted)).not.toContain(KEY);
  });

  it("leaves an absent credential absent rather than redacting nothing", () => {
    const redacted = redactSecrets({ anthropicApiKey: null, theme: "dark" });
    expect(redacted.anthropicApiKey).toBeNull();
  });
});

describe("Secret — cannot be logged by accident", () => {
  const secret = new Secret(KEY);

  it("reveals only when asked", () => {
    expect(secret.reveal()).toBe(KEY);
  });

  it.each([
    ["template interpolation", () => `${secret}`],
    ["String()", () => String(secret)],
    ["concatenation", () => "key=" + secret],
    ["JSON.stringify", () => JSON.stringify({ secret })],
    ["JSON.stringify of an array", () => JSON.stringify([secret])],
    ["nested in a config object", () =>
      JSON.stringify({ provider: "openai", auth: { secret } })],
  ])("redacts under %s", (_name, render) => {
    const output = render();
    expect(output).not.toContain(KEY);
    expect(output).toContain(REDACTED);
  });

  it("knows when it is empty", () => {
    expect(new Secret("").isEmpty).toBe(true);
    expect(new Secret("   ").isEmpty).toBe(true);
    expect(secret.isEmpty).toBe(false);
  });
});

describe("a credential is bound to its host", () => {
  const bound: BoundSecret = {
    providerId: "openai",
    host: "api.openai.com",
    secret: new Secret(KEY),
  };

  it("is sent to the host it belongs to", () => {
    expect(secretForUrl(bound, "https://api.openai.com/v1/chat")).toBe(KEY);
  });

  it.each([
    ["a different provider", "https://api.groq.com/openai/v1/chat"],
    ["a custom endpoint the user typed", "https://evil.example.com/v1/chat"],
    ["a lookalike host", "https://api.openai.com.evil.test/v1"],
    ["a malformed url", "not a url"],
  ])("is withheld from %s", (_name, url) => {
    // The failure this prevents: one adapter serving nine endpoints, and a
    // key going somewhere it was never issued for.
    expect(secretForUrl(bound, url)).toBeUndefined();
  });

  it("ignores case in the host", () => {
    expect(secretForUrl(bound, "https://API.OpenAI.com/v1")).toBe(KEY);
  });

  it("withholds an empty credential entirely", () => {
    const empty: BoundSecret = { ...bound, secret: new Secret("") };
    expect(secretForUrl(empty, "https://api.openai.com/v1")).toBeUndefined();
  });

  it("matches hosts directly too", () => {
    expect(secretMatchesHost(bound, "https://api.openai.com/x")).toBe(true);
    expect(secretMatchesHost(bound, "https://other.test/x")).toBe(false);
  });
});

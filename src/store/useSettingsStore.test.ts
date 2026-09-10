import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "@/store/useSettingsStore";

const store = () => useSettingsStore.getState();

beforeEach(() => {
  useSettingsStore.getState().reset();
});

describe("defaults", () => {
  it("starts with every setting the app reads defined", () => {
    const s = store();
    // A missing default surfaces as an undefined control, not a crash, so the
    // whole set is worth pinning.
    expect(s.theme).toBe("dark");
    expect(s.dataDirectory).toBeNull();
    expect(s.anthropicApiKey).toBeNull();
    expect(s.preferApiVerification).toBe(true);
    expect(s.reduceMotion).toBe(false);
    expect(s.fontSize).toBe("md");
    expect(s.hasSeenSrsIntro).toBe(false);
    expect(s.studyReminderEnabled).toBe(false);
    expect(s.studyReminderTime).toBe("19:00");
    expect(s.lastReminderDate).toBeNull();
  });
});

describe("set", () => {
  it("merges a partial update, leaving the rest alone", () => {
    store().set({ theme: "light" });
    expect(store().theme).toBe("light");
    expect(store().fontSize).toBe("md");
  });

  it("stores and clears the API key", () => {
    store().set({ anthropicApiKey: "sk-test" });
    expect(store().anthropicApiKey).toBe("sk-test");
    store().set({ anthropicApiKey: null });
    expect(store().anthropicApiKey).toBeNull();
  });

  it("records the one-time SRS intro dismissal", () => {
    store().set({ hasSeenSrsIntro: true });
    expect(store().hasSeenSrsIntro).toBe(true);
  });

  it("holds the reminder slot so a reload cannot double-notify", () => {
    store().set({ studyReminderEnabled: true, lastReminderDate: "2026-09-10" });
    expect(store().lastReminderDate).toBe("2026-09-10");
  });
});

describe("reset", () => {
  it("puts every setting back, including ones added after launch", () => {
    store().set({
      theme: "light",
      anthropicApiKey: "sk-test",
      hasSeenSrsIntro: true,
      studyReminderEnabled: true,
      lastReminderDate: "2026-09-10",
    });
    store().reset();

    expect(store().theme).toBe("dark");
    expect(store().anthropicApiKey).toBeNull();
    expect(store().hasSeenSrsIntro).toBe(false);
    expect(store().studyReminderEnabled).toBe(false);
    expect(store().lastReminderDate).toBeNull();
  });
});

describe("persistence", () => {
  it("writes through to storage under a versioned key", () => {
    store().set({ theme: "light" });
    const raw = localStorage.getItem("lexicon.settings.v1");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.theme).toBe("light");
  });
});

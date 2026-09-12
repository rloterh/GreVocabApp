/**
 * @vitest-environment jsdom
 *
 * Capability questions, asserted per platform. The value of this file is the
 * table: it makes "what works where" reviewable in one place, instead of
 * spread across every component that happens to branch.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canScheduleNotifications,
  canUseFileSystem,
  canUseGlobalShortcut,
  canUseTray,
  canWatchFolder,
  hasSystemBack,
  isMobile,
  needsNotificationPermission,
  platform,
  type Platform,
} from "@/lib/platform";

/** Pretend to be a platform, the way the real detection sees it. */
function as(target: Platform) {
  if (target === "web") {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    return;
  }
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  const agents: Record<string, string> = {
    desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
    ios: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
  };
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(agents[target]);
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe("detecting the platform", () => {
  it.each<Platform>(["web", "desktop", "android", "ios"])(
    "recognises %s",
    (target) => {
      as(target);
      expect(platform()).toBe(target);
    },
  );

  it("treats a browser as web even on a phone", () => {
    // No Tauri runtime means the web build, whatever the device is.
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8)",
    );
    expect(platform()).toBe("web");
  });

  it("knows which platforms are phones", () => {
    as("android");
    expect(isMobile()).toBe(true);
    as("ios");
    expect(isMobile()).toBe(true);
    as("desktop");
    expect(isMobile()).toBe(false);
  });
});

/**
 * The capability table.
 *
 * `true` means the capability is available on that platform. Reading down a
 * column should make sense; reading across a row should explain a feature.
 */
const TABLE: Record<
  string,
  { fn: () => boolean; web: boolean; desktop: boolean; android: boolean; ios: boolean }
> = {
  // Scoped storage makes "watch a directory" the wrong model on mobile — the
  // import path there is a file picker and a share intent, not a degraded
  // version of this.
  canWatchFolder: { fn: canWatchFolder, web: false, desktop: true, android: false, ios: false },
  canUseTray: { fn: canUseTray, web: false, desktop: true, android: false, ios: false },
  canUseGlobalShortcut: {
    fn: canUseGlobalShortcut,
    web: false,
    desktop: true,
    android: false,
    ios: false,
  },
  // The capability that makes daily reminders worth having: firing while the
  // app is closed. A browser cannot.
  canScheduleNotifications: {
    fn: canScheduleNotifications,
    web: false,
    desktop: true,
    android: true,
    ios: true,
  },
  needsNotificationPermission: {
    fn: needsNotificationPermission,
    web: true,
    desktop: false,
    android: true,
    ios: false,
  },
  hasSystemBack: { fn: hasSystemBack, web: false, desktop: false, android: true, ios: false },
  canUseFileSystem: {
    fn: canUseFileSystem,
    web: false,
    desktop: true,
    android: true,
    ios: true,
  },
};

describe("capabilities per platform", () => {
  for (const [name, row] of Object.entries(TABLE)) {
    describe(name, () => {
      it.each<Platform>(["web", "desktop", "android", "ios"])(
        `on %s`,
        (target) => {
          as(target);
          expect(row.fn()).toBe(row[target]);
        },
      );
    });
  }

  it("asks capability questions, not platform questions", () => {
    // The point of the module. A component asking "can I watch a folder?"
    // needs no revisiting when a platform is added; one asking "is this
    // Android?" does.
    for (const name of Object.keys(TABLE)) {
      expect(name).toMatch(/^(can|has|needs)/);
    }
  });

  it("gives desktop everything but the mobile-only affordances", () => {
    as("desktop");
    expect(hasSystemBack()).toBe(false);
    expect(canWatchFolder()).toBe(true);
    expect(canUseTray()).toBe(true);
  });

  it("gives the web build nothing that needs a packaged runtime", () => {
    as("web");
    expect(canScheduleNotifications()).toBe(false);
    expect(canUseFileSystem()).toBe(false);
    expect(canWatchFolder()).toBe(false);
  });
});

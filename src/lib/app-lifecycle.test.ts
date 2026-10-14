// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { onAppHidden, onAppShown, PAUSE_EVENT, RESUME_EVENT } from "./app-lifecycle";

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => setVisibility("visible"));

describe("app lifecycle", () => {
  it("hears a browser hiding the page", () => {
    const hidden = vi.fn();
    const stop = onAppHidden(hidden);
    setVisibility("hidden");
    expect(hidden).toHaveBeenCalledTimes(1);
    stop();
  });

  it("hears the Android activity's own signals, which the WebView never sends as visibility", () => {
    const hidden = vi.fn();
    const shown = vi.fn();
    const stops = [onAppHidden(hidden), onAppShown(shown)];
    window.dispatchEvent(new Event(PAUSE_EVENT));
    window.dispatchEvent(new Event(RESUME_EVENT));
    expect(hidden).toHaveBeenCalledTimes(1);
    expect(shown).toHaveBeenCalledTimes(1);
    for (const stop of stops) stop();
  });

  it("does not call hidden for a page becoming visible, or shown for one hiding", () => {
    const hidden = vi.fn();
    const shown = vi.fn();
    const stops = [onAppHidden(hidden), onAppShown(shown)];
    setVisibility("hidden");
    setVisibility("visible");
    expect(hidden).toHaveBeenCalledTimes(1);
    expect(shown).toHaveBeenCalledTimes(1);
    for (const stop of stops) stop();
  });

  it("stops listening when asked", () => {
    const hidden = vi.fn();
    onAppHidden(hidden)();
    window.dispatchEvent(new Event(PAUSE_EVENT));
    setVisibility("hidden");
    expect(hidden).not.toHaveBeenCalled();
  });
});

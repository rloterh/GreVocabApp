import { afterEach, describe, expect, it, vi } from "vitest";
import { playSound, resetAudio, soundEnabled } from "@/lib/sound";
import { useSettingsStore } from "@/store/useSettingsStore";

/**
 * There is no Web Audio in the node environment, which is itself the most
 * important case: a runtime without it must stay silent rather than throw.
 */

afterEach(() => {
  resetAudio();
  vi.unstubAllGlobals();
  useSettingsStore.getState().reset();
});

describe("soundEnabled", () => {
  it("is off by default", () => {
    expect(soundEnabled()).toBe(false);
  });

  it("follows the setting", () => {
    useSettingsStore.getState().set({ soundEnabled: true });
    expect(soundEnabled()).toBe(true);
  });
});

describe("playSound", () => {
  it("does nothing at all when sound is off", () => {
    const AudioContextSpy = vi.fn();
    vi.stubGlobal("window", { AudioContext: AudioContextSpy });
    playSound("flip");
    expect(AudioContextSpy).not.toHaveBeenCalled();
  });

  it("stays silent rather than throwing where there is no Web Audio", () => {
    vi.stubGlobal("window", {});
    useSettingsStore.getState().set({ soundEnabled: true });
    expect(() => playSound("complete")).not.toThrow();
  });

  it("builds a tone when enabled", () => {
    const oscillator = {
      type: "",
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const gain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    const ctx = {
      state: "running",
      currentTime: 0,
      destination: {},
      createOscillator: vi.fn(() => oscillator),
      createGain: vi.fn(() => gain),
      close: vi.fn(() => Promise.resolve()),
    };
    // An arrow function cannot be `new`-ed; returning the stub from a
    // function expression is what makes `new Ctor()` yield it.
    vi.stubGlobal("window", {
      AudioContext: vi.fn(function () {
        return ctx;
      }),
    });
    useSettingsStore.getState().set({ soundEnabled: true });

    playSound("flip");

    expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
    expect(oscillator.start).toHaveBeenCalled();
    expect(oscillator.stop).toHaveBeenCalled();
    // The gain envelope is what keeps a raw tone from clicking.
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalled();
    expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalled();
  });

  it("plays every tone of a multi-note sound", () => {
    const make = () => ({
      type: "",
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    });
    const ctx = {
      state: "running",
      currentTime: 0,
      destination: {},
      createOscillator: vi.fn(make),
      createGain: vi.fn(() => ({
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      })),
      close: vi.fn(() => Promise.resolve()),
    };
    // An arrow function cannot be `new`-ed; returning the stub from a
    // function expression is what makes `new Ctor()` yield it.
    vi.stubGlobal("window", {
      AudioContext: vi.fn(function () {
        return ctx;
      }),
    });
    useSettingsStore.getState().set({ soundEnabled: true });

    playSound("complete");
    expect(ctx.createOscillator).toHaveBeenCalledTimes(3);
  });

  it("can be forced, so the settings toggle can preview itself", () => {
    const ctx = {
      state: "running",
      currentTime: 0,
      destination: {},
      createOscillator: vi.fn(() => ({
        type: "",
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      createGain: vi.fn(() => ({
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      })),
      close: vi.fn(() => Promise.resolve()),
    };
    // An arrow function cannot be `new`-ed; returning the stub from a
    // function expression is what makes `new Ctor()` yield it.
    vi.stubGlobal("window", {
      AudioContext: vi.fn(function () {
        return ctx;
      }),
    });

    // Sound is off, but force overrides it.
    playSound("correct", true);
    expect(ctx.createOscillator).toHaveBeenCalled();
  });
});

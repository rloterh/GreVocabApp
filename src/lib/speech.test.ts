/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_RATE,
  MAX_RATE,
  MIN_RATE,
  canSpeak,
  clampRate,
  listVoices,
  onVoicesChanged,
  speak,
} from "./speech";

interface FakeVoice {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
}

const VOICES: FakeVoice[] = [
  { voiceURI: "net-uk", name: "Cloud UK", lang: "en-GB", localService: false },
  { voiceURI: "local-us", name: "Local US", lang: "en-US", localService: true },
  { voiceURI: "fr", name: "Amélie", lang: "fr-FR", localService: true },
];

let spoken: Array<{ text: string; rate: number; voice: unknown }>;
let cancelled: number;

function install(voices: FakeVoice[] = VOICES) {
  spoken = [];
  cancelled = 0;
  const listeners = new Set<() => void>();
  class FakeUtterance {
    text: string;
    rate = 1;
    voice: unknown = null;
    constructor(text: string) {
      this.text = text;
    }
  }
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  vi.stubGlobal("speechSynthesis", {
    getVoices: () => voices,
    cancel: () => {
      cancelled++;
    },
    speak: (u: FakeUtterance) => {
      spoken.push({ text: u.text, rate: u.rate, voice: u.voice });
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    fire: () => listeners.forEach((fn) => fn()),
  });
  return { listeners };
}

beforeEach(() => install());
afterEach(() => vi.unstubAllGlobals());

describe("canSpeak", () => {
  it("is true when the API is present", () => {
    expect(canSpeak()).toBe(true);
  });
});

describe("listVoices", () => {
  it("keeps English voices and drops the rest", () => {
    expect(listVoices().map((v) => v.id)).not.toContain("fr");
  });

  it("puts installed voices first — they work offline and start instantly", () => {
    expect(listVoices()[0].id).toBe("local-us");
  });

  it("is empty rather than throwing when nothing is reported yet", () => {
    install([]);
    expect(listVoices()).toEqual([]);
  });
});

describe("onVoicesChanged", () => {
  it("subscribes and unsubscribes", () => {
    const { listeners } = install();
    const stop = onVoicesChanged(() => {});
    expect(listeners.size).toBe(1);
    stop();
    expect(listeners.size).toBe(0);
  });
});

describe("speak", () => {
  it("says the word", () => {
    speak("abate");
    expect(spoken).toHaveLength(1);
    expect(spoken[0].text).toBe("abate");
  });

  it("cancels first, so a second tap says it again rather than stuttering", () => {
    speak("abate");
    speak("abate");
    expect(cancelled).toBe(2);
    expect(spoken).toHaveLength(2);
  });

  it("uses the chosen voice", () => {
    speak("abate", { voice: "local-us" });
    expect((spoken[0].voice as FakeVoice).voiceURI).toBe("local-us");
  });

  it("falls back to the default when the chosen voice has gone away", () => {
    // A headset unplugged, a language pack removed. Speaking in the wrong
    // voice beats not speaking.
    speak("abate", { voice: "no-such-voice" });
    expect(spoken).toHaveLength(1);
    expect(spoken[0].voice).toBeNull();
  });

  it("applies the rate, clamped", () => {
    speak("abate", { rate: 99 });
    expect(spoken[0].rate).toBe(MAX_RATE);
  });

  it("says nothing for empty text", () => {
    speak("   ");
    expect(spoken).toEqual([]);
  });

  it("does not throw when the API is missing", () => {
    vi.unstubAllGlobals();
    expect(() => speak("abate")).not.toThrow();
    expect(canSpeak()).toBe(false);
  });

  it("swallows a blocked synthesiser", () => {
    // Some browsers throw until the user has interacted with the page.
    install();
    vi.stubGlobal("speechSynthesis", {
      getVoices: () => [],
      cancel: () => {},
      speak: () => {
        throw new Error("not allowed");
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    expect(() => speak("abate")).not.toThrow();
  });
});

describe("clampRate", () => {
  it.each([
    [0.1, MIN_RATE],
    [9, MAX_RATE],
    [1, 1],
    [Number.NaN, DEFAULT_RATE],
    [Number.POSITIVE_INFINITY, DEFAULT_RATE],
  ])("%s -> %s", (input, expected) => {
    expect(clampRate(input)).toBe(expected);
  });
});

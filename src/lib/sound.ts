/**
 * Interface sounds.
 *
 * Synthesised with the Web Audio API rather than shipped as files: the whole
 * palette is a few sine and triangle tones, and three audio assets would be
 * larger than this module and slower to load.
 *
 * Opt-in. Nothing here makes a sound unless `soundEnabled` is on, and every
 * entry point is a no-op when it is off, so callers never have to check.
 *
 * See ROADMAP.md, Phase 5.
 */

import { useSettingsStore } from "@/store/useSettingsStore";

export type SoundName = "flip" | "correct" | "wrong" | "complete";

/** Kept quiet on purpose — this should be felt more than heard. */
const MASTER_GAIN = 0.06;

/**
 * One AudioContext for the app. Browsers cap how many you may create, and
 * making one per sound leaks them.
 */
let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  return context;
}

interface Tone {
  /** Hz. */
  frequency: number;
  /** Seconds from the start of the sound. */
  at: number;
  /** Seconds. */
  duration: number;
  type?: OscillatorType;
}

/**
 * The palette. Rising intervals read as success, falling as failure — the
 * convention is old enough that going against it would just be confusing.
 */
const SOUNDS: Record<SoundName, Tone[]> = {
  // A soft, short click for turning a card over.
  flip: [{ frequency: 660, at: 0, duration: 0.05, type: "triangle" }],
  // Major third up.
  correct: [
    { frequency: 587.33, at: 0, duration: 0.09 },
    { frequency: 880, at: 0.07, duration: 0.12 },
  ],
  // Minor second down, quieter and duller.
  wrong: [
    { frequency: 311.13, at: 0, duration: 0.11, type: "triangle" },
    { frequency: 293.66, at: 0.09, duration: 0.14, type: "triangle" },
  ],
  // A small arpeggio for finishing a session.
  complete: [
    { frequency: 523.25, at: 0, duration: 0.1 },
    { frequency: 659.25, at: 0.09, duration: 0.1 },
    { frequency: 783.99, at: 0.18, duration: 0.18 },
  ],
};

/** Is sound switched on in settings? */
export function soundEnabled(): boolean {
  return useSettingsStore.getState().soundEnabled;
}

/**
 * Play one of the palette's sounds.
 *
 * Silent when sound is off, when the runtime has no Web Audio, or when the
 * browser has not yet allowed audio — none of which is worth an error.
 */
export function playSound(name: SoundName, force = false): void {
  if (!force && !soundEnabled()) return;

  const ctx = audioContext();
  if (!ctx) return;

  // A context created before the first user gesture starts suspended.
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});

  const now = ctx.currentTime;
  for (const tone of SOUNDS[name]) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = tone.type ?? "sine";
    oscillator.frequency.value = tone.frequency;

    const start = now + tone.at;
    const end = start + tone.duration;
    // A short attack and an exponential fall; a raw square-edged gain clicks.
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(MASTER_GAIN, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }
}

/** Release the shared context. Only needed by tests. */
export function resetAudio(): void {
  void context?.close().catch(() => {});
  context = null;
}

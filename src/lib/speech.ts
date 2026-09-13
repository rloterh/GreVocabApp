/**
 * Saying a word out loud.
 *
 * Three copies of this existed — on the practice card, on the study card, and
 * on the word of the day — each constructing its own utterance at rate 0.9 and
 * none of them able to honour a preference, because there was nowhere to keep
 * one. This is that one place.
 *
 * Everything here degrades to a no-op rather than throwing. Speech synthesis
 * is missing in some browsers, blocked in others, and silently unavailable in
 * a few until the user has interacted with the page; a vocabulary app should
 * not break because it cannot pronounce something.
 */

/** A voice as the settings UI needs it. `null` name means "browser default". */
export interface VoiceChoice {
  /** `voiceURI`, which is what survives a reload. */
  id: string;
  label: string;
  lang: string;
}

export interface SpeakOptions {
  /** `voiceURI` of the chosen voice, or null for whatever the browser picks. */
  voice?: string | null;
  /** 0.5 to 1.5. Slower is genuinely useful for a word you have never seen. */
  rate?: number;
}

export const DEFAULT_RATE = 0.9;
export const MIN_RATE = 0.5;
export const MAX_RATE = 1.5;

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * English voices, best first.
 *
 * English only, because the corpus is English and a list of ninety voices in
 * forty languages is a worse control than a list of six. Sorted so that the
 * local ones come first: they are the ones that work offline and start
 * instantly.
 */
export function listVoices(): VoiceChoice[] {
  if (!canSpeak()) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith("en"))
    .sort((a, b) => Number(b.localService) - Number(a.localService))
    .map((voice) => ({
      id: voice.voiceURI,
      label: voice.name,
      lang: voice.lang,
    }));
}

/**
 * Voices arrive asynchronously in most browsers.
 *
 * `getVoices()` returns an empty array on first call and fills in later, which
 * is why a voice picker built on one synchronous read is always empty the
 * first time it is opened. Returns an unsubscribe function.
 */
export function onVoicesChanged(listener: () => void): () => void {
  if (!canSpeak()) return () => {};
  const synth = window.speechSynthesis;
  synth.addEventListener("voiceschanged", listener);
  return () => synth.removeEventListener("voiceschanged", listener);
}

export function speak(text: string, options: SpeakOptions = {}): void {
  if (!canSpeak() || !text.trim()) return;
  const synth = window.speechSynthesis;

  // Cancel first. Tapping the speaker twice should say the word twice, not
  // queue a second reading behind the first and stutter.
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = clampRate(options.rate ?? DEFAULT_RATE);

  if (options.voice) {
    const chosen = synth
      .getVoices()
      .find((voice) => voice.voiceURI === options.voice);
    // A voice that has gone away — a headset unplugged, a language pack
    // removed — falls back to the default rather than failing silently.
    if (chosen) utterance.voice = chosen;
  }

  try {
    synth.speak(utterance);
  } catch {
    // Blocked, or called before any user interaction. Nothing to recover.
  }
}

export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return DEFAULT_RATE;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}

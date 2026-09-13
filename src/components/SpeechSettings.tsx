/**
 * Which voice says the words, and how fast.
 *
 * The voice list is the fiddly part. `getVoices()` returns an empty array on
 * the first call in most browsers and fills in asynchronously, so a picker
 * built on one synchronous read is always empty the first time it is opened
 * and correct ever after — which looks like a bug that fixes itself and is
 * therefore never reported.
 */

import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/store/useSettingsStore";
import {
  DEFAULT_RATE,
  MAX_RATE,
  MIN_RATE,
  canSpeak,
  listVoices,
  onVoicesChanged,
  speak,
  type VoiceChoice,
} from "@/lib/speech";

const SAMPLE = "Perspicacious";

export function SpeechSettings() {
  const settings = useSettingsStore();
  const [voices, setVoices] = useState<VoiceChoice[]>(() => listVoices());

  useEffect(() => {
    const refresh = () => setVoices(listVoices());
    refresh();
    return onVoicesChanged(refresh);
  }, []);

  if (!canSpeak()) {
    return (
      <p className="text-xs text-muted-foreground">
        This browser cannot speak. Everything else works; the pronounce buttons
        are simply not shown.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="speech-voice" className="text-xs font-medium block mb-1.5">
          Voice
        </label>
        <select
          id="speech-voice"
          value={settings.speechVoice ?? ""}
          onChange={(e) =>
            settings.set({ speechVoice: e.target.value || null })
          }
          // No `text-sm`: a class beats the element rule in globals.css, and
          // iOS Safari zooms the page when a focused control is under 16px.
          // The mobile audit caught this one.
          className="h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3"
        >
          <option value="">Browser default</option>
          {voices.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.label} ({voice.lang})
            </option>
          ))}
        </select>
        <p className="text-[11px] text-muted-foreground mt-1.5">
          {voices.length > 0
            ? `${voices.length} English ${voices.length === 1 ? "voice" : "voices"} available. Installed voices work offline; others may not.`
            : "No voices reported yet — some browsers only load them after the first time they speak."}
        </p>
      </div>

      <div>
        <label htmlFor="speech-rate" className="text-xs font-medium block mb-1.5">
          Speed <span className="tabular text-muted-foreground">({settings.speechRate.toFixed(2)}×)</span>
        </label>
        <input
          id="speech-rate"
          type="range"
          min={MIN_RATE}
          max={MAX_RATE}
          step={0.05}
          value={settings.speechRate}
          onChange={(e) => settings.set({ speechRate: Number(e.target.value) })}
          className="w-full max-w-sm accent-accent"
        />
        <p className="text-[11px] text-muted-foreground mt-1.5">
          Default is {DEFAULT_RATE}×. Slower is genuinely useful for a word you
          have never seen written down.
        </p>
      </div>

      <label className="flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={settings.autoPronounce}
          onChange={(e) => settings.set({ autoPronounce: e.target.checked })}
          className="accent-accent"
        />
        <span>
          Say the word when a flashcard is revealed
          <span className="block text-[11px] text-muted-foreground">
            Off by default — a card that starts talking is startling in a quiet room.
          </span>
        </span>
      </label>

      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          speak(SAMPLE, {
            voice: settings.speechVoice,
            rate: settings.speechRate,
          })
        }
      >
        <Volume2 className="w-3.5 h-3.5" />
        Hear "{SAMPLE}"
      </Button>
    </div>
  );
}

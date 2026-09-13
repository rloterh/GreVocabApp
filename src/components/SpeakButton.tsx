/**
 * The speaker beside a word.
 *
 * One component so that the user's voice and rate apply everywhere a word can
 * be pronounced, rather than to whichever screen happened to be written last.
 * Renders nothing at all where speech is unavailable — a dead control is worse
 * than a missing one.
 */

import { Volume2 } from "lucide-react";
import { useSettingsStore } from "@/store/useSettingsStore";
import { canSpeak, speak } from "@/lib/speech";
import { cn } from "@/lib/utils";

export function SpeakButton({
  word,
  className,
  size = "md",
}: {
  word: string;
  className?: string;
  /** `sm` for dense rows; `md` keeps the 44px touch target. */
  size?: "sm" | "md";
}) {
  const voice = useSettingsStore((s) => s.speechVoice);
  const rate = useSettingsStore((s) => s.speechRate);

  if (!canSpeak()) return null;

  return (
    <button
      type="button"
      aria-label={`Pronounce ${word}`}
      onClick={(event) => {
        // Often sits inside a card that does something else when clicked.
        event.stopPropagation();
        speak(word, { voice, rate });
      }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full text-muted-foreground",
        "hover:text-foreground transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        size === "sm" ? "h-8 w-8" : "h-11 w-11",
        className,
      )}
    >
      <Volume2 className={size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"} />
    </button>
  );
}

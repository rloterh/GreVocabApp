/**
 * Which notebook is open.
 *
 * ADR 0011 makes this not optional: "A user who cannot tell which track is
 * active will eventually study the wrong one." So it is visible on every
 * screen at every width, and it is the control as well as the indicator —
 * a separate label and switch would be two things to keep in agreement.
 *
 * There is no confirmation dialog, deliberately. Switching loses nothing;
 * a dialog would imply otherwise and be dismissed unread by the third day.
 */

import { useId } from "react";
import { motion } from "framer-motion";
import { useVocabStore } from "@/store/useVocabStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { TRACK_DISPLAY_ORDER, TRACK_META } from "@/lib/track";
import { cn } from "@/lib/utils";

/**
 * `railLabels` shows the short names below `lg` — for the sidebar, which is a
 * 76px icon rail until then. The small-screen header has room for full names.
 */
export function TrackSwitcher({ className, railLabels = false }: { className?: string; railLabels?: boolean }) {
  const activeTrack = useVocabStore((s) => s.activeTrack);
  const setActiveTrack = useVocabStore((s) => s.setActiveTrack);
  const months = useVocabStore((s) => s.months);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  // Per instance, not a constant. This renders twice — once in the sidebar and
  // once in the small-screen header — and a shared `layoutId` makes Framer
  // treat them as one element, animating the pill into whichever copy is
  // currently `display: none`. The indicator then vanishes from the one on
  // screen, which is the single thing this component exists to show.
  const layoutId = `track-active-${useId()}`;

  return (
    <div
      role="radiogroup"
      aria-label="Vocabulary"
      // A grid, not flex-1 buttons: equal `1fr` columns are each as wide as
      // the longest label. flex-1 split the content width in half, which was
      // fine for GRE and SAT and clipped "Advanced" beside "Easy".
      className={cn(
        "relative grid auto-cols-fr grid-flow-col items-center gap-0.5 rounded-lg border border-border/60 bg-secondary/40 p-0.5",
        className,
      )}
    >
      {TRACK_DISPLAY_ORDER.map((track) => {
        const meta = TRACK_META[track];
        const active = track === activeTrack;
        const count = Object.values(months).filter((m) => m.track === track).length;
        return (
          <button
            key={track}
            role="radio"
            aria-checked={active}
            // The label alone reads as "Advanced" to a screen reader, which does
            // not say what pressing it does or what is in there.
            aria-label={`${meta.label} — ${meta.description}, ${count} ${
              count === 1 ? "month" : "months"
            }`}
            onClick={() => setActiveTrack(track)}
            className={cn(
              "relative whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { duration: 0.25, ease: [0.16, 1, 0.3, 1] }
                }
                className="absolute inset-0 rounded-md bg-primary"
              />
            )}
            {railLabels ? (
              <>
                <span className="relative lg:hidden">{meta.short}</span>
                <span className="relative hidden lg:inline">{meta.label}</span>
              </>
            ) : (
              <span className="relative">{meta.label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

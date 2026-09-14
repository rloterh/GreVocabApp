/**
 * The arrows either side of a flashcard.
 *
 * Hidden at rest. A card with two permanent arrows bolted to it looks like a
 * carousel widget; one that reveals them as you approach looks like it was
 * made for you, and the difference is entirely in the restraint.
 *
 * Three rules, each learned from an interaction that would otherwise irritate:
 *
 * 1. The reveal region includes the arrows themselves, or moving the pointer
 *    toward one makes it vanish before it can be clicked. That is the parent's
 *    job — this component only renders. It said this for a long time while the
 *    parent did not actually do it: 16px of un-hovered ground sat between card
 *    and arrow, and the arrow faded out from under the cursor every time.
 *    `scripts/drive/edge-arrow-probe.mjs` now measures the claim.
 * 2. At the ends the arrow is **disabled and still visible**, never hidden.
 *    Hiding it would move the other one between cards, and a control that
 *    jumps is worse than one that is greyed.
 * 3. It is a real button in the tab order with a real name, so none of the
 *    above matters to somebody navigating by keyboard or screen reader.
 *
 * See docs/FLASHCARD-INTERACTION.md.
 */

import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function EdgeArrow({
  side,
  label,
  shown,
  disabled,
  reduceMotion,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  shown: boolean;
  disabled: boolean;
  reduceMotion: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  // Inward, so the arrow settles toward the card rather than away from it.
  const from = side === "left" ? -4 : 4;

  return (
    <motion.button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      initial={false}
      animate={{
        opacity: shown ? (disabled ? 0.3 : 1) : 0,
        x: reduceMotion || shown ? 0 : from,
      }}
      transition={{
        duration: reduceMotion ? 0 : 0.18,
        ease: [0.16, 1, 0.3, 1],
      }}
      // Not reachable, and not a tab stop, while it is invisible — but focus
      // reveals it, so a keyboard user tabbing forward still finds it.
      style={{ pointerEvents: shown ? "auto" : "none" }}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 z-20",
        "grid h-11 w-11 place-items-center rounded-full",
        "border border-border/70 bg-card/80 backdrop-blur-md",
        "text-foreground shadow-lg",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "focus-visible:opacity-100",
        !disabled && "hover:bg-card hover:border-border",
        disabled && "cursor-not-allowed",
        // Overlapping the card's edge until the column is genuinely wide
        // enough to hold a 56px gutter, and outside it after that.
        //
        // `md` was too early. Measured: at 1024 the card sits in a 784px
        // column, leaving 32px each side, so an arrow placed 56px out landed
        // *under the sidebar* — it revealed on hover and then swallowed the
        // click. At `xl` the column is 1040 and the gutter fits with room.
        // A control sitting on the artwork is much better than one that is
        // clipped, or one that cannot be pressed.
        side === "left" ? "left-2 xl:-left-14" : "right-2 xl:-right-14",
      )}
    >
      <Icon className="h-5 w-5" />
    </motion.button>
  );
}

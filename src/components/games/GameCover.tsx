/**
 * A game's cover: a tint of a theme token and a typographic mark repeated as a
 * pattern.
 *
 * No raster art and no new colours. Eight games with their own hues would be
 * eighty new token values across ten themes; tints of the existing tokens are
 * covered by the contrast test already, and the pattern is drawn in
 * `currentColor`, so it is right in every theme by construction.
 *
 * See docs/GAMES-UI.md §2.
 */

import { useId } from "react";
import type { CoverTint } from "@/lib/games/catalogue";
import { cn } from "@/lib/utils";

const TINT: Record<CoverTint, string> = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/10 text-accent",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning",
  secondary: "bg-secondary text-muted-foreground",
};

export function GameCover({
  tint,
  mark,
  title,
  className,
}: {
  tint: CoverTint;
  mark: string;
  /** Set large over the pattern; omit for a plain strip. */
  title?: string;
  className?: string;
}) {
  const id = `cover-${useId().replace(/:/g, "")}`;
  return (
    <div className={cn("relative overflow-hidden", TINT[tint], className)} aria-hidden="true">
      <svg className="absolute inset-0 h-full w-full opacity-[0.16]">
        <defs>
          <pattern id={id} width="44" height="44" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
            <text
              x="22"
              y="29"
              textAnchor="middle"
              fontSize="20"
              fill="currentColor"
              className="display-serif"
            >
              {mark}
            </text>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
      {title && (
        <p className="relative flex h-full items-center px-5 display-serif text-2xl font-semibold tracking-tight">
          {title}
        </p>
      )}
    </div>
  );
}

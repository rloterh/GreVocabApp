import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The action that moves you on, always in reach.
 *
 * Setup screens are a list of choices followed by one commit button, and the
 * list is as long as the app has options. Measured before this existed:
 * "Start studying" sat 200px below the fold on a 1280x720 laptop and 127px
 * below on a phone, "Start quiz" 165px and 250px. You chose a deck and then
 * had to go looking for the way to begin — on the screen whose whole job is
 * to begin. `scripts/drive/reach-audit.mjs` measures it.
 *
 * `sticky`, not `fixed`. Sticky keeps the bar inside the content column, so it
 * lines up with the content rather than spanning the sidebar as well, and it
 * reserves its own space in the flow — which means scrolling to the bottom
 * settles it into place instead of leaving it hovering over the last option
 * forever.
 *
 * Two details that are easy to get wrong:
 *
 * - **It must clear the mobile tab bar**, which is `fixed` at `z-30` and 58px
 *   tall plus whatever safe-area padding the device asks for. Sitting at
 *   `bottom-0` would put the button *under* the navigation on a phone.
 * - **The content behind it needs to fade, not be sliced.** A floating card
 *   with sharp text running under its edge reads as a bug. The scrim below
 *   does that, and is why this is a full-width band rather than a button with
 *   a border around it.
 */
export function StickyActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky z-20",
        // 3.625rem is the tab bar's content height; the `max()` mirrors its own
        // bottom padding so a device with a home indicator moves both together.
        "bottom-[calc(3.625rem+max(0.75rem,env(safe-area-inset-bottom)))] rail:bottom-0",
        // The band bleeds past the column's padding so the fade reaches the
        // edges of the content rather than stopping short of them.
        "-mx-4 px-4 sm:-mx-6 sm:px-6",
        "pt-10 pb-3 rail:pb-4",
        "bg-gradient-to-t from-background via-background to-transparent",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A little air between the last option and the bar.
 *
 * Not load-bearing — `sticky` reserves its own space, so nothing is ever
 * permanently hidden behind the bar — but without it the final card sits
 * directly against the button at the end of the scroll.
 */
export function ActionBarSpacer() {
  return <div aria-hidden className="h-2" />;
}

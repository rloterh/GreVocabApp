/**
 * Choosing among ten themes.
 *
 * Ten swatches in a flat grid is a wall, so they are grouped — Automatic,
 * Light, Dark, Accessibility — which turns one choice among ten into three
 * short ones.
 *
 * Each button previews its own palette rather than carrying an icon someone
 * picked to stand for it. The swatch is the theme's actual background,
 * foreground and accent, read from the same CSS custom properties the app
 * renders with, so a preview cannot drift from what it previews.
 *
 * See docs/THEMES.md.
 */

import { Check } from "lucide-react";
import { applyTheme, THEME_GROUPS, THEMES } from "@/lib/theme";
import { resolveTheme } from "@/lib/theme";
import type { Theme } from "@/types";
import { cn } from "@/lib/utils";

export function ThemePicker({
  value,
  onChange,
}: {
  value: Theme;
  onChange: (theme: Theme) => void;
}) {
  return (
    <div className="space-y-4">
      {THEME_GROUPS.map(({ group, label }) => {
        const themes = THEMES.filter((t) => t.group === group);
        if (themes.length === 0) return null;
        return (
          <div key={group}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
              {label}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {themes.map((theme) => (
                <button
                  key={theme.value}
                  type="button"
                  aria-pressed={value === theme.value}
                  onClick={() => {
                    onChange(theme.value);
                    applyTheme(theme.value);
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-md border p-2.5 text-left transition-colors",
                    value === theme.value
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-border/80",
                  )}
                >
                  <Swatch theme={theme.value} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {theme.label}
                      {value === theme.value && (
                        <Check className="w-3 h-3 text-accent shrink-0" />
                      )}
                    </span>
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {theme.hint}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A three-band preview of one palette.
 *
 * The theme's own class is applied to this element, so the custom properties
 * resolve to that theme's values while the rest of the page stays as it is.
 * That is why the preview cannot go stale: it is not a copy of the palette, it
 * is the palette.
 */
function Swatch({ theme }: { theme: Theme }) {
  // "System" has no palette of its own; show whichever it currently resolves to.
  const rendered = theme === "system" ? resolveTheme("system") : theme;
  return (
    <span
      className={cn(
        rendered,
        "flex h-9 w-9 shrink-0 overflow-hidden rounded-md border border-border/60",
      )}
      style={{ backgroundColor: "hsl(var(--background))" }}
      aria-hidden
    >
      <span className="w-1/3" style={{ backgroundColor: "hsl(var(--background))" }} />
      <span className="w-1/3" style={{ backgroundColor: "hsl(var(--foreground))" }} />
      <span className="w-1/3" style={{ backgroundColor: "hsl(var(--accent))" }} />
    </span>
  );
}

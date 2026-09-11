/**
 * Navigation below `lg`, where the sidebar does not fit.
 *
 * Ten destinations do not fit a thumb-reachable bar, so five earn a tab and the
 * rest live behind More. Which five is a product decision, recorded in
 * docs/MOBILE.md: the things a user does *daily*.
 *
 * This is the same `navigate` the sidebar calls. Pages never learn which shell
 * is showing — anything that needs to know is a layout bug in the page.
 */

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Calendar,
  ChartLine,
  GraduationCap,
  Layers,
  LayoutDashboard,
  MoreHorizontal,
  PenLine,
  Search,
  Settings as SettingsIcon,
  Archive as ArchiveIcon,
} from "lucide-react";
import { useAppStore, type Page } from "@/store/useAppStore";
import { AboutDialog } from "@/components/AboutDialog";
import { cn } from "@/lib/utils";

interface Destination {
  page: Page;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** The four done daily, plus More. */
const TABS: Destination[] = [
  { page: "dashboard", label: "Home", icon: LayoutDashboard },
  { page: "practice", label: "Practice", icon: BookOpen },
  { page: "flashcards", label: "Cards", icon: Layers },
  { page: "quiz", label: "Quiz", icon: GraduationCap },
];

/** Everything else, one tap further away. */
const MORE: Destination[] = [
  { page: "sentences", label: "Sentences", icon: PenLine },
  { page: "calendar", label: "Calendar", icon: Calendar },
  { page: "archive", label: "Archive", icon: ArchiveIcon },
  { page: "progress", label: "Progress", icon: ChartLine },
  { page: "search", label: "Search", icon: Search },
  { page: "settings", label: "Settings", icon: SettingsIcon },
];

export function MobileTabBar({
  moreOpen,
  onMoreOpenChange,
}: {
  moreOpen: boolean;
  onMoreOpenChange: (open: boolean) => void;
}) {
  const page = useAppStore((s) => s.page);
  const navigate = useAppStore((s) => s.navigate);
  const inMore = MORE.some((d) => d.page === page);

  // Escape closes the sheet, as it would any other transient surface.
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onMoreOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen, onMoreOpenChange]);

  function go(target: Page) {
    navigate(target);
    onMoreOpenChange(false);
  }

  return (
    <>
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 bg-background/80 lg:hidden"
              onClick={() => onMoreOpenChange(false)}
            />
            <motion.div
              role="dialog"
              aria-label="More destinations"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-border bg-card p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden"
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
              <div className="grid grid-cols-3 gap-2">
                {MORE.map((d) => {
                  const Icon = d.icon;
                  const active = page === d.page;
                  return (
                    <button
                      key={d.page}
                      type="button"
                      onClick={() => go(d.page)}
                      className={cn(
                        "flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-lg border p-2 text-xs transition-colors",
                        active
                          ? "border-accent bg-accent/10 text-foreground"
                          : "border-border/60 text-muted-foreground",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      {d.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-center">
                <AboutDialog />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {TABS.map((d) => (
          <Tab
            key={d.page}
            destination={d}
            active={page === d.page}
            onSelect={() => go(d.page)}
          />
        ))}
        <Tab
          destination={{ page: "dashboard", label: "More", icon: MoreHorizontal }}
          active={inMore || moreOpen}
          onSelect={() => onMoreOpenChange(!moreOpen)}
          expanded={moreOpen}
        />
      </nav>
    </>
  );
}

function Tab({
  destination,
  active,
  onSelect,
  expanded,
}: {
  destination: Destination;
  active: boolean;
  onSelect: () => void;
  expanded?: boolean;
}) {
  const Icon = destination.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active && expanded === undefined ? "page" : undefined}
      aria-expanded={expanded}
      // 44px is the floor; this is taller, because a tab bar is where a
      // mis-tap costs the most.
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1 py-2 min-h-[3.5rem] text-[11px] font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <Icon className="h-5 w-5" />
      {destination.label}
    </button>
  );
}

/**
 * Lexicon — root component.
 *
 * New here? Read /CLAUDE.md and /CONTINUING.md at the repo root before making
 * changes. When adding a page: create it in src/pages/, add to the Page union
 * in src/store/useAppStore.ts, register it in renderPage() below, and add a
 * nav entry in src/components/Sidebar.tsx.
 */
import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/Sidebar";
import { Toast } from "@/components/Toast";
import { DropOverlay } from "@/components/DropOverlay";
import { ShortcutsHelp } from "@/components/ShortcutsHelp";
import { Onboarding } from "@/components/Onboarding";
import { useAppStore } from "@/store/useAppStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useStudyReminder } from "@/hooks/useStudyReminder";
import { useShortcuts } from "@/hooks/useShortcuts";
import { useWatchedFolder } from "@/hooks/useWatchedFolder";
import { useDesktopEvents } from "@/hooks/useDesktopEvents";
import { applyTheme } from "@/lib/theme";
import { Dashboard } from "@/pages/Dashboard";
import { DailyPractice } from "@/pages/DailyPractice";
import { Flashcards } from "@/pages/Flashcards";
import { Quiz } from "@/pages/Quiz";
import { SentenceBuilder } from "@/pages/SentenceBuilder";
import { Calendar } from "@/pages/Calendar";
import { Archive } from "@/pages/Archive";
import { ProgressPage } from "@/pages/ProgressPage";
import { Search } from "@/pages/Search";
import { Settings } from "@/pages/Settings";

export function App() {
  const page = useAppStore((s) => s.page);
  const theme = useSettingsStore((s) => s.theme);

  // No-op unless the user has enabled reminders and granted permission.
  useStudyReminder();
  // Desktop only; both inert in the browser.
  useWatchedFolder();
  useDesktopEvents();
  const { helpOpen, setHelpOpen } = useShortcuts();

  // Apply the theme on mount and when it changes. When following the system,
  // keep following it — the OS can flip while the app is open.
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="min-h-full px-8"
            >
              {renderPage(page)}
            </motion.div>
          </AnimatePresence>
        </main>
        <Toast />
        <DropOverlay />
        <ShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} />
        <Onboarding />
      </div>
    </TooltipProvider>
  );
}

function renderPage(page: string) {
  switch (page) {
    case "dashboard":
      return <Dashboard />;
    case "practice":
      return <DailyPractice />;
    case "flashcards":
      return <Flashcards />;
    case "quiz":
      return <Quiz />;
    case "sentences":
      return <SentenceBuilder />;
    case "calendar":
      return <Calendar />;
    case "archive":
      return <Archive />;
    case "progress":
      return <ProgressPage />;
    case "search":
      return <Search />;
    case "settings":
      return <Settings />;
    default:
      return <Dashboard />;
  }
}

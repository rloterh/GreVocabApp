/**
 * Lexicon — root component.
 *
 * New here? Read /CLAUDE.md and /CONTINUING.md at the repo root before making
 * changes. When adding a page: create it in src/pages/, add to the Page union
 * in src/store/useAppStore.ts, register it in renderPage() below, and add a
 * nav entry in src/components/Sidebar.tsx.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/Sidebar";
import { MobileTabBar } from "@/components/MobileTabBar";
import { Toast } from "@/components/Toast";
import { DropOverlay } from "@/components/DropOverlay";
import { ShortcutsHelp } from "@/components/ShortcutsHelp";
import { Onboarding } from "@/components/Onboarding";
import { useAppStore } from "@/store/useAppStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useStudyReminder } from "@/hooks/useStudyReminder";
import { useOpenRouterCallback } from "@/hooks/useOpenRouterConnect";
import { useShortcuts } from "@/hooks/useShortcuts";
import { useSystemBack } from "@/hooks/useSystemBack";
import { useWatchedFolder } from "@/hooks/useWatchedFolder";
import { useDesktopEvents } from "@/hooks/useDesktopEvents";
import { applyTheme } from "@/lib/theme";
import { migrateLegacySecrets } from "@/lib/ai/keystore";


/**
 * Pages load on demand.
 *
 * The initial chunk was 1.1 MB, and the single largest contributor was the
 * charting library used by exactly one screen. Splitting per route means a
 * first visit downloads the shell and the dashboard, not the charts, the quiz
 * engine and the Anki exporter as well.
 */
const Dashboard = lazy(() =>
  import("@/pages/Dashboard").then((m) => ({ default: m.Dashboard })),
);
const DailyPractice = lazy(() =>
  import("@/pages/DailyPractice").then((m) => ({ default: m.DailyPractice })),
);
const Flashcards = lazy(() =>
  import("@/pages/Flashcards").then((m) => ({ default: m.Flashcards })),
);
const Quiz = lazy(() => import("@/pages/Quiz").then((m) => ({ default: m.Quiz })));
const ExamPage = lazy(() =>
  import("@/pages/Exam").then((m) => ({ default: m.ExamPage })),
);
const SentenceBuilder = lazy(() =>
  import("@/pages/SentenceBuilder").then((m) => ({ default: m.SentenceBuilder })),
);
const Calendar = lazy(() =>
  import("@/pages/Calendar").then((m) => ({ default: m.Calendar })),
);
const Archive = lazy(() =>
  import("@/pages/Archive").then((m) => ({ default: m.Archive })),
);
const ProgressPage = lazy(() =>
  import("@/pages/ProgressPage").then((m) => ({ default: m.ProgressPage })),
);
const Search = lazy(() =>
  import("@/pages/Search").then((m) => ({ default: m.Search })),
);
const Settings = lazy(() =>
  import("@/pages/Settings").then((m) => ({ default: m.Settings })),
);

export function App() {
  const page = useAppStore((s) => s.page);
  const theme = useSettingsStore((s) => s.theme);
  const [moreOpen, setMoreOpen] = useState(false);

  // Move any key still sitting in the settings blob into the keychain. Runs
  // once per launch and is a no-op after the first. ADR 0010.
  useEffect(() => {
    void migrateLegacySecrets();
  }, []);

  // Finishes a web OpenRouter sign-in that redirected away and came back. The
  // app reopens on the dashboard, not on Settings, so this cannot live in the
  // panel that started it. Inert on desktop.
  useOpenRouterCallback();

  // No-op unless the user has enabled reminders and granted permission.
  useStudyReminder();
  // Android's back gesture navigates within the app before exiting it.
  // Inert everywhere else.
  useSystemBack();

  // Desktop only; both inert in the browser.
  useWatchedFolder();
  useDesktopEvents();
  const { helpOpen, setHelpOpen } = useShortcuts();

  useEffect(() => {
    setMoreOpen(false);
  }, [page]);

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
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="min-h-full px-4 sm:px-6 lg:px-8 pb-24 lg:pb-0"
            >
              <Suspense fallback={<PageFallback />}>
                {renderPage(page)}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
        <MobileTabBar moreOpen={moreOpen} onMoreOpenChange={setMoreOpen} />
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
    case "exam":
      return <ExamPage />;
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

/**
 * Deliberately almost nothing.
 *
 * A chunk usually resolves in a few milliseconds, and a spinner that appears
 * and vanishes in that time reads as a flicker rather than as feedback. This
 * reserves the height so the layout does not jump, and says nothing.
 */
function PageFallback() {
  return <div className="min-h-[60vh]" aria-busy="true" />;
}

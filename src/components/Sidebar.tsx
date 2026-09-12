import { motion } from "framer-motion";
import {
  BookOpen,
  Calendar,
  ChartLine,
  ClipboardList,
  GraduationCap,
  Layers,
  LayoutDashboard,
  PenLine,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Archive as ArchiveIcon,
} from "lucide-react";
import { useAppStore, type Page } from "@/store/useAppStore";
import { AboutDialog } from "@/components/AboutDialog";
import { TrackSwitcher } from "@/components/TrackSwitcher";
import { cn } from "@/lib/utils";

interface NavItem {
  page: Page;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PRIMARY: NavItem[] = [
  { page: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { page: "practice", label: "Daily practice", icon: BookOpen },
  { page: "flashcards", label: "Flashcards", icon: Layers },
  { page: "quiz", label: "Quiz", icon: GraduationCap },
  { page: "exam", label: "Exam", icon: ClipboardList },
  { page: "sentences", label: "Sentences", icon: PenLine },
];

const SECONDARY: NavItem[] = [
  { page: "calendar", label: "Calendar", icon: Calendar },
  { page: "archive", label: "Archive", icon: ArchiveIcon },
  { page: "progress", label: "Progress", icon: ChartLine },
  { page: "search", label: "Search", icon: Search },
];

export function Sidebar() {
  const { page, navigate } = useAppStore();

  return (
    <aside className="hidden lg:flex w-60 shrink-0 border-r border-border bg-card/40 flex-col h-full">
      <div className="px-5 py-6 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight">Lexicon</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Daily vocabulary
          </p>
        </div>
      </div>

      {/* Which notebook is open — see docs/adr/0011-tracks.md. */}
      <div className="px-5 pb-4">
        <TrackSwitcher className="w-full" />
      </div>

      <nav className="flex-1 px-3 space-y-6 overflow-y-auto no-scrollbar">
        <NavSection items={PRIMARY} current={page} onSelect={navigate} />
        <div className="pt-2 border-t border-border/60">
          <NavSection
            items={SECONDARY}
            current={page}
            onSelect={navigate}
            header="Explore"
          />
        </div>
      </nav>

      <div className="p-3 border-t border-border/60 flex items-center gap-1">
        <button
          type="button"
          onClick={() => navigate("settings")}
          className={cn(
            "flex-1 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
            page === "settings"
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
          )}
        >
          <SettingsIcon className="w-4 h-4" />
          Settings
        </button>
        <AboutDialog />
      </div>
    </aside>
  );
}

function NavSection({
  items,
  current,
  onSelect,
  header,
}: {
  items: NavItem[];
  current: Page;
  onSelect: (p: Page) => void;
  header?: string;
}) {
  return (
    <div className={cn(header && "pt-3")}>
      {header && (
        <p className="px-3 mb-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          {header}
        </p>
      )}
      <div className="space-y-0.5">
        {items.map((item) => {
          const active = current === item.page;
          const Icon = item.icon;
          return (
            <button
              key={item.page}
              type="button"
              onClick={() => onSelect(item.page)}
              className={cn(
                "relative w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-md bg-secondary"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <Icon className="relative z-10 w-4 h-4" />
              <span className="relative z-10">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Check, Eye, EyeOff, Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useProgressStore } from "@/store/useProgressStore";
import { useVocabStore } from "@/store/useVocabStore";
import { useAppStore } from "@/store/useAppStore";
import {
  notificationPermission,
  requestNotificationPermission,
} from "@/hooks/useStudyReminder";
import {
  markdownFilename,
  progressToMarkdown,
} from "@/lib/markdown-export";
import { cn } from "@/lib/utils";

/** Hand a blob to the browser as a download. */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Settings() {
  const settings = useSettingsStore();
  const resetProgress = useProgressStore((s) => s.reset);
  const wordsProgress = useProgressStore((s) => s.words);
  const activity = useProgressStore((s) => s.activity);
  const vocab = useVocabStore();
  const showToast = useAppStore((s) => s.showToast);
  const [showKey, setShowKey] = useState(false);
  const [ankiBusy, setAnkiBusy] = useState(false);
  const [ankiDeckName, setAnkiDeckName] = useState("Lexicon");
  const [ankiGrouping, setAnkiGrouping] = useState<"month" | "single">("month");
  const [permission, setPermission] = useState(notificationPermission());

  // Permission can be revoked from browser UI while the app is open.
  useEffect(() => {
    const id = window.setInterval(
      () => setPermission(notificationPermission()),
      3000,
    );
    return () => window.clearInterval(id);
  }, []);

  async function toggleReminders(next: boolean) {
    if (!next) {
      settings.set({ studyReminderEnabled: false });
      return;
    }
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result !== "granted") {
      settings.set({ studyReminderEnabled: false });
      showToast({
        title:
          result === "unsupported"
            ? "Notifications unavailable here"
            : "Notification permission denied",
        description:
          result === "unsupported"
            ? "This runtime has no Notification API. Desktop builds need tauri-plugin-notification."
            : "Allow notifications for this site, then switch reminders back on.",
        variant: "error",
      });
      return;
    }
    settings.set({ studyReminderEnabled: true });
    showToast({ title: "Daily reminder on", variant: "success" });
  }
  const [tempKey, setTempKey] = useState(settings.anthropicApiKey ?? "");

  function saveKey() {
    settings.set({ anthropicApiKey: tempKey.trim() || null });
    showToast({ title: "API key saved", variant: "success" });
  }

  function exportMarkdown() {
    const markdown = progressToMarkdown({
      months: vocab.months,
      progress: wordsProgress,
      activity,
    });
    downloadBlob(
      new Blob([markdown], { type: "text/markdown" }),
      markdownFilename(),
    );
    showToast({ title: "Study log exported", variant: "success" });
  }

  async function exportAnki() {
    const months = Object.values(vocab.months);
    if (months.length === 0) {
      showToast({ title: "Nothing to export", variant: "error" });
      return;
    }
    setAnkiBusy(true);
    try {
      // Dynamic import: sql.js carries a WebAssembly SQLite build, and there
      // is no reason to ship it to someone who never exports.
      const { exportApkg } = await import("@/lib/anki-export");
      const result = await exportApkg({
        months,
        progress: wordsProgress,
        grouping: ankiGrouping,
        deckName: ankiDeckName.trim() || "Lexicon",
      });
      downloadBlob(result.blob, result.filename);
      showToast({
        title: `Exported ${result.noteCount} cards`,
        description:
          result.scheduledCount > 0
            ? `${result.deckCount} deck${result.deckCount === 1 ? "" : "s"} · ${result.scheduledCount} arrive already scheduled`
            : `${result.deckCount} deck${result.deckCount === 1 ? "" : "s"}`,
        variant: "success",
      });
    } catch (e) {
      console.error("Anki export failed", e);
      showToast({
        title: "Anki export failed",
        description: e instanceof Error ? e.message : "Check the console",
        variant: "error",
      });
    } finally {
      setAnkiBusy(false);
    }
  }

  function exportData() {
    const data = {
      progress: JSON.parse(localStorage.getItem("lexicon.progress.v1") ?? "{}"),
      vocab: JSON.parse(localStorage.getItem("lexicon.vocab.v1") ?? "{}"),
      settings: JSON.parse(localStorage.getItem("lexicon.settings.v1") ?? "{}"),
      exportedAt: new Date().toISOString(),
      version: "1.0",
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lexicon-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast({ title: "Backup downloaded", variant: "success" });
  }

  async function importData(file: File) {
    try {
      const data = JSON.parse(await file.text());
      if (data.progress)
        localStorage.setItem(
          "lexicon.progress.v1",
          JSON.stringify(data.progress),
        );
      if (data.vocab)
        localStorage.setItem("lexicon.vocab.v1", JSON.stringify(data.vocab));
      if (data.settings)
        localStorage.setItem(
          "lexicon.settings.v1",
          JSON.stringify(data.settings),
        );
      showToast({
        title: "Backup restored",
        description: "Reloading…",
        variant: "success",
      });
      setTimeout(() => window.location.reload(), 500);
    } catch (e) {
      showToast({
        title: "Import failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "error",
      });
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
          Settings
        </p>
        <h1 className="display-serif text-3xl font-semibold">Preferences.</h1>
      </div>

      <SettingSection
        title="Appearance"
        description="Choose how Lexicon looks."
      >
        <div className="flex gap-2">
          {(
            [
              { v: "light" as const, icon: Sun, label: "Light" },
              { v: "dark" as const, icon: Moon, label: "Dark" },
              { v: "system" as const, icon: Monitor, label: "System" },
            ]
          ).map((opt) => {
            const Icon = opt.icon;
            const active = settings.theme === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => {
                  settings.set({ theme: opt.v });
                  applyTheme(opt.v);
                }}
                className={cn(
                  "flex-1 flex flex-col items-center gap-1.5 rounded-md border p-3 text-xs transition-colors",
                  active
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="w-4 h-4" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </SettingSection>

      <SettingSection
        title="Sentence verification"
        description="Add your Anthropic API key for AI-powered feedback. Without one, sentences are checked with local heuristics."
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Anthropic API key
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showKey ? "text" : "password"}
                  value={tempKey}
                  onChange={(e) => setTempKey(e.target.value)}
                  placeholder="sk-ant-…"
                  className="pr-10 font-mono text-xs"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowKey((s) => !s)}
                >
                  {showKey ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <Button onClick={saveKey}>
                <Check className="w-4 h-4" />
                Save
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
              Stored locally in your browser. Never sent anywhere except
              directly to Anthropic during sentence checks.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={settings.preferApiVerification}
              onChange={(e) =>
                settings.set({ preferApiVerification: e.target.checked })
              }
              className="accent-accent"
            />
            Prefer AI verification when API key is set
          </label>
        </div>
      </SettingSection>

      <SettingSection
        title="Study reminders"
        description="An optional daily nudge. It only fires while Lexicon is open — a reminder that reaches you with the app closed needs desktop notification support, which is not wired up yet."
      >
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={settings.studyReminderEnabled}
              onChange={(e) => void toggleReminders(e.target.checked)}
              className="accent-accent"
              disabled={permission === "unsupported"}
            />
            Remind me daily
          </label>

          <div className="flex items-center gap-3">
            <label
              className="text-xs text-muted-foreground"
              htmlFor="reminder-time"
            >
              Time
            </label>
            <Input
              id="reminder-time"
              type="time"
              value={settings.studyReminderTime}
              onChange={(e) =>
                settings.set({ studyReminderTime: e.target.value })
              }
              className="w-32 tabular"
              disabled={!settings.studyReminderEnabled}
            />
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {permission === "unsupported"
              ? "This runtime has no Notification API, so reminders cannot be enabled."
              : permission === "denied"
                ? "Notifications are blocked for this site. Allow them in your browser settings first."
                : permission === "granted"
                  ? "Notifications allowed. The nudge fires once a day, at or after the time above."
                  : "You will be asked for notification permission when you switch this on."}
          </p>
        </div>
      </SettingSection>

      <SettingSection
        title="Anki export"
        description="Write every loaded month to an .apkg file. Review scheduling travels with the cards, so words you already know arrive in Anki already scheduled rather than reset to new."
      >
        <div className="space-y-3">
          <div>
            <label
              className="text-xs text-muted-foreground mb-1.5 block"
              htmlFor="anki-deck-name"
            >
              Deck name
            </label>
            <Input
              id="anki-deck-name"
              value={ankiDeckName}
              onChange={(e) => setAnkiDeckName(e.target.value)}
              placeholder="Lexicon"
              className="max-w-xs"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                { v: "month", label: "One deck per month" },
                { v: "single", label: "One deck for everything" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setAnkiGrouping(opt.v)}
                className={cn(
                  "rounded-md border px-3 py-2 text-xs transition-colors",
                  ankiGrouping === opt.v
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <Button variant="outline" onClick={exportAnki} disabled={ankiBusy}>
            {ankiBusy ? "Building deck…" : "Export .apkg"}
          </Button>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            The SQLite and zip libraries this needs are only downloaded the
            first time you export.
          </p>
        </div>
      </SettingSection>

      <SettingSection
        title="Backup"
        description="Export or restore your progress and vocabulary."
      >
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={exportData}>
            Export backup
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importData(f);
              }}
            />
            <Button variant="outline" asChild>
              <span className="cursor-pointer">Restore backup</span>
            </Button>
          </label>
          <Button variant="outline" onClick={exportMarkdown}>
            Export study log (Markdown)
          </Button>
        </div>
      </SettingSection>

      <SettingSection
        title="Danger zone"
        description="These actions cannot be undone."
      >
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              if (
                confirm(
                  "Reset all progress? Your loaded vocabulary is kept but every mastered mark and sentence is deleted.",
                )
              ) {
                resetProgress();
                showToast({ title: "Progress reset", variant: "success" });
              }
            }}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Reset progress
          </Button>
          <Button
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              if (
                confirm(
                  "Remove ALL loaded vocabulary and progress? Everything will be gone.",
                )
              ) {
                resetProgress();
                for (const key of Object.keys(vocab.months)) {
                  vocab.removeMonth(key);
                }
                showToast({ title: "All data cleared", variant: "success" });
              }
            }}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Clear everything
          </Button>
        </div>
      </SettingSection>

      <div className="text-center text-[11px] text-muted-foreground py-6">
        Lexicon v0.1.0
      </div>
    </div>
  );
}

function SettingSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Card>
        <CardContent className="p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {description}
            </p>
          </div>
          {children}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function applyTheme(theme: "light" | "dark" | "system") {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  if (theme === "system") {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    root.classList.add(prefersDark ? "dark" : "light");
  } else {
    root.classList.add(theme);
  }
}

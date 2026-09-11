import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  FolderOpen,
} from "lucide-react";

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
import { ThemePicker } from "@/components/ThemePicker";
import { WORD_ORDERS } from "@/lib/order";
import { playSound } from "@/lib/sound";
import { installedClis } from "@/lib/ai/client";
import { getSecret, keystoreKind, setSecret } from "@/lib/ai/keystore";
import { ProviderSettings } from "@/components/ProviderSettings";
import type { DetectedCli } from "@/lib/ai/providers/cli";
import { containsSecret, stripSecrets } from "@/lib/secrets";
import { pickWatchedFolder } from "@/hooks/useWatchedFolder";
import { isTauri } from "@/lib/utils";
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
  const [clis, setClis] = useState<DetectedCli[]>([]);

  // Presence on PATH only — nothing is executed to find this out.
  useEffect(() => {
    void installedClis().then(setClis);
  }, []);

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
  const [tempKey, setTempKey] = useState("");

  // The key lives in the OS keychain on desktop, so reading it is a round trip
  // and finding nothing is the ordinary case, not an error.
  useEffect(() => {
    void getSecret("anthropicApiKey").then((secret) => {
      if (secret && !secret.isEmpty) setTempKey(secret.reveal());
    });
  }, []);

  async function saveKey() {
    const value = tempKey.trim();
    try {
      await setSecret("anthropicApiKey", value);
    } catch (e) {
      showToast({
        title: "Could not save the key",
        description: e instanceof Error ? e.message : "The keychain refused",
        variant: "error",
      });
      return;
    }
    // Clear any copy left in the settings blob: that is the one that used to
    // reach exported backups.
    if (settings.anthropicApiKey) settings.set({ anthropicApiKey: null });
    showToast({
      title: value ? "API key saved" : "API key removed",
      variant: "success",
    });
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
    // Credentials never enter a backup. The persisted settings blob is
    // { state, version }, so the strip applies to `state`.
    const persistedSettings = JSON.parse(
      localStorage.getItem("lexicon.settings.v1") ?? "{}",
    ) as { state?: Record<string, unknown> };
    const safeSettings = persistedSettings.state
      ? { ...persistedSettings, state: stripSecrets(persistedSettings.state) }
      : persistedSettings;

    const data = {
      progress: JSON.parse(localStorage.getItem("lexicon.progress.v1") ?? "{}"),
      vocab: JSON.parse(localStorage.getItem("lexicon.vocab.v1") ?? "{}"),
      settings: safeSettings,
      exportedAt: new Date().toISOString(),
      version: "1.1",
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
    showToast({
      title: "Backup downloaded",
      description: "Your API key is not included.",
      variant: "success",
    });
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
      // Older backups (version 1.0) carried the API key. Drop it rather than
      // restoring a credential from a file that may have been shared, and say
      // so — silently dropping it leaves the user wondering why their provider
      // stopped working.
      let droppedSecret = false;
      if (data.settings) {
        const incoming = data.settings as { state?: Record<string, unknown> };
        if (incoming.state && containsSecret(incoming.state)) {
          droppedSecret = true;
          incoming.state = stripSecrets(incoming.state);
        }
        localStorage.setItem("lexicon.settings.v1", JSON.stringify(incoming));
      }
      showToast({
        title: "Backup restored",
        description: droppedSecret
          ? "Your API key was not restored — re-enter it in Settings."
          : "Reloading…",
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
        <ThemePicker
          value={settings.theme}
          onChange={(theme) => settings.set({ theme })}
        />
      </SettingSection>

      <SettingSection
        title="Word order"
        description="How a month's words are listed. Never changes what the scheduler shows you next, or the order of quiz questions."
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {WORD_ORDERS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={settings.wordOrder === opt.value}
              onClick={() => settings.set({ wordOrder: opt.value })}
              className={cn(
                "rounded-md border p-3 text-left transition-colors",
                settings.wordOrder === opt.value
                  ? "border-accent bg-accent/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="block text-xs font-medium">{opt.label}</span>
              <span className="block text-[10px] text-muted-foreground leading-tight mt-0.5">
                {opt.hint}
              </span>
            </button>
          ))}
        </div>
      </SettingSection>

      <SettingSection
        title="AI provider"
        description="Lexicon uses whichever AI costs you least — on-device first, then a local server or an installed tool, and only then a key you supplied."
      >
        <ProviderSettings />
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
              {keystoreKind() === "keychain"
                ? "Kept in your operating system's keychain, encrypted at rest — not in Lexicon's data file, and never in a backup you export."
                : "Kept in this browser's storage, which is not encrypted: anyone with access to this browser profile can read it. The desktop app uses your OS keychain instead."}{" "}
              It is sent nowhere except to Anthropic, during a sentence check.
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

      {clis.length > 0 && (
        <SettingSection
          title="Installed AI tools"
          description="These are already on this machine and signed in. Turning one on lets Lexicon use it to generate vocabulary — no API key needed. Lexicon never reads their credentials; it runs the tool and the tool authenticates itself."
        >
          <div className="space-y-3">
            {clis.map((cli) => {
              const enabled = settings.enabledAiTools.includes(cli.id);
              return (
                <div key={cli.id} className="space-y-1">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) =>
                        settings.set({
                          enabledAiTools: e.target.checked
                            ? [...settings.enabledAiTools, cli.id]
                            : settings.enabledAiTools.filter(
                                (id) => id !== cli.id,
                              ),
                        })
                      }
                      className="accent-accent"
                    />
                    Use {cli.label}
                  </label>
                  <p className="text-[11px] text-muted-foreground break-all pl-6">
                    {cli.path}
                  </p>
                </div>
              );
            })}
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Requests run through your own subscription or quota for that tool,
              and are subject to its terms.
            </p>
          </div>
        </SettingSection>
      )}

      <SettingSection
        title="Sound"
        description="A short click when a card flips, and a chime when a session ends. Off by default."
      >
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={settings.soundEnabled}
              onChange={(e) => {
                settings.set({ soundEnabled: e.target.checked });
                // Play it on enable so the choice is audible immediately.
                if (e.target.checked) playSound("correct", true);
              }}
              className="accent-accent"
            />
            Interface sounds
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => settings.set({ hasOnboarded: false })}
          >
            Replay the walkthrough
          </Button>
        </div>
      </SettingSection>

      {isTauri() && (
        <SettingSection
          title="Watched folder"
          description="Point Lexicon at a folder and any vocabulary file you drop into it loads straight away — no re-importing."
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  const folder = await pickWatchedFolder();
                  if (folder) {
                    settings.set({ watchedFolder: folder });
                    showToast({
                      title: "Watching folder",
                      description: folder,
                      variant: "success",
                    });
                  }
                }}
              >
                <FolderOpen className="w-4 h-4" />
                {settings.watchedFolder ? "Change folder" : "Choose folder"}
              </Button>
              {settings.watchedFolder && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    settings.set({ watchedFolder: null });
                    showToast({ title: "Stopped watching" });
                  }}
                >
                  Stop watching
                </Button>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed break-all">
              {settings.watchedFolder
                ? `Watching ${settings.watchedFolder} for .json, .csv and .apkg files.`
                : "No folder is being watched."}
            </p>
          </div>
        </SettingSection>
      )}

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



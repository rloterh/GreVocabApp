/**
 * Load vocabulary the moment it appears in a watched folder.
 *
 * The Rust side (`src-tauri/src/watcher.rs`) does the watching and emits
 * `vocab-file-changed`; this reads the file and puts it through the same
 * import path as every other entry point.
 *
 * Desktop only. In the browser this is inert — there is no way to watch a
 * folder without the user re-granting access, which is the thing the feature
 * exists to avoid.
 *
 * See ROADMAP.md, Phase 4.
 */

import { useEffect, useRef } from "react";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useVocabStore } from "@/store/useVocabStore";
import { useAppStore } from "@/store/useAppStore";
import {
  ACCEPTED_FILE,
  describeOutcome,
  importApkgFile,
  importText,
} from "@/lib/import";
import { canWatchFolder } from "@/lib/platform";

/** Event name, matching VOCAB_FILE_CHANGED in watcher.rs. */
const FILE_CHANGED = "vocab-file-changed";

interface FileChangedPayload {
  path: string;
  name: string;
}

export function useWatchedFolder(): void {
  const watchedFolder = useSettingsStore((s) => s.watchedFolder);
  const setSettings = useSettingsStore((s) => s.set);
  const loadMonth = useVocabStore((s) => s.loadMonth);
  const showToast = useAppStore((s) => s.showToast);

  // The handler needs current vocab without re-subscribing on every import.
  const monthsRef = useRef(useVocabStore.getState().months);
  useEffect(
    () => useVocabStore.subscribe((s) => (monthsRef.current = s.months)),
    [],
  );

  useEffect(() => {
    if (!canWatchFolder()) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const [{ listen }, { invoke }] = await Promise.all([
        import("@tauri-apps/api/event"),
        import("@tauri-apps/api/core"),
      ]);
      if (cancelled) return;

      if (!watchedFolder) {
        await invoke("stop_watching").catch(() => {});
        return;
      }

      try {
        await invoke<string>("start_watching", { folder: watchedFolder });
      } catch (e) {
        showToast({
          title: "Could not watch that folder",
          description: typeof e === "string" ? e : "It may have been moved.",
          variant: "error",
        });
        // Clear it rather than retrying a folder that no longer exists.
        setSettings({ watchedFolder: null });
        return;
      }

      unlisten = await listen<FileChangedPayload>(FILE_CHANGED, async (event) => {
        const { path, name } = event.payload;
        if (!ACCEPTED_FILE.test(name)) return;

        try {
          const fs = await import("@tauri-apps/plugin-fs");
          const outcome = name.toLowerCase().endsWith(".apkg")
            ? await importApkgFile(
                name,
                await fs.readFile(path),
                loadMonth,
                useVocabStore.getState().nextMonthKey(),
              )
            : await importText(name, await fs.readTextFile(path), loadMonth);

          for (const message of outcome.errors) console.warn(message);
          // Silence is right for a file that changed but produced nothing —
          // an editor touching a file should not raise a toast.
          if (outcome.loaded === 0 && outcome.failed === 0) return;
          showToast(describeOutcome(outcome));
        } catch (e) {
          console.warn(`watched folder: could not read ${name}`, e);
        }
      });
      if (cancelled) unlisten?.();
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [watchedFolder, loadMonth, showToast, setSettings]);
}

/**
 * Ask the user for a folder to watch. Resolves to the chosen path, or null if
 * they cancelled. Desktop only.
 */
export async function pickWatchedFolder(): Promise<string | null> {
  if (!canWatchFolder()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const chosen = await open({ directory: true, multiple: false });
  return typeof chosen === "string" ? chosen : null;
}

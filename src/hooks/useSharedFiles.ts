/**
 * Import files shared to Lexicon from another app's share sheet.
 *
 * A share reaches Lexicon in one of two ways: it starts the app, or it brings
 * the running app back to the front. So the inbox is drained on mount and
 * whenever the app is shown again (`onAppShown`, which on Android is the
 * activity's own resume signal — the WebView fires no visibilitychange).
 *
 * Android only (`canReceiveShares`). See ROADMAP.md, Phase 9.
 */

import { useEffect, useRef } from "react";
import { useVocabStore } from "@/store/useVocabStore";
import { useAppStore } from "@/store/useAppStore";
import { describeOutcome, importFiles } from "@/lib/import";
import { drainSharedFiles } from "@/lib/share-inbox";
import { canReceiveShares } from "@/lib/platform";
import { onAppShown } from "@/lib/app-lifecycle";

export function useSharedFiles(): void {
  const loadMonth = useVocabStore((s) => s.loadMonth);
  const showToast = useAppStore((s) => s.showToast);
  // Mount and a visibility change can arrive together; one drain at a time.
  const draining = useRef(false);

  useEffect(() => {
    if (!canReceiveShares()) return;

    async function drain() {
      if (draining.current) return;
      draining.current = true;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const files = await drainSharedFiles(invoke);
        if (files.length === 0) return;
        const outcome = await importFiles(files, loadMonth, {
          apkgMonth: () => useVocabStore.getState().nextMonthKey(),
        });
        for (const message of outcome.errors) console.warn(message);
        if (outcome.loaded === 0 && outcome.failed === 0) {
          // Something was shared, so say why nothing happened.
          showToast({
            title: "Nothing imported",
            description: "Lexicon reads .json, .csv and Anki .apkg files.",
            variant: "error",
          });
          return;
        }
        showToast(describeOutcome(outcome));
      } catch (e) {
        console.warn("shared files: could not drain the inbox", e);
      } finally {
        draining.current = false;
      }
    }

    void drain();
    return onAppShown(() => void drain());
  }, [loadMonth, showToast]);
}

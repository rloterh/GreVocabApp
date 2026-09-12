import { useRef, useState } from "react";
import { FolderOpen, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVocabStore } from "@/store/useVocabStore";
import { firstFreeMonthKey } from "@/lib/vocabulary";
import { useAppStore } from "@/store/useAppStore";
import { isTauri } from "@/lib/utils";
import {
  ACCEPTED_FILE,
  describeOutcome,
  importFiles,
  importText,
  type ImportOutcome,
} from "@/lib/import";

/** File System Access API type shims */
declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

const EMPTY: ImportOutcome = { loaded: 0, failed: 0, errors: [] };

export function JsonImporter() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const loadMonth = useVocabStore((s) => s.loadMonth);
  const months = useVocabStore((s) => s.months);
  // Anki decks carry no month; land them somewhere empty rather than on top
  // of vocabulary that is already loaded.
  const importOptions = { apkgMonth: () => firstFreeMonthKey(months) };
  const showToast = useAppStore((s) => s.showToast);

  /** Report an outcome the same way regardless of which path produced it. */
  function report(outcome: ImportOutcome) {
    for (const message of outcome.errors) console.warn(message);
    showToast(describeOutcome(outcome));
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      report(await importFiles(Array.from(files), loadMonth, importOptions));
    } finally {
      setBusy(false);
      // Let the same file be picked again after a failed import.
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function pickFolder() {
    // Tauri path — use dialog + fs
    if (isTauri()) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const { readDir, readTextFile } = await import(
          "@tauri-apps/plugin-fs"
        );
        const dir = await open({ directory: true, multiple: false });
        if (!dir || typeof dir !== "string") return;
        setBusy(true);
        const entries = await readDir(dir);
        let outcome = EMPTY;
        for (const entry of entries) {
          if (!entry.isFile || !ACCEPTED_FILE.test(entry.name)) continue;
          const text = await readTextFile(`${dir}/${entry.name}`);
          const one = await importText(entry.name, text, loadMonth);
          outcome = {
            loaded: outcome.loaded + one.loaded,
            failed: outcome.failed + one.failed,
            errors: [...outcome.errors, ...one.errors],
          };
        }
        setBusy(false);
        report(outcome);
        return;
      } catch (e) {
        setBusy(false);
        console.error("Tauri folder pick failed", e);
      }
    }

    // Browser: File System Access API
    if (typeof window.showDirectoryPicker !== "function") {
      showToast({
        title: "Folder picker not supported",
        description:
          "Your browser lacks the File System Access API. Use file upload instead.",
        variant: "error",
      });
      return;
    }
    try {
      const dir = await window.showDirectoryPicker();
      setBusy(true);
      const files: File[] = [];
      // @ts-expect-error — values() exists on FileSystemDirectoryHandle
      for await (const entry of dir.values()) {
        if (entry.kind !== "file" || !ACCEPTED_FILE.test(entry.name)) continue;
        files.push(await (entry as FileSystemFileHandle).getFile());
      }
      report(await importFiles(files, loadMonth, importOptions));
      setBusy(false);
    } catch {
      setBusy(false);
      // User cancelled
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        aria-label="Choose a vocabulary file"
        accept="application/json,.json,text/csv,.csv,.apkg"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
      >
        <Upload className="w-3.5 h-3.5" />
        Import file
      </Button>
      <Button size="sm" variant="outline" onClick={pickFolder} disabled={busy}>
        <FolderOpen className="w-3.5 h-3.5" />
        Pick folder
      </Button>
    </div>
  );
}

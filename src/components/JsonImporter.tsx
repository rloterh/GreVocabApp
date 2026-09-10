import { useRef, useState } from "react";
import { FolderOpen, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVocabStore } from "@/store/useVocabStore";
import { useAppStore } from "@/store/useAppStore";
import { isTauri } from "@/lib/utils";
import { csvToMonthObjects, monthFromFilename } from "@/lib/csv";

/** File System Access API type shims */
declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

/** Files this importer will attempt. */
const ACCEPTED = /\.(json|csv)$/i;

export function JsonImporter() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const loadMonth = useVocabStore((s) => s.loadMonth);
  const showToast = useAppStore((s) => s.showToast);

  /**
   * Turn one file's text into loaded months.
   *
   * CSV is converted to month-shaped objects and then handed to the same
   * `loadMonth` validation as JSON, so there is only one definition of a valid
   * month. A CSV may span several months, hence the count.
   */
  function importText(name: string, text: string): { loaded: number; failed: number } {
    let loaded = 0;
    let failed = 0;
    try {
      const objects = name.toLowerCase().endsWith(".csv")
        ? csvToMonthObjects(text, {
            fallbackMonth: monthFromFilename(name) ?? undefined,
          })
        : [JSON.parse(text)];
      for (const obj of objects) {
        const result = loadMonth(obj);
        if (result.ok) loaded++;
        else {
          failed++;
          console.warn(`${name}: ${result.error}`);
        }
      }
    } catch (e) {
      failed++;
      console.warn(`${name}: ${e instanceof Error ? e.message : "parse error"}`, e);
    }
    return { loaded, failed };
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    let loaded = 0;
    let failed = 0;
    for (const f of Array.from(files)) {
      if (!ACCEPTED.test(f.name)) continue;
      const r = importText(f.name, await f.text());
      loaded += r.loaded;
      failed += r.failed;
    }
    setBusy(false);
    if (loaded > 0) {
      showToast({
        title: `Loaded ${loaded} month${loaded === 1 ? "" : "s"}`,
        description:
          failed > 0
            ? `${failed} file${failed === 1 ? "" : "s"} failed — check console`
            : undefined,
        variant: "success",
      });
    } else if (failed > 0) {
      showToast({
        title: "Import failed",
        description: `${failed} file${failed === 1 ? "" : "s"} could not be parsed`,
        variant: "error",
      });
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
        let loaded = 0;
        let failed = 0;
        for (const entry of entries) {
          if (!entry.isFile || !ACCEPTED.test(entry.name)) continue;
          try {
            const text = await readTextFile(`${dir}/${entry.name}`);
            const r = importText(entry.name, text);
            loaded += r.loaded;
            failed += r.failed;
          } catch {
            failed++;
          }
        }
        setBusy(false);
        showToast({
          title: `Loaded ${loaded} month${loaded === 1 ? "" : "s"}`,
          description:
            failed > 0
              ? `${failed} file${failed === 1 ? "" : "s"} failed — check console`
              : undefined,
          variant: "success",
        });
        return;
      } catch (e) {
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
      let loaded = 0;
      let failed = 0;
      // @ts-expect-error — values() exists on FileSystemDirectoryHandle
      for await (const entry of dir.values()) {
        if (entry.kind !== "file" || !ACCEPTED.test(entry.name)) continue;
        const file = await (entry as FileSystemFileHandle).getFile();
        try {
          const r = importText(entry.name, await file.text());
          loaded += r.loaded;
          failed += r.failed;
        } catch {
          failed++;
        }
      }
      setBusy(false);
      showToast({
        title: `Loaded ${loaded} month${loaded === 1 ? "" : "s"}`,
        description:
          failed > 0
            ? `${failed} file${failed === 1 ? "" : "s"} failed — check console`
            : undefined,
        variant: "success",
      });
    } catch {
      // User cancelled
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json,text/csv,.csv"
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
        Import JSON / CSV
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={pickFolder}
        disabled={busy}
      >
        <FolderOpen className="w-3.5 h-3.5" />
        Pick folder
      </Button>
    </div>
  );
}

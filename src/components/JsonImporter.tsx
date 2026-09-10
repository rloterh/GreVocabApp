import { useRef, useState } from "react";
import { FolderOpen, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVocabStore } from "@/store/useVocabStore";
import { useAppStore } from "@/store/useAppStore";
import { isTauri } from "@/lib/utils";

/** File System Access API type shims */
declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

export function JsonImporter() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const loadMonth = useVocabStore((s) => s.loadMonth);
  const showToast = useAppStore((s) => s.showToast);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    let loaded = 0;
    let failed = 0;
    for (const f of Array.from(files)) {
      if (!f.name.endsWith(".json")) continue;
      try {
        const text = await f.text();
        const raw = JSON.parse(text);
        const result = loadMonth(raw);
        if (result.ok) loaded++;
        else {
          failed++;
          console.warn(`${f.name}: ${result.error}`);
        }
      } catch (e) {
        failed++;
        console.warn(`${f.name}: parse error`, e);
      }
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
          if (!entry.isFile || !entry.name.endsWith(".json")) continue;
          try {
            const text = await readTextFile(`${dir}/${entry.name}`);
            const result = loadMonth(JSON.parse(text));
            if (result.ok) loaded++;
            else failed++;
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
        if (entry.kind !== "file" || !entry.name.endsWith(".json")) continue;
        const file = await (entry as FileSystemFileHandle).getFile();
        try {
          const raw = JSON.parse(await file.text());
          const result = loadMonth(raw);
          if (result.ok) loaded++;
          else failed++;
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
        accept="application/json,.json"
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
        Import JSON
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

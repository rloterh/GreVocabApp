/**
 * Drop a .json, .csv or Anki .apkg anywhere in the app to import it.
 *
 * Mounted once at the root. It uses the same `importFiles` path as the import
 * button, so anything one accepts the other accepts.
 *
 * See ROADMAP.md, Phase 3.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileDown } from "lucide-react";
import { useVocabStore } from "@/store/useVocabStore";
import { firstFreeMonthKey } from "@/lib/vocabulary";
import { useAppStore } from "@/store/useAppStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { describeOutcome, importFiles } from "@/lib/import";

/** Is this drag carrying files, as opposed to selected text or a link? */
function carriesFiles(e: DragEvent): boolean {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes("Files");
}

export function DropOverlay() {
  const loadMonth = useVocabStore((s) => s.loadMonth);
  const months = useVocabStore((s) => s.months);
  const showToast = useAppStore((s) => s.showToast);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);

  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  // dragenter/dragleave fire for every element the pointer crosses, so the
  // overlay has to be reference-counted or it flickers over child elements.
  const depth = useRef(0);

  const reset = useCallback(() => {
    depth.current = 0;
    setDragging(false);
  }, []);

  useEffect(() => {
    function onEnter(e: DragEvent) {
      if (!carriesFiles(e)) return;
      depth.current++;
      setDragging(true);
    }
    function onOver(e: DragEvent) {
      if (!carriesFiles(e)) return;
      // Without this the browser navigates to the file instead of dropping it.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }
    function onLeave(e: DragEvent) {
      if (!carriesFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    }
    async function onDrop(e: DragEvent) {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      reset();

      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;

      setBusy(true);
      try {
        const outcome = await importFiles(files, loadMonth, {
          apkgMonth: () => firstFreeMonthKey(months),
        });
        for (const message of outcome.errors) console.warn(message);
        if (outcome.loaded === 0 && outcome.failed === 0) {
          showToast({
            title: "Nothing imported",
            description: "Drop a .json, .csv or .apkg file.",
            variant: "error",
          });
          return;
        }
        showToast(describeOutcome(outcome));
      } finally {
        setBusy(false);
      }
    }

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    // A drag that ends outside the window never fires dragleave.
    window.addEventListener("dragend", reset);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", reset);
    };
  }, [loadMonth, months, showToast, reset]);

  const visible = dragging || busy;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="drop-overlay"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          // Pointer events off so the overlay cannot swallow the drop itself.
          className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center bg-background/80 backdrop-blur-sm"
          aria-live="polite"
        >
          <motion.div
            initial={reduceMotion ? false : { scale: 0.97 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-xl border-2 border-dashed border-accent/60 bg-card/90 px-10 py-8 text-center shadow-2xl"
          >
            <FileDown className="w-8 h-8 text-accent mx-auto mb-3" />
            <p className="display-serif text-xl font-semibold">
              {busy ? "Importing…" : "Drop to import"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {busy ? "Reading your files" : ".json, .csv or .apkg"}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Who made this, and what it is.
 *
 * Small on purpose. An about box that lists build metadata nobody asked for is
 * clutter; this names the designer, the version, and where the source is.
 */

import { useState } from "react";
import { Info, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Injected by Vite from package.json at build time. */
const VERSION = __APP_VERSION__;

export function AboutDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        aria-label="About Lexicon"
      >
        <Info className="w-3.5 h-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="sr-only">About Lexicon</DialogTitle>
          </DialogHeader>

          <div className="text-center space-y-4 py-2">
            <div className="mx-auto w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>

            <div>
              <p className="display-serif text-2xl font-semibold">Lexicon</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Daily vocabulary
              </p>
            </div>

            <p className="text-sm">
              Designed by <span className="font-medium">Robert Loterh</span>
              <span className="text-muted-foreground"> · 2026</span>
            </p>

            <div className="text-[11px] text-muted-foreground space-y-1">
              <p className="tabular">Version {VERSION}</p>
              <p>MIT licensed · your data stays on this device</p>
              <p>
                <a
                  href="https://github.com/rloterh/GreVocabApp"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  github.com/rloterh/GreVocabApp
                </a>
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

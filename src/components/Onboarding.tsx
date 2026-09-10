/**
 * First-run walkthrough.
 *
 * Four screens, skippable at every step, shown once. It explains the things
 * that are not discoverable by clicking around — that a month is the unit of
 * everything, that ratings drive a scheduler, and that `?` exists.
 *
 * See ROADMAP.md, Phase 5.
 */

import { useState } from "react";
import { BookOpen, CalendarClock, Keyboard, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/store/useSettingsStore";
import { cn } from "@/lib/utils";

interface Step {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    icon: BookOpen,
    title: "Three words a day",
    body: "Vocabulary is organised by month, three words per day. Two months are already loaded, so there is something to do right now — the Dashboard shows today's words.",
  },
  {
    icon: CalendarClock,
    title: "Your rating picks the next review",
    body: "In Flashcards, how you rate a card decides when you see it again. Again brings it back tomorrow; Easy pushes it weeks out. Rate honestly — inflating it only means meeting the word after you have forgotten it.",
  },
  {
    icon: Sparkles,
    title: "Bring your own words",
    body: "Drop a JSON, CSV or Anki .apkg file anywhere in the app to import it. You can also generate a month with Claude, or paste a deck code someone shared.",
  },
  {
    icon: Keyboard,
    title: "Press ? at any time",
    body: "That opens the keyboard shortcuts. / jumps to search, and g then a letter moves between pages.",
  },
];

export function Onboarding() {
  const hasOnboarded = useSettingsStore((s) => s.hasOnboarded);
  const setSettings = useSettingsStore((s) => s.set);
  const [step, setStep] = useState(0);

  const finish = () => setSettings({ hasOnboarded: true });

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog
      open={!hasOnboarded}
      // Dismissing any other way still counts as done — nobody wants this twice.
      onOpenChange={(open) => !open && finish()}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="rounded-md bg-accent/15 p-2">
              <Icon className="w-4 h-4 text-accent" />
            </span>
            <DialogTitle className="display-serif text-xl">
              {current.title}
            </DialogTitle>
          </div>
          <DialogDescription className="leading-relaxed">
            {current.body}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-4 pt-1">
          <div className="flex gap-1.5" aria-hidden>
            {STEPS.map((s, i) => (
              <span
                key={s.title}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === step ? "w-5 bg-accent" : "w-1.5 bg-muted-foreground/30",
                )}
              />
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={finish}>
              {isLast ? "Close" : "Skip"}
            </Button>
            {!isLast && (
              <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                Next
              </Button>
            )}
            {isLast && (
              <Button size="sm" onClick={finish}>
                Start studying
              </Button>
            )}
          </div>
        </div>

        <p className="sr-only" aria-live="polite">
          Step {step + 1} of {STEPS.length}
        </p>
      </DialogContent>
    </Dialog>
  );
}

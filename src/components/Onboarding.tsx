/**
 * First-run walkthrough.
 *
 * Five screens, skippable at every step, shown once. The first is the only one
 * that asks anything — when to start, and in what order — and it is first
 * because it decides what every later screen is describing. The rest explain
 * the things that are not discoverable by clicking around: that a month is the
 * unit of everything, that ratings drive a scheduler, and that `?` exists.
 *
 * Skipping accepts the defaults, which are the answers most people want:
 * start today, months in the order they were taught.
 *
 * See ROADMAP.md Phase 5 and docs/SCHEDULE.md.
 */

import { useRef, useState } from "react";
import { BookOpen, CalendarClock, CalendarRange, Keyboard, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/store/useSettingsStore";
import {
  ScheduleSetup,
  useApplySchedule,
  type ScheduleChoice,
} from "@/components/ScheduleSetup";
import { calendarMonthOfDate } from "@/lib/schedule";
import { cn } from "@/lib/utils";

interface Step {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  /** Rendered under the body. Only the first step has one. */
  content?: "schedule";
}

const STEPS: Step[] = [
  {
    icon: CalendarRange,
    title: "When do you start?",
    body: "Three years of vocabulary, laid out from whichever month you choose. Both answers below are already the ones most people want — skip if they suit.",
    content: "schedule",
  },
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
  const applySchedule = useApplySchedule();
  const [step, setStep] = useState(0);

  // A ref, not state: this changes on every keystroke in the month picker and
  // nothing in this component needs to re-render when it does.
  const choice = useRef<ScheduleChoice>({
    startMonth: calendarMonthOfDate(new Date()),
    order: "taught",
    valid: true,
  });

  // Writing the schedule on the way out covers every exit — Next, Skip, Escape,
  // and clicking away. A user who dismisses this still starts today, in the
  // order the corpus teaches, which is what the screen already had selected.
  const finish = () => {
    applySchedule(choice.current);
    setSettings({ hasOnboarded: true });
  };

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

        {current.content === "schedule" && (
          <ScheduleSetup onChange={(next) => (choice.current = next)} />
        )}

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
              <Button
                size="sm"
                onClick={() => {
                  if (current.content === "schedule") applySchedule(choice.current);
                  setStep((s) => s + 1);
                }}
              >
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

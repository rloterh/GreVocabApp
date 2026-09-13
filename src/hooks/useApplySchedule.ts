import { TRACKS } from "@/lib/track";
import { useVocabStore } from "@/store/useVocabStore";
import type { ScheduleChoice } from "@/components/ScheduleSetup";

/**
 * Write a schedule choice to every track.
 *
 * Every track, not only the open one: this is the single moment the user says
 * when they are beginning, and a second track quietly starting "today" months
 * later would be a surprise nobody asked for. Settings moves them apart
 * afterwards.
 *
 * Here rather than beside `ScheduleSetup` because a module that exports both
 * components and other things loses Fast Refresh for the whole file — editing
 * the component would remount it instead of patching it, losing the half-made
 * choice the user was looking at.
 */
export function useApplySchedule() {
  const setStartMonth = useVocabStore((s) => s.setStartMonth);
  const shuffleMonths = useVocabStore((s) => s.shuffleMonths);
  const resetMonthOrder = useVocabStore((s) => s.resetMonthOrder);

  return (choice: ScheduleChoice) => {
    if (!choice.valid) return;
    for (const track of TRACKS) {
      setStartMonth(track, choice.startMonth);
      if (choice.order === "shuffled") shuffleMonths(track, choice.startMonth);
      else resetMonthOrder(track);
    }
  };
}

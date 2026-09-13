/**
 * One word, on the dashboard, before the user has decided to study.
 *
 * Deliberately not a fifth stat card. It shows the word, what it means and why
 * it was chosen, and the word itself is a button — the whole point is that
 * reading it might turn into doing something, and a card you cannot act on is
 * decoration.
 *
 * The card is **not** one big button. The obvious way to build this puts a
 * speaker control inside the clickable card, which nests one interactive
 * element inside another: invalid, and a screen reader announces a button
 * containing a button. Two real siblings instead, and the card body is a plain
 * container.
 *
 * See `src/lib/word-of-the-day.ts` for how the word is picked.
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Volume2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useVocabStore } from "@/store/useVocabStore";
import { useProgressStore } from "@/store/useProgressStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { keyOf } from "@/lib/track";
import type { WordDetailTarget } from "@/components/WordDetail";
import { wordOfTheDay, wordOfTheDayNote } from "@/lib/word-of-the-day";

export function WordOfTheDay({
  onOpen,
}: {
  onOpen: (word: WordDetailTarget) => void;
}) {
  const getAllMonths = useVocabStore((s) => s.getAllMonths);
  const months = useVocabStore((s) => s.months);
  const activeTrack = useVocabStore((s) => s.activeTrack);
  const progress = useProgressStore((s) => s.words);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);

  // Carries the month and day with it, because the detail modal needs to be
  // able to send the user to the day this word actually lives on.
  const picked = useMemo(() => {
    const located = getAllMonths().flatMap((month) =>
      month.days.flatMap((day) =>
        day.words.map((word) => ({
          ...word,
          monthKey: keyOf(month),
          monthName: month.title,
          day: day.day,
        })),
      ),
    );
    const chosen = wordOfTheDay(located, progress, new Date(), activeTrack);
    if (!chosen) return null;
    return {
      target: located.find((w) => w.id === chosen.word.id)!,
      reason: chosen.reason,
    };
  }, [getAllMonths, months, progress, activeTrack]);

  if (!picked) return null;
  const { target: word, reason } = picked;

  function speak() {
    if (!("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(word.word);
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="mt-8"
    >
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Word of the day
            </p>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              {word.partOfSpeech}
            </Badge>
          </div>

          <div className="flex items-baseline gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => onOpen(word)}
              className="display-serif text-3xl font-semibold text-left rounded-md hover:text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {word.word}
            </button>
            {"speechSynthesis" in window && (
              <button
                type="button"
                aria-label={`Pronounce ${word.word}`}
                onClick={speak}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            )}
          </div>

          <p className="mt-1.5 text-sm leading-relaxed">{word.definition}</p>
          <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
            {wordOfTheDayNote(reason)}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

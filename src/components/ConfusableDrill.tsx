/**
 * The confusable-pairs drill.
 *
 * Beside the quiz rather than inside it. Its score is not written to quiz
 * history and does not touch mastery: a two-option question has a coin-flip
 * baseline, and folding that into an accuracy figure the user reads as
 * knowledge would quietly inflate it. What this is for is noticing the
 * distinction, and the note after each answer is the actual payload.
 *
 * See `src/lib/confusables.ts`.
 */

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, RotateCcw, Shuffle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useVocabStore } from "@/store/useVocabStore";
import { useAllMonths } from "@/store/useAllMonths";
import { useSettingsStore } from "@/store/useSettingsStore";
import { allWordsInMonth } from "@/lib/vocabulary";
import { buildConfusableDrill } from "@/lib/confusables";
import { playSound } from "@/lib/sound";
import { dayKey } from "@/lib/order";
import { cn } from "@/lib/utils";

export function ConfusableDrill() {
  const allMonths = useAllMonths();
  const activeTrack = useVocabStore((s) => s.activeTrack);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);

  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);

  const questions = useMemo(
    () =>
      buildConfusableDrill(
        allMonths.flatMap(allWordsInMonth),
        `${activeTrack}:${dayKey(new Date())}:${round}`,
      ),
    [allMonths, activeTrack, round],
  );

  if (questions.length === 0) {
    return (
      <Card>
        <CardContent className="p-5">
          <p className="text-sm font-medium">Confusable pairs</p>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            Nothing to drill yet. A pair only counts once you have{" "}
            <strong>both</strong> of its words — choosing between a word you
            have studied and one you have never seen is a trick, not a test.
            Load more months and they will appear.
          </p>
        </CardContent>
      </Card>
    );
  }

  const question = questions[Math.min(index, questions.length - 1)];
  const answered = chosen !== null;
  const done = index >= questions.length;

  function choose(option: string) {
    if (answered) return;
    setChosen(option);
    const right = option === question.answer;
    if (right) setCorrect((n) => n + 1);
    playSound(right ? "correct" : "wrong");
  }

  function next() {
    setChosen(null);
    setIndex((i) => i + 1);
  }

  function restart() {
    setRound((r) => r + 1);
    setIndex(0);
    setChosen(null);
    setCorrect(0);
  }

  if (done) {
    return (
      <Card>
        <CardContent className="p-5 text-center">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Confusable pairs
          </p>
          <p className="display-serif text-3xl font-semibold mt-2 tabular">
            {correct} / {questions.length}
          </p>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Not counted towards quiz accuracy — two options is a coin flip half
            the time, and that is not what your accuracy should mean.
          </p>
          <Button size="sm" variant="outline" className="mt-4" onClick={restart}>
            <Shuffle className="w-3.5 h-3.5" />
            Another round
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Confusable pairs
          </p>
          <p className="text-xs text-muted-foreground tabular">
            {index + 1} of {questions.length}
          </p>
        </div>

        <p className="text-base leading-relaxed">{question.sentence}</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {question.options.map((option) => {
            const isAnswer = option === question.answer;
            const isChosen = option === chosen;
            return (
              <button
                key={option}
                type="button"
                onClick={() => choose(option)}
                disabled={answered}
                aria-label={`${option}${answered ? (isAnswer ? " — correct" : isChosen ? " — your answer, wrong" : "") : ""}`}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  !answered && "hover:border-border hover:bg-secondary/50",
                  answered && isAnswer && "border-success/60 bg-success/10",
                  answered && isChosen && !isAnswer && "border-destructive/60 bg-destructive/10",
                  answered && !isAnswer && !isChosen && "opacity-50",
                  !answered && "border-border/60",
                )}
              >
                <span>{option}</span>
                {answered && isAnswer && <Check className="w-4 h-4 text-success" />}
                {answered && isChosen && !isAnswer && (
                  <X className="w-4 h-4 text-destructive" />
                )}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {answered && (
            <motion.div
              key={question.answer}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="mt-4"
              role="status"
            >
              {/* The note is the point of the exercise. Getting it right by
                  luck and reading this is still a win; getting it right and
                  not reading it is not. */}
              <p className="rounded-md border border-border/60 bg-secondary/30 p-3 text-xs leading-relaxed">
                {question.pair.note}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" onClick={next}>
                  {index + 1 === questions.length ? "Finish" : "Next"}
                </Button>
                <Button size="sm" variant="ghost" onClick={restart}>
                  <RotateCcw className="w-3.5 h-3.5" />
                  Start over
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

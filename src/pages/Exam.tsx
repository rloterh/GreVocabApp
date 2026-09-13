/**
 * The 100-question exam.
 *
 * Three things this screen owes the user:
 *
 * 1. **It never loses their work.** Every answer is persisted before the next
 *    question renders. Closing the app mid-exam and coming back must land on
 *    the same question.
 * 2. **It does not show a running score.** Knowing how you are doing changes
 *    how you answer the next one, which makes the result measure something
 *    other than vocabulary. Break screens show progress only.
 * 3. **Wrong answers are studied, not just counted.** Every miss feeds the
 *    scheduler as an "again" would — an exam is a study session.
 *
 * See docs/QUIZ-AND-EXAMS.md.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, GraduationCap, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { useVocabStore } from "@/store/useVocabStore";
import { useProgressStore } from "@/store/useProgressStore";
import { useAppStore } from "@/store/useAppStore";
import { allWordsInMonth } from "@/lib/vocabulary";
import { buildQuestions, byNeed } from "@/lib/quiz-build";
import {
  answerQuestion,
  atSectionBreak,
  createExam,
  currentQuestion,
  DEFAULT_EXAM_CONFIG,
  examProgress,
  isResumable,
  missedWordIds,
  scoreExam,
  type ExamSession,
} from "@/lib/exam";
import { cn } from "@/lib/utils";
import { keyOf } from "@/lib/track";

export function ExamPage() {
  const months = useVocabStore((s) => s.months);
  const getAllMonths = useVocabStore((s) => s.getAllMonths);
  const wordsProgress = useProgressStore((s) => s.words);
  const activeExam = useProgressStore((s) => s.activeExam);
  const saveExam = useProgressStore((s) => s.saveExam);
  const finishExam = useProgressStore((s) => s.finishExam);
  const abandonExam = useProgressStore((s) => s.abandonExam);
  const applyStudyRating = useProgressStore((s) => s.applyStudyRating);
  const recordQuizAnswer = useProgressStore((s) => s.recordQuizAnswer);
  const showToast = useAppStore((s) => s.showToast);

  const [chosen, setChosen] = useState<string | null>(null);
  const askedAt = useRef<number>(Date.now());

  // The open track only. Pooling both would put SAT words in a GRE exam and
  // quietly change what the score means. See docs/adr/0011-tracks.md.
  const allWords = useMemo(
    () => getAllMonths().flatMap((m) => allWordsInMonth(m)),
    [getAllMonths, months],
  );
  const monthOf = useMemo(() => {
    const map: Record<string, string> = {};
    for (const month of getAllMonths()) {
      for (const word of allWordsInMonth(month)) map[word.id] = keyOf(month);
    }
    return map;
  }, [getAllMonths, months]);

  // Only resume something structurally sound: storage holds whatever an older
  // version wrote, and the failure mode for trusting it is a crash on launch.
  const session = isResumable(activeExam) ? activeExam : null;

  const start = useCallback(() => {
    // Hardest first, so a hundred questions are the hundred worth asking.
    const ordered = byNeed(allWords, wordsProgress);
    const questions = buildQuestions(
      ordered.slice(0, DEFAULT_EXAM_CONFIG.sections * DEFAULT_EXAM_CONFIG.perSection),
      { pool: allWords, progress: wordsProgress, monthOf, mode: "mixed" },
    );

    if (questions.length < DEFAULT_EXAM_CONFIG.perSection) {
      showToast({
        title: "Not enough vocabulary yet",
        description: `An exam needs at least ${DEFAULT_EXAM_CONFIG.perSection} words with distinct definitions.`,
        variant: "error",
      });
      return;
    }

    saveExam(createExam(questions, DEFAULT_EXAM_CONFIG));
    setChosen(null);
    askedAt.current = Date.now();
  }, [allWords, wordsProgress, monthOf, saveExam, showToast]);

  const answer = useCallback(
    (option: string) => {
      if (!session || chosen) return;
      setChosen(option);

      const question = currentQuestion(session);
      const next = answerQuestion(session, option, Date.now() - askedAt.current);

      if (question) {
        recordQuizAnswer(
          question.wordId,
          monthOf[question.wordId] ?? "",
          option === question.correct,
        );
        if (option !== question.correct) {
          // An exam is a study session: a missed word comes back sooner, the
          // same as an "Again" on a flashcard.
          applyStudyRating(
            question.wordId,
            monthOf[question.wordId] ?? "",
            "again",
          );
        }
      }

      // Persisted before the next question renders, every time.
      if (next.finishedAt) finishExam(next);
      else saveExam(next);

      window.setTimeout(() => {
        setChosen(null);
        askedAt.current = Date.now();
      }, 450);
    },
    [session, chosen, monthOf, recordQuizAnswer, applyStudyRating, saveExam, finishExam],
  );

  // The full session, kept separately from the compact history so the
  // per-question review has the text it needs.
  const finished = useProgressStore((s) => s.lastExam);

  if (!session) {
    return (
      <div className="w-full max-w-2xl mx-auto py-10">
        <Header />
        {finished && !finished.finishedAt ? null : finished ? (
          <Results session={finished} onRestart={start} />
        ) : (
          <EmptyState
            icon={GraduationCap}
            title="A hundred questions, five sections"
            description="Drawn from the words you find hardest. It saves as you go, so you can stop and come back."
            action={<Button onClick={start}>Start the exam</Button>}
          />
        )}
      </div>
    );
  }

  const progress = examProgress(session);
  const section = session.sections[session.currentSection];

  if (atSectionBreak(session) && session.currentSection > 0) {
    return (
      <div className="w-full max-w-2xl mx-auto py-10">
        <Header />
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Break
            </p>
            <p className="display-serif text-2xl font-semibold">
              {section.title}
            </p>
            {/* Progress, never a score: knowing how you are doing changes how
                you answer what is left. */}
            <p className="text-sm text-muted-foreground tabular">
              {progress.answered} of {progress.total} answered
            </p>
            <Button onClick={() => answer("")}>Begin {section.title}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const question = currentQuestion(session);
  if (!question) return null;

  return (
    <div className="w-full max-w-2xl mx-auto py-10">
      <Header />

      <div className="flex items-center justify-between mb-4 text-xs text-muted-foreground">
        <span>{section.title}</span>
        <span className="tabular">
          {progress.answered + 1} / {progress.total}
        </span>
      </div>
      <div className="h-1 bg-secondary rounded-full overflow-hidden mb-6">
        <motion.div
          className="h-full bg-accent"
          animate={{ width: `${(progress.answered / progress.total) * 100}%` }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      <Card className="mb-4">
        <CardContent className="p-6">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
            {question.mode === "word-to-def" ? "What does this mean?" : "Which word is this?"}
          </p>
          <p
            className={cn(
              question.mode === "word-to-def"
                ? "display-serif text-3xl font-semibold"
                : "text-lg leading-relaxed",
            )}
          >
            {question.prompt}
          </p>
        </CardContent>
      </Card>

      <div role="radiogroup" aria-label="Answer" className="space-y-2">
        {question.options.map((option, i) => {
          const picked = chosen === option;
          const reveal = chosen !== null;
          const right = option === question.correct;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={picked}
              disabled={reveal}
              onClick={() => answer(option)}
              className={cn(
                "w-full flex items-center gap-3 rounded-lg border p-4 text-left text-sm transition-colors",
                reveal && right && "border-success bg-success/10",
                reveal && picked && !right && "border-destructive bg-destructive/10",
                !reveal && "border-border hover:border-accent/60",
              )}
            >
              <span className="text-[10px] text-muted-foreground tabular w-4 shrink-0">
                {i + 1}
              </span>
              <span className="flex-1">{option}</span>
              {reveal && right && (
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
              )}
              {reveal && picked && !right && (
                <XCircle className="w-4 h-4 text-destructive shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          Saved as you go — you can close this and come back.
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (confirm("Abandon this exam? Your answers so far will be lost.")) {
              abandonExam();
            }
          }}
        >
          Abandon
        </Button>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="mb-6">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        Exam
      </p>
      <h1 className="display-serif text-3xl font-semibold">
        A hundred questions.
      </h1>
    </div>
  );
}

function Results({
  session,
  onRestart,
}: {
  session: ExamSession;
  onRestart: () => void;
}) {
  const score = scoreExam(session);
  const missed = missedWordIds(session);

  return (
    <Card>
      <CardContent className="p-8 space-y-6">
        <div className="text-center">
          <p className="display-serif text-5xl font-semibold tabular">
            {score.percent}%
          </p>
          <p className="text-sm text-muted-foreground mt-1 tabular">
            {score.correct} of {score.total} correct
          </p>
        </div>

        <div className="space-y-2">
          {score.perSection.map((s) => (
            <div key={s.title} className="flex items-center gap-3">
              <span className="text-xs w-24 shrink-0 text-muted-foreground">
                {s.title}
              </span>
              <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${(s.correct / Math.max(s.total, 1)) * 100}%` }}
                />
              </div>
              <span className="text-xs tabular w-12 text-right">
                {s.correct}/{s.total}
              </span>
            </div>
          ))}
        </div>

        {missed.length > 0 && (
          <p className="text-[11px] text-muted-foreground leading-relaxed text-center">
            {missed.length} missed word{missed.length === 1 ? "" : "s"} moved
            forward in your schedule — they will come round sooner.
          </p>
        )}

        {/* The review is the part that teaches. A score alone tells you that
            you got eleven wrong; this tells you which eleven and what they
            actually mean. */}
        <details className="border-t border-border/60 pt-4">
          <summary className="text-sm font-medium cursor-pointer">
            Review every question
          </summary>
          <div className="mt-3 space-y-2">
            {session.sections.flatMap((section) =>
              section.questions.map((question, i) => {
                const given = section.answers[i];
                const right = given?.correct ?? false;
                return (
                  <div
                    key={`${section.title}-${i}`}
                    className={cn(
                      "rounded-md border p-3 text-xs space-y-1",
                      right ? "border-border/60" : "border-destructive/40",
                    )}
                  >
                    <p className="font-medium">{question.prompt}</p>
                    {!right && (
                      <p className="text-destructive">
                        You said:{" "}
                        {given ? given.chosen : <em>nothing — unanswered</em>}
                      </p>
                    )}
                    <p className={right ? "text-success" : "text-muted-foreground"}>
                      {right ? "Correct: " : "Answer: "}
                      {question.correct}
                    </p>
                  </div>
                );
              }),
            )}
          </div>
        </details>

        <div className="flex justify-center">
          <Button onClick={onRestart}>
            <RotateCcw className="w-4 h-4" />
            Take another
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

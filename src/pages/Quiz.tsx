import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, GraduationCap, RotateCcw, Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/EmptyState";
import { JsonImporter } from "@/components/JsonImporter";
import { useVocabStore } from "@/store/useVocabStore";
import { useProgressStore } from "@/store/useProgressStore";
import { allWordsInMonth } from "@/lib/vocabulary";
import { cn, sample, shuffle } from "@/lib/utils";
import type { QuizMode, QuizPool, QuizQuestion, VocabWord } from "@/types";

type Screen = "setup" | "playing" | "results";

export function Quiz() {
  const { months, activeMonthKey, getActiveMonth } = useVocabStore();
  const isMastered = useProgressStore((s) => s.isMastered);
  const recordAnswer = useProgressStore((s) => s.recordQuizAnswer);
  const addSession = useProgressStore((s) => s.addQuizSession);

  const [screen, setScreen] = useState<Screen>("setup");
  const [mode, setMode] = useState<QuizMode>("mixed");
  const [pool, setPool] = useState<QuizPool>("mastered");
  const [questionCount, setQuestionCount] = useState(10);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [qIdx, setQIdx] = useState(0);
  const [answers, setAnswers] = useState<
    Array<{ questionIdx: number; chosen: string; correct: boolean }>
  >([]);
  const [chosen, setChosen] = useState<string | null>(null);

  const allMonthsList = Object.values(months);
  const allWords: VocabWord[] = useMemo(
    () => allMonthsList.flatMap(allWordsInMonth),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [months],
  );

  const masteredWords = useMemo(
    () => allWords.filter((w) => isMastered(w.id)),
    [allWords, isMastered],
  );

  const activeMonth = getActiveMonth();
  const activeMonthWords = useMemo(
    () => (activeMonth ? allWordsInMonth(activeMonth) : []),
    [activeMonth],
  );

  const availablePool = useMemo(() => {
    switch (pool) {
      case "mastered":
        return masteredWords;
      case "month":
        return activeMonthWords;
      case "all":
      default:
        return allWords;
    }
  }, [pool, masteredWords, activeMonthWords, allWords]);

  function startQuiz() {
    if (availablePool.length < 2) return;
    const size = Math.min(questionCount, availablePool.length);
    const chosenWords = sample(availablePool, size);
    const qs: QuizQuestion[] = chosenWords.map((word) => {
      const qMode: QuizQuestion["mode"] =
        mode === "mixed"
          ? Math.random() < 0.5
            ? "word-to-def"
            : "def-to-word"
          : mode === "word-to-def"
            ? "word-to-def"
            : "def-to-word";
      const distractors = sample(
        allWords.filter((w) => w.id !== word.id),
        3,
      );
      const options =
        qMode === "word-to-def"
          ? shuffle([word.definition, ...distractors.map((d) => d.definition)])
          : shuffle([word.word, ...distractors.map((d) => d.word)]);
      return {
        wordId: word.id,
        mode: qMode,
        prompt: qMode === "word-to-def" ? word.word : word.definition,
        correct: qMode === "word-to-def" ? word.definition : word.word,
        options,
      };
    });
    setQuestions(qs);
    setQIdx(0);
    setAnswers([]);
    setChosen(null);
    setScreen("playing");
  }

  function answer(choice: string) {
    if (chosen !== null) return;
    setChosen(choice);
    const correct = choice === questions[qIdx]!.correct;
    const monthKey = findMonthKey(questions[qIdx]!.wordId, months);
    if (monthKey) recordAnswer(questions[qIdx]!.wordId, monthKey, correct);
    setAnswers((a) => [
      ...a,
      { questionIdx: qIdx, chosen: choice, correct },
    ]);
  }

  function next() {
    setChosen(null);
    if (qIdx + 1 >= questions.length) {
      const sessionScore = answers.filter((a) => a.correct).length;
      addSession({
        id: `q-${Date.now()}`,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        mode,
        pool,
        poolContext: pool === "month" ? activeMonthKey ?? undefined : undefined,
        questions,
        answers,
        score: sessionScore,
      });
      setScreen("results");
    } else {
      setQIdx((i) => i + 1);
    }
  }

  function restart() {
    setScreen("setup");
    setQuestions([]);
    setAnswers([]);
    setQIdx(0);
    setChosen(null);
  }

  if (allMonthsList.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <EmptyState
          icon={GraduationCap}
          title="Nothing to quiz yet"
          description="Load some vocabulary first."
          action={<JsonImporter />}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <AnimatePresence mode="wait">
        {screen === "setup" && (
          <SetupScreen
            key="setup"
            mode={mode}
            setMode={setMode}
            pool={pool}
            setPool={setPool}
            questionCount={questionCount}
            setQuestionCount={setQuestionCount}
            availableCount={availablePool.length}
            masteredCount={masteredWords.length}
            monthCount={activeMonthWords.length}
            allCount={allWords.length}
            onStart={startQuiz}
          />
        )}
        {screen === "playing" && questions.length > 0 && (
          <PlayScreen
            key="playing"
            q={questions[qIdx]!}
            qIdx={qIdx}
            total={questions.length}
            score={answers.filter((a) => a.correct).length}
            chosen={chosen}
            onAnswer={answer}
            onNext={next}
          />
        )}
        {screen === "results" && (
          <ResultsScreen
            key="results"
            score={answers.filter((a) => a.correct).length}
            total={questions.length}
            answers={answers}
            questions={questions}
            onRestart={restart}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function findMonthKey(
  wordId: string,
  months: Record<string, { days: { words: { id: string }[] }[] }>,
): string | null {
  for (const [key, m] of Object.entries(months)) {
    for (const d of m.days) {
      if (d.words.some((w) => w.id === wordId)) return key;
    }
  }
  return null;
}

function SetupScreen({
  mode,
  setMode,
  pool,
  setPool,
  questionCount,
  setQuestionCount,
  availableCount,
  masteredCount,
  monthCount,
  allCount,
  onStart,
}: {
  mode: QuizMode;
  setMode: (m: QuizMode) => void;
  pool: QuizPool;
  setPool: (p: QuizPool) => void;
  questionCount: number;
  setQuestionCount: (n: number) => void;
  availableCount: number;
  masteredCount: number;
  monthCount: number;
  allCount: number;
  onStart: () => void;
}) {
  const poolOptions: Array<{ v: QuizPool; label: string; count: number }> = [
    { v: "mastered", label: "Mastered words", count: masteredCount },
    { v: "month", label: "Current month", count: monthCount },
    { v: "all", label: "All loaded words", count: allCount },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
    >
      <div className="mb-8">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
          Quiz
        </p>
        <h1 className="display-serif text-3xl font-semibold">
          Test your recall.
        </h1>
      </div>

      <Card className="mb-6">
        <CardContent className="p-5 space-y-6">
          <div>
            <p className="text-sm font-medium mb-3">Mode</p>
            <div className="grid grid-cols-3 gap-2">
              {(["word-to-def", "def-to-word", "mixed"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-md border p-3 text-xs text-left transition-colors",
                    mode === m
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-border/80",
                  )}
                >
                  <p className="font-medium mb-0.5">
                    {m === "word-to-def"
                      ? "Word → Def"
                      : m === "def-to-word"
                        ? "Def → Word"
                        : "Mixed"}
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    {m === "word-to-def"
                      ? "See word, pick meaning"
                      : m === "def-to-word"
                        ? "See meaning, pick word"
                        : "Random each time"}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-3">Pool</p>
            <div className="grid gap-2">
              {poolOptions.map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setPool(opt.v)}
                  disabled={opt.count < 2}
                  className={cn(
                    "rounded-md border p-3 text-sm flex items-center justify-between transition-colors",
                    pool === opt.v
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-border/80",
                    opt.count < 2 && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <span className="font-medium">{opt.label}</span>
                  <Badge variant="outline" className="tabular">
                    {opt.count}
                  </Badge>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-sm font-medium">Questions</p>
              <p className="text-sm tabular text-muted-foreground">
                {Math.min(questionCount, availableCount)}
              </p>
            </div>
            <input
              type="range"
              min={3}
              max={Math.max(3, Math.min(30, availableCount))}
              value={Math.min(questionCount, availableCount)}
              onChange={(e) => setQuestionCount(Number(e.target.value))}
              className="w-full accent-accent"
              disabled={availableCount < 3}
            />
          </div>
        </CardContent>
      </Card>

      <Button
        className="w-full h-11"
        size="lg"
        onClick={onStart}
        disabled={availableCount < 2}
      >
        {availableCount < 2 ? "Not enough words in pool" : "Start quiz"}
      </Button>
    </motion.div>
  );
}

function PlayScreen({
  q,
  qIdx,
  total,
  score,
  chosen,
  onAnswer,
  onNext,
}: {
  q: QuizQuestion;
  qIdx: number;
  total: number;
  score: number;
  chosen: string | null;
  onAnswer: (c: string) => void;
  onNext: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
    >
      <div className="flex items-center justify-between mb-4 text-sm text-muted-foreground">
        <span className="tabular">
          Question {qIdx + 1} of {total}
        </span>
        <span className="tabular">Score: {score}</span>
      </div>
      <Progress value={((qIdx + (chosen ? 1 : 0)) / total) * 100} className="mb-8" />

      <AnimatePresence mode="wait">
        <motion.div
          key={qIdx}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2 }}
        >
          <div className="mb-6">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              {q.mode === "word-to-def"
                ? "What does this word mean?"
                : "Which word matches?"}
            </p>
            {q.mode === "word-to-def" ? (
              <h2 className="display-serif text-4xl font-semibold">
                {q.prompt}
              </h2>
            ) : (
              <p className="text-lg leading-relaxed text-foreground">
                "{q.prompt}"
              </p>
            )}
          </div>

          <div className="space-y-2">
            {q.options.map((opt) => {
              const isCorrect = opt === q.correct;
              const isChosen = opt === chosen;
              const state =
                chosen === null
                  ? "idle"
                  : isCorrect
                    ? "correct"
                    : isChosen
                      ? "wrong"
                      : "dim";
              return (
                <motion.button
                  key={opt}
                  type="button"
                  disabled={chosen !== null}
                  onClick={() => onAnswer(opt)}
                  whileHover={chosen === null ? { scale: 1.01 } : undefined}
                  whileTap={chosen === null ? { scale: 0.99 } : undefined}
                  className={cn(
                    "w-full text-left rounded-lg border p-4 text-sm leading-relaxed transition-colors",
                    state === "idle" &&
                      "border-border bg-card hover:border-border/80 hover:bg-secondary/40",
                    state === "correct" &&
                      "border-success bg-success/10 text-foreground",
                    state === "wrong" &&
                      "border-destructive bg-destructive/10 text-foreground",
                    state === "dim" && "border-border/60 opacity-50",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1">{opt}</div>
                    {state === "correct" && (
                      <Check className="w-4 h-4 text-success shrink-0 mt-0.5" />
                    )}
                    {state === "wrong" && (
                      <X className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>

          <AnimatePresence>
            {chosen !== null && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-6 flex items-center justify-between"
              >
                <p className="text-sm text-muted-foreground">
                  {chosen === q.correct ? "Nice." : "Not quite."}
                </p>
                <Button onClick={onNext}>
                  {qIdx + 1 >= total ? "See results" : "Next"}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

function ResultsScreen({
  score,
  total,
  answers,
  questions,
  onRestart,
}: {
  score: number;
  total: number;
  answers: Array<{ questionIdx: number; chosen: string; correct: boolean }>;
  questions: QuizQuestion[];
  onRestart: () => void;
}) {
  const pct = Math.round((score / total) * 100);
  const message =
    pct === 100
      ? "Flawless."
      : pct >= 80
        ? "Strong work."
        : pct >= 60
          ? "Solid — a few to revisit."
          : "Worth another pass.";
  const missed = answers
    .filter((a) => !a.correct)
    .map((a) => questions[a.questionIdx]!);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3 }}
    >
      <div className="text-center mb-8">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
          className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/10 text-accent mb-4"
        >
          <Trophy className="w-7 h-7" />
        </motion.div>
        <p className="text-sm text-muted-foreground mb-1">{message}</p>
        <p className="display-serif text-5xl font-semibold tabular">
          {score} <span className="text-muted-foreground">/ {total}</span>
        </p>
        <p className="text-sm text-muted-foreground mt-1">{pct}%</p>
      </div>

      {missed.length > 0 && (
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            Worth another look
          </p>
          <div className="space-y-2">
            {missed.map((q, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.05 }}
                className="rounded-lg border border-border bg-card p-4"
              >
                <p className="display-serif font-semibold">
                  {q.mode === "word-to-def" ? q.prompt : q.correct}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                  {q.mode === "word-to-def" ? q.correct : `"${q.prompt}"`}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button className="flex-1" onClick={onRestart}>
          <RotateCcw className="w-4 h-4" />
          New quiz
        </Button>
      </div>
    </motion.div>
  );
}

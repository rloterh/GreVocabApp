import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  PenLine,
  Sparkles,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { JsonImporter } from "@/components/JsonImporter";
import { useVocabStore } from "@/store/useVocabStore";
import { useProgressStore } from "@/store/useProgressStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useAppStore } from "@/store/useAppStore";
import { apiVerify, heuristicVerify } from "@/lib/verify";
import { aiRegistry } from "@/lib/ai/client";
import { toDateKey } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import type {
  SentencePractice,
  SentenceVerification,
  VocabWord,
} from "@/types";

export function SentenceBuilder() {
  const { getActiveMonth, getWordsForSelectedDay, selectedDay } =
    useVocabStore();
  const saveSentences = useProgressStore((s) => s.saveSentences);
  const getSaved = useProgressStore((s) => s.getSentences);
  const { preferApiVerification } = useSettingsStore();
  const showToast = useAppStore((s) => s.showToast);

  const month = getActiveMonth();
  const words = getWordsForSelectedDay();
  const [wordIdx, setWordIdx] = useState(0);
  const currentWord: VocabWord | undefined = words[wordIdx];
  const today = useMemo(() => toDateKey(new Date()), []);
  const saved = currentWord ? getSaved(currentWord.id, today) : undefined;

  const [sentences, setSentences] = useState<string[]>(
    saved?.sentences ?? ["", "", ""],
  );
  const [verification, setVerification] = useState<
    SentenceVerification | undefined
  >(saved?.verification);
  const [busy, setBusy] = useState(false);

  // Reset the sentence draft when the selected word changes.
  //
  // This was a useMemo used for its side effects, which is not what useMemo
  // is for — React is free to drop or re-run a memo, and the dependency list
  // lied about reading `currentWord`. This is React's documented
  // "adjusting state when a prop changes" pattern instead: a render-phase
  // update guarded by the previous id. It keeps the original timing, so the
  // new word's draft is right on the first render rather than one frame late.
  const [lastWordId, setLastWordId] = useState(currentWord?.id);
  if (currentWord && currentWord.id !== lastWordId) {
    setLastWordId(currentWord.id);
    const s = getSaved(currentWord.id, today);
    setSentences(s?.sentences ?? ["", "", ""]);
    setVerification(s?.verification);
  }

  if (!month) {
    return (
      <div className="w-full lg:max-w-3xl lg:mx-auto py-12">
        <EmptyState
          icon={PenLine}
          title="No vocabulary loaded"
          description="Load a month, then come back to write practice sentences."
          action={<JsonImporter />}
        />
      </div>
    );
  }

  if (words.length === 0) {
    return (
      <div className="w-full lg:max-w-3xl lg:mx-auto py-12">
        <EmptyState
          icon={PenLine}
          title={`No words for day ${selectedDay}`}
          description="Pick a day that has vocabulary from the daily practice or calendar."
        />
      </div>
    );
  }

  async function verify() {
    if (!currentWord) return;
    const nonEmpty = sentences.filter((s) => s.trim().length > 0);
    if (nonEmpty.length === 0) {
      showToast({
        title: "Write at least one sentence first",
        variant: "error",
      });
      return;
    }
    setBusy(true);
    let result: SentenceVerification;
    if (preferApiVerification) {
      // Any available provider will do — including a local one, which keeps
      // the user's sentences on their machine.
      const provider = await aiRegistry()
        .then((registry) => registry.select())
        .catch(() => null);
      result = provider
        ? await apiVerify(currentWord, nonEmpty, provider)
        : heuristicVerify(currentWord, nonEmpty);
    } else {
      result = heuristicVerify(currentWord, nonEmpty);
    }
    setVerification(result);
    const practice: SentencePractice = {
      wordId: currentWord.id,
      date: today,
      sentences: nonEmpty,
      verification: result,
    };
    saveSentences(practice);
    setBusy(false);

    showToast({
      title:
        result.overall === "excellent"
          ? "All sentences look great"
          : result.overall === "good"
            ? "Most sentences look good"
            : "A few things to work on",
      description:
        result.method === "api"
          ? "Verified by Claude"
          : "Verified with heuristic checks",
      variant:
        result.overall === "excellent"
          ? "success"
          : result.overall === "needs-work"
            ? "error"
            : "default",
    });
  }

  function updateSentence(i: number, v: string) {
    const next = [...sentences];
    next[i] = v;
    setSentences(next);
    // Clear verification when text changes
    if (verification) setVerification(undefined);
  }

  if (!currentWord) return null;

  return (
    <div className="w-full lg:max-w-2xl lg:mx-auto py-8">
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
          {month.title} · Day {selectedDay}
        </p>
        <h1 className="display-serif text-3xl font-semibold">
          Write with the word.
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          {preferApiVerification
            ? "Claude will check grammar and correct usage."
            : "Heuristic checks — for smarter feedback, add an API key in Settings."}
        </p>
      </div>

      <div className="flex items-center justify-between mb-4">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setWordIdx((i) => Math.max(0, i - 1))}
          disabled={wordIdx === 0}
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </Button>
        <div className="text-xs text-muted-foreground tabular">
          Word {wordIdx + 1} of {words.length}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            setWordIdx((i) => Math.min(words.length - 1, i + 1))
          }
          disabled={wordIdx >= words.length - 1}
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentWord.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          <Card className="mb-4">
            <CardContent className="p-5">
              <div className="flex items-baseline gap-3 flex-wrap mb-3">
                <h2 className="display-serif text-3xl font-semibold">
                  {currentWord.word}
                </h2>
                <Badge variant="outline">{currentWord.partOfSpeech}</Badge>
              </div>
              <p className="text-sm leading-relaxed">
                {currentWord.definition}
              </p>
            </CardContent>
          </Card>

          <div className="space-y-3 mb-4">
            {sentences.map((s, i) => {
              const perSent =
                verification?.perSentence.find((p) => p.sentence === s.trim()) ??
                verification?.perSentence[i];
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Sentence {i + 1}
                      {i > 1 && (
                        <span className="ml-1 text-muted-foreground/60 normal-case">
                          (optional)
                        </span>
                      )}
                    </p>
                    {perSent && (
                      <Badge
                        variant={perSent.correct ? "success" : "warning"}
                        className="text-[10px]"
                      >
                        {perSent.correct ? (
                          <>
                            <Check className="w-2.5 h-2.5 mr-0.5" />
                            Correct
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
                            Needs work
                          </>
                        )}
                      </Badge>
                    )}
                  </div>
                  <Textarea
                    placeholder={`Write a sentence using "${currentWord.word}"…`}
                    value={s}
                    onChange={(e) => updateSentence(i, e.target.value)}
                    rows={2}
                    className={cn(
                      "font-serif text-base leading-relaxed",
                      perSent?.correct === false &&
                        "border-warning/60 focus-visible:ring-warning",
                      perSent?.correct === true &&
                        "border-success/60 focus-visible:ring-success",
                    )}
                  />
                  {perSent?.feedback && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xs text-muted-foreground mt-1.5 leading-relaxed"
                    >
                      {perSent.feedback}
                      {perSent.suggestion && (
                        <span className="block mt-1 italic text-foreground/70">
                          Try: "{perSent.suggestion}"
                        </span>
                      )}
                    </motion.p>
                  )}
                </div>
              );
            })}
          </div>

          <Button
            onClick={verify}
            disabled={busy || sentences.every((s) => !s.trim())}
            className="w-full"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Checking…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {verification ? "Re-check" : "Check my sentences"}
              </>
            )}
          </Button>

          {verification && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 text-center text-xs text-muted-foreground"
            >
              Overall:{" "}
              <span
                className={cn(
                  "font-medium",
                  verification.overall === "excellent" && "text-success",
                  verification.overall === "needs-work" && "text-warning",
                )}
              >
                {verification.overall}
              </span>{" "}
              · {verification.method === "api" ? "AI-verified" : "heuristic"}
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

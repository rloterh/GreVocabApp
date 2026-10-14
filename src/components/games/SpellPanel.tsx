/**
 * Spell It: hear the word, read what it means, type it.
 *
 * The input has autocomplete, autocorrect, autocapitalise and spellcheck all
 * off. On a phone any one of them either answers for the player or "fixes" a
 * right answer into a wrong one (docs/GAMES.md §4.7).
 *
 * Speech is the user's chosen voice and rate. It plays once when the word
 * arrives and again on every tap; replay is free. With no speech available
 * the game still works from the definition and the letter count, and says so
 * rather than showing a dead button.
 */

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Lightbulb, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canSpeak, speak } from "@/lib/speech";
import type { AnswerRecord, SpellQuestion } from "@/lib/games/types";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store/useSettingsStore";

const EASE = [0.16, 1, 0.3, 1] as const;

export function SpellPanel({
  question,
  phase,
  answer,
  reduceMotion,
  onSubmit,
  onContinue,
}: {
  question: SpellQuestion;
  phase: string;
  answer: AnswerRecord | undefined;
  reduceMotion: boolean;
  onSubmit: (typed: string, hinted: boolean) => void;
  onContinue: () => void;
}) {
  const voice = useSettingsStore((s) => s.speechVoice);
  const rate = useSettingsStore((s) => s.speechRate);
  const [typed, setTyped] = useState("");
  const [hinted, setHinted] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const spoken = useRef<string | null>(null);
  const speechAvailable = canSpeak();
  const asking = phase === "asking";
  const say = () => speak(question.word, { voice, rate });

  // Say it once when the question becomes answerable, and focus the field.
  useEffect(() => {
    if (!asking) return;
    input.current?.focus();
    if (speechAvailable && spoken.current !== question.wordId) {
      spoken.current = question.wordId;
      speak(question.word, { voice, rate });
    }
  }, [asking, question, speechAvailable, voice, rate]);

  const submit = () => {
    if (!asking || !typed.trim()) return;
    onSubmit(typed, hinted);
  };

  const done = phase === "feedback" && answer;
  const letters = question.word.length;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-6 text-center">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Spell the word</p>

      {speechAvailable ? (
        <Button
          type="button"
          variant="outline"
          onClick={say}
          className="h-16 w-16 rounded-full"
          aria-label="Hear the word again"
        >
          <Volume2 className="!size-6" />
        </Button>
      ) : (
        <p className="max-w-sm text-xs text-muted-foreground">
          This device can’t speak words aloud, so spell it from the meaning.
        </p>
      )}

      <div className="max-w-[34rem]">
        <p className="text-xs italic text-muted-foreground">{question.partOfSpeech}</p>
        <p className="mt-1 text-balance text-[clamp(1.1rem,3.5vw,1.4rem)] leading-snug">{question.definition}</p>
      </div>

      <form
        className="w-full max-w-sm"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="spell-input" className="sr-only">
          Type the word, {letters} letters
        </label>
        <input
          id="spell-input"
          ref={input}
          value={done ? (answer.typed ?? typed) : typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={!asking}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="done"
          maxLength={letters + 6}
          placeholder={hinted ? `${question.word[0]}${"·".repeat(letters - 1)}` : "·".repeat(letters)}
          className={cn(
            "display-serif w-full rounded-xl border bg-card px-4 py-3 text-center text-2xl tracking-[0.18em] outline-none transition-colors",
            "placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring",
            done && answer.correct && "border-success bg-success/10 text-success",
            done && !answer.correct && "border-destructive/60 bg-destructive/10",
            !done && "border-border",
          )}
        />
        <p className="tabular mt-2 text-xs text-muted-foreground">{letters} letters</p>

        {!done && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!asking || hinted}
              onClick={() => {
                setHinted(true);
                if (!typed) setTyped(question.word[0]!);
                input.current?.focus();
              }}
            >
              <Lightbulb /> {hinted ? "First letter shown" : "Hint (half points)"}
            </Button>
            <Button type="submit" size="sm" disabled={!asking || !typed.trim()}>
              Check
            </Button>
          </div>
        )}
      </form>

      {done && (
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: EASE }}
          className="w-full max-w-sm rounded-xl border border-border bg-card p-4 text-left text-sm"
        >
          <p className="font-medium">
            <span className={answer.correct ? "text-success" : "text-foreground"}>
              {answer.correct ? "Correct" : answer.timedOut ? "Time's up" : "Not quite"}
            </span>
            {answer.correct && <span className="tabular ml-2 text-success">+{answer.points}</span>}
          </p>
          {!answer.correct && (
            <p className="mt-2">
              It’s spelled <Spelling answer={question.word} typed={answer.typed ?? ""} />.
            </p>
          )}
          {question.explain.example && (
            <p className="mt-2 italic text-muted-foreground">“{question.explain.example}”</p>
          )}
          <div className="mt-3 flex justify-end">
            <Button size="sm" autoFocus onClick={onContinue}>
              Continue
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

/**
 * The right spelling, with each letter that differs from what was typed
 * underlined — the letters to remember, not the whole word again.
 */
export function Spelling({ answer, typed }: { answer: string; typed: string }) {
  const t = typed.trim().toLowerCase();
  return (
    <span className="display-serif font-semibold">
      {[...answer].map((ch, i) => (
        <span key={i} className={cn(t[i] !== ch.toLowerCase() && "text-success underline decoration-2 underline-offset-4")}>
          {ch}
        </span>
      ))}
    </span>
  );
}


import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Lightbulb, Volume2 } from "lucide-react";
import type { VocabWord } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface FlashCardProps {
  word: VocabWord;
  mastered: boolean;
  onToggleMastered: () => void;
  onReveal?: () => void;
  index?: number;
}

export function FlashCard({
  word,
  mastered,
  onToggleMastered,
  onReveal,
  index = 0,
}: FlashCardProps) {
  const [revealed, setRevealed] = useState(false);

  function handleReveal() {
    if (!revealed) {
      setRevealed(true);
      onReveal?.();
    } else {
      setRevealed(false);
    }
  }

  function speak() {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(word.word);
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: index * 0.08,
        ease: [0.16, 1, 0.3, 1],
      }}
      layout
      className={cn(
        "group relative rounded-xl border bg-card p-6 transition-colors",
        mastered
          ? "border-success/50 shadow-[0_0_0_1px_hsl(var(--success)/0.3)]"
          : "border-border hover:border-border/80",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <button
          type="button"
          onClick={handleReveal}
          className="flex-1 text-left focus:outline-none"
        >
          <div className="flex items-baseline gap-3 flex-wrap">
            {/* h2: the word is the main heading of the card, and the card
                sits directly under the page heading. */}
            <h2 className="display-serif text-3xl font-semibold text-foreground">
              {word.word}
            </h2>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              {word.partOfSpeech}
            </Badge>
          </div>
          {!revealed && (
            <p className="mt-2 text-xs text-muted-foreground">Click to reveal</p>
          )}
        </button>

        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 opacity-60 hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              speak();
            }}
            aria-label="Pronounce"
          >
            <Volume2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={mastered ? "accent" : "outline"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleMastered();
            }}
            className={cn(
              "min-w-[110px] transition-all",
              mastered && "text-accent-foreground",
            )}
          >
            {mastered ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Mastered
              </>
            ) : (
              "Mark mastered"
            )}
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {revealed && (
          <motion.div
            key="reveal"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-5 pt-5 border-t border-border/60 space-y-4">
              <Section label="Definition" body={word.definition} />
              <Section
                label="Example"
                body={<em className="text-foreground/90">"{word.example}"</em>}
              />
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <Lightbulb className="h-3 w-3" />
                  Memory tip
                </p>
                <p className="text-sm text-foreground/85 leading-relaxed">
                  {word.mnemonic}
                </p>
              </div>
              {(word.synonyms?.length || word.antonyms?.length) ? (
                <div className="flex flex-wrap gap-4 pt-2">
                  {word.synonyms?.length ? (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                        Synonyms
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {word.synonyms.map((s) => (
                          <Badge key={s} variant="secondary">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {word.antonyms?.length ? (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                        Antonyms
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {word.antonyms.map((s) => (
                          <Badge key={s} variant="outline">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Section({
  label,
  body,
}: {
  label: string;
  body: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
        {label}
      </p>
      <p className="text-sm text-foreground/90 leading-relaxed">{body}</p>
    </div>
  );
}

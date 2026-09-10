/**
 * "Generate a month with Claude" dialog.
 *
 * Thin on purpose: the prompt, the schema and the API call live in
 * `src/lib/generate.ts`, and the result is handed to the vocab store's
 * `loadMonth`, so generated content is validated exactly like an imported
 * file. This component only collects three inputs and reports what happened.
 *
 * See ROADMAP.md, Phase 3.
 */

import { useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVocabStore } from "@/store/useVocabStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useAppStore } from "@/store/useAppStore";
import { generateMonth, WORDS_PER_DAY } from "@/lib/generate";
import { allWordsInMonth, firstFreeMonthKey } from "@/lib/vocabulary";
import { formatMonthKey } from "@/lib/date-utils";

export function VocabGenerator() {
  const months = useVocabStore((s) => s.months);
  const loadMonth = useVocabStore((s) => s.loadMonth);
  const apiKey = useSettingsStore((s) => s.anthropicApiKey);
  const showToast = useAppStore((s) => s.showToast);
  const navigate = useAppStore((s) => s.navigate);

  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [wordCount, setWordCount] = useState(30);
  const [monthKey, setMonthKey] = useState(() => firstFreeMonthKey(months));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function openDialog() {
    setMonthKey(firstFreeMonthKey(months));
    setError(null);
    setOpen(true);
  }

  function closeDialog(next: boolean) {
    if (!next) {
      abortRef.current?.abort();
      abortRef.current = null;
      setBusy(false);
    }
    setOpen(next);
  }

  async function run() {
    setError(null);
    if (!topic.trim()) {
      setError("Give it a topic first.");
      return;
    }
    if (monthKey in months) {
      setError(
        `${formatMonthKey(monthKey)} is already loaded. Pick another month, or remove it first.`,
      );
      return;
    }

    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const existingWords = Object.values(months)
        .flatMap((m) => allWordsInMonth(m))
        .map((w) => w.word);

      const generated = await generateMonth({
        apiKey: apiKey ?? "",
        topic: topic.trim(),
        wordCount,
        monthKey,
        existingWords,
        signal: controller.signal,
      });

      const result = loadMonth(generated);
      if (!result.ok) {
        setError(`The generated month did not validate: ${result.error}`);
        return;
      }

      setOpen(false);
      setTopic("");
      showToast({
        title: `Generated ${formatMonthKey(monthKey)}`,
        description: `${wordCount} words across ${Math.ceil(wordCount / WORDS_PER_DAY)} days`,
        variant: "success",
      });
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={openDialog}>
        <Sparkles className="w-3.5 h-3.5" />
        Generate with AI
      </Button>

      <Dialog open={open} onOpenChange={closeDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate a month</DialogTitle>
            <DialogDescription>
              Claude writes the words, definitions, examples and mnemonics.
              Everything is checked against the same rules as an imported file
              before it loads.
            </DialogDescription>
          </DialogHeader>

          {!apiKey ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This uses your own Anthropic API key, which is not set yet. It
                stays in this browser and is sent only to Anthropic.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  navigate("settings");
                }}
              >
                Open Settings
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label
                  className="text-xs text-muted-foreground mb-1.5 block"
                  htmlFor="gen-topic"
                >
                  Topic
                </label>
                <Input
                  id="gen-topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="GRE high-frequency adjectives"
                  disabled={busy}
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label
                    className="text-xs text-muted-foreground mb-1.5 block"
                    htmlFor="gen-count"
                  >
                    Words
                  </label>
                  <Input
                    id="gen-count"
                    type="number"
                    min={1}
                    max={90}
                    value={wordCount}
                    onChange={(e) =>
                      setWordCount(Number(e.target.value) || 1)
                    }
                    className="tabular"
                    disabled={busy}
                  />
                </div>
                <div className="flex-1">
                  <label
                    className="text-xs text-muted-foreground mb-1.5 block"
                    htmlFor="gen-month"
                  >
                    Month
                  </label>
                  <Input
                    id="gen-month"
                    type="month"
                    value={monthKey}
                    onChange={(e) => setMonthKey(e.target.value)}
                    className="tabular"
                    disabled={busy}
                  />
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {WORDS_PER_DAY} words per day, so {wordCount} words fills{" "}
                {Math.ceil(wordCount / WORDS_PER_DAY)} days. This calls the
                Anthropic API with your key and is billed to your account.
              </p>

              {error && (
                <p
                  className="text-xs text-destructive leading-relaxed"
                  role="alert"
                >
                  {error}
                </p>
              )}

              <div className="flex gap-2">
                <Button onClick={run} disabled={busy}>
                  {busy ? "Generating…" : "Generate"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => closeDialog(false)}
                  disabled={!busy && !open}
                >
                  {busy ? "Cancel" : "Close"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

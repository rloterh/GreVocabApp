/**
 * "Generate a month" — two routes to the same place.
 *
 * **Generate** uses whatever provider the registry finds: on-device, a local
 * server, or a cloud key the user configured.
 *
 * **Generate elsewhere** needs no AI at all. The app writes the prompt, the
 * user runs it in whatever they already have open, and pastes the reply back.
 * That route is offered up front rather than buried as a fallback — for a user
 * without a key it is the fastest path, not a consolation prize.
 *
 * Either way the result goes through `loadMonth`, exactly like a file.
 *
 * See ROADMAP.md Phases 3 and 6; docs/adr/0008-prompt-bridge.md.
 */

import { useRef, useState } from "react";
import { ClipboardCopy, Sparkles, Wand2 } from "lucide-react";
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
import { useAppStore } from "@/store/useAppStore";
import { generateMonth, WORDS_PER_DAY } from "@/lib/generate";
import { selectProvider } from "@/lib/ai/client";
import { AiError } from "@/lib/ai/errors";
import {
  buildBridgePrompt,
  countDiscardedRows,
  parsePastedVocab,
} from "@/lib/prompt-bridge";
import { allWordsInMonth, firstFreeMonthKey } from "@/lib/vocabulary";
import { formatMonthKey } from "@/lib/date-utils";
import { PlanBuilder } from "@/components/PlanBuilder";
import { useRestoreFocus } from "@/hooks/useRestoreFocus";

type Mode = "form" | "plan" | "bridge";

export function VocabGenerator() {
  const months = useVocabStore((s) => s.months);
  const loadMonth = useVocabStore((s) => s.loadMonth);
  const showToast = useAppStore((s) => s.showToast);

  const [open, setOpen] = useState(false);
  // Keyboard users must land back on the control that opened this.
  useRestoreFocus(open);
  const [mode, setMode] = useState<Mode>("form");
  const [topic, setTopic] = useState("");
  const [wordCount, setWordCount] = useState(30);
  const [monthKey, setMonthKey] = useState(() => firstFreeMonthKey(months));
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const existingWords = () =>
    Object.values(months)
      .flatMap((m) => allWordsInMonth(m))
      .map((w) => w.word);

  function openDialog() {
    setMonthKey(firstFreeMonthKey(months));
    setMode("form");
    setPasted("");
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

  /** Shared guard, so both routes reject the same things the same way. */
  function invalidInputs(): string | null {
    if (!topic.trim()) return "Give it a topic first.";
    if (monthKey in months) {
      return `${formatMonthKey(monthKey)} is already loaded. Pick another month, or remove it first.`;
    }
    return null;
  }

  function commit(objects: unknown[], via: string): boolean {
    let loaded = 0;
    for (const object of objects) {
      const result = loadMonth(object);
      if (!result.ok) {
        setError(`That did not validate: ${result.error}`);
        return false;
      }
      loaded++;
    }
    setOpen(false);
    setTopic("");
    setPasted("");
    showToast({
      title: `Added ${formatMonthKey(monthKey)}`,
      description: `${loaded} month${loaded === 1 ? "" : "s"} via ${via}`,
      variant: "success",
    });
    return true;
  }

  async function generate() {
    const invalid = invalidInputs();
    if (invalid) {
      setError(invalid);
      return;
    }

    setError(null);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const provider = await selectProvider();
      const generated = await generateMonth({
        provider,
        topic: topic.trim(),
        wordCount,
        monthKey,
        existingWords: existingWords(),
        signal: controller.signal,
      });
      commit([generated], provider.label);
    } catch (e) {
      if (controller.signal.aborted) return;
      if (e instanceof AiError && e.kind === "cancelled") return;
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  async function copyPrompt() {
    const invalid = invalidInputs();
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    try {
      await navigator.clipboard.writeText(
        buildBridgePrompt({
          topic: topic.trim(),
          wordCount,
          existingWords: existingWords(),
        }),
      );
      setMode("bridge");
      showToast({
        title: "Prompt copied",
        description: "Paste it into any AI, then bring the reply back here.",
        variant: "success",
      });
    } catch {
      setError("Could not copy to the clipboard.");
    }
  }

  function importPasted() {
    setError(null);
    try {
      const discarded = countDiscardedRows(pasted);
      if (commit(parsePastedVocab(pasted, monthKey), "your own AI") && discarded > 0) {
        // Worth recording: the user cannot see what was dropped.
        console.info(`prompt bridge: ignored ${discarded} non-CSV line(s)`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that reply.");
    }
  }

  const days = Math.ceil(wordCount / WORDS_PER_DAY);

  return (
    <>
      <Button size="sm" variant="outline" onClick={openDialog}>
        <Sparkles className="w-3.5 h-3.5" />
        Generate with AI
      </Button>

      <Dialog open={open} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {mode === "form"
                ? "Generate a month"
                : mode === "plan"
                  ? "Plan ahead"
                  : "Paste the reply"}
            </DialogTitle>
            <DialogDescription>
              {mode === "form"
                ? "Words, definitions, examples and mnemonics. Everything is checked against the same rules as an imported file before it loads."
                : mode === "plan"
                  ? "Generate several months at once, with difficulty that builds. No word is ever repeated — including words from months you have removed."
                  : "Run the copied prompt in any AI, then paste its whole reply below. Extra commentary is ignored."}
            </DialogDescription>
          </DialogHeader>

          {mode !== "bridge" && (
            <div className="flex gap-1 rounded-md bg-secondary/60 p-1">
              {(
                [
                  ["form", "One month"],
                  ["plan", "Plan ahead"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                  className={
                    "flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors " +
                    (mode === value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {mode === "plan" ? (
            <PlanBuilder onDone={() => setOpen(false)} />
          ) : mode === "form" ? (
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
                    onChange={(e) => setWordCount(Number(e.target.value) || 1)}
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
                {WORDS_PER_DAY} words per day, so {wordCount} words fills {days}{" "}
                {days === 1 ? "day" : "days"}.
              </p>

              {error && (
                <p
                  className="text-xs text-destructive leading-relaxed"
                  role="alert"
                >
                  {error}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button onClick={generate} disabled={busy}>
                  <Wand2 className="w-4 h-4" />
                  {busy ? "Generating…" : "Generate"}
                </Button>
                <Button variant="outline" onClick={copyPrompt} disabled={busy}>
                  <ClipboardCopy className="w-4 h-4" />
                  Generate elsewhere
                </Button>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <span className="text-foreground font-medium">
                  Generate elsewhere
                </span>{" "}
                needs no API key: it copies a prompt you can paste into any AI
                you already use, then brings the reply back here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="sr-only" htmlFor="gen-pasted">
                The reply
              </label>
              <textarea
                id="gen-pasted"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={"word,partOfSpeech,definition,example,mnemonic,day\n…"}
                rows={8}
                autoFocus
                className="w-full rounded-md border border-input bg-background p-3 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />

              {error && (
                <p
                  className="text-xs text-destructive leading-relaxed"
                  role="alert"
                >
                  {error}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button onClick={importPasted} disabled={!pasted.trim()}>
                  Import
                </Button>
                <Button variant="outline" onClick={copyPrompt}>
                  <ClipboardCopy className="w-4 h-4" />
                  Copy prompt again
                </Button>
                <Button variant="ghost" onClick={() => setMode("form")}>
                  Back
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

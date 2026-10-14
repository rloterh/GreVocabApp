import type { VocabWord } from "@/types";
import { Badge } from "@/components/ui/badge";
import { useSettingsStore } from "@/store/useSettingsStore";
import { cn } from "@/lib/utils";

/**
 * Synonyms and antonyms, wherever a word is read.
 *
 * One component rather than three copies, because these were already in the
 * corpus — 5,234 of 5,241 words carry synonyms and 4,797 carry antonyms — and
 * only the Daily Practice card ever showed them. The two places people
 * actually study a word, the flashcard back and the search detail, rendered
 * definition, example and mnemonic and silently dropped the rest.
 *
 * Optional because they are genuinely not for everyone. Someone drilling
 * recall wants the front of the card and as little else as possible, and a
 * wall of near-synonyms is the opposite of that. Someone building a writing
 * vocabulary wants exactly the opposite. So it is a setting, on by default:
 * content that exists and is useful should not need discovering.
 *
 * Returns null when the user has turned it off *or* the word has neither, so
 * no caller needs to think about spacing around an empty block.
 */
export function WordRelations({
  word,
  className,
  /** `stacked` for narrow columns; `inline` sits them side by side. */
  layout = "inline",
}: {
  word: Pick<VocabWord, "synonyms" | "antonyms">;
  className?: string;
  layout?: "inline" | "stacked";
}) {
  const show = useSettingsStore((s) => s.showWordRelations);

  const synonyms = word.synonyms ?? [];
  const antonyms = word.antonyms ?? [];
  if (!show || (synonyms.length === 0 && antonyms.length === 0)) return null;

  return (
    <div
      className={cn(
        layout === "inline"
          ? "flex flex-wrap gap-x-6 gap-y-3"
          : "flex flex-col gap-3",
        className,
      )}
    >
      {synonyms.length > 0 && (
        <Group label="Synonyms" words={synonyms} variant="secondary" />
      )}
      {antonyms.length > 0 && (
        <Group label="Antonyms" words={antonyms} variant="outline" />
      )}
    </div>
  );
}

function Group({
  label,
  words,
  variant,
}: {
  label: string;
  words: string[];
  variant: "secondary" | "outline";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {words.map((w) => (
          <Badge key={w} variant={variant} className="font-normal">
            {w}
          </Badge>
        ))}
      </div>
    </div>
  );
}

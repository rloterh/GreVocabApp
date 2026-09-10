import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search as SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { WordDetail, type WordDetailTarget } from "@/components/WordDetail";
import { JsonImporter } from "@/components/JsonImporter";
import { useVocabStore } from "@/store/useVocabStore";
import { useProgressStore } from "@/store/useProgressStore";
import { useAppStore } from "@/store/useAppStore";
import { formatMonthKey } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

export function Search() {
  const months = useVocabStore((s) => s.months);
  const setActiveMonth = useVocabStore((s) => s.setActiveMonth);
  const setSelectedDay = useVocabStore((s) => s.setSelectedDay);
  const isMastered = useProgressStore((s) => s.isMastered);
  const navigate = useAppStore((s) => s.navigate);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<WordDetailTarget | null>(null);

  const indexed = useMemo(() => {
    return Object.values(months).flatMap((m) =>
      m.days.flatMap((d) =>
        d.words.map((w) => ({
          ...w,
          monthKey: m.month,
          monthName: m.displayName,
          day: d.day,
        })),
      ),
    );
  }, [months]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    return indexed
      .filter(
        (w) =>
          w.word.toLowerCase().includes(q) ||
          w.definition.toLowerCase().includes(q) ||
          w.mnemonic.toLowerCase().includes(q) ||
          w.example.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [q, indexed]);

  if (indexed.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <EmptyState
          icon={SearchIcon}
          title="Nothing to search"
          description="Load some vocabulary first."
          action={<JsonImporter />}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
          Search
        </p>
        <h1 className="display-serif text-3xl font-semibold">
          Look anything up.
        </h1>
      </div>

      <div className="relative mb-6">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search words, definitions, mnemonics…"
          className="pl-9 h-11 text-base"
          autoFocus
        />
      </div>

      {q && (
        <p className="text-xs text-muted-foreground mb-3">
          {results.length} result{results.length === 1 ? "" : "s"} across{" "}
          {Object.keys(months).length} month
          {Object.keys(months).length === 1 ? "" : "s"}
        </p>
      )}

      <AnimatePresence mode="popLayout">
        <div className="space-y-2">
          {results.map((r, i) => (
            <motion.div
              key={r.id}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.3) }}
            >
              <Card
                role="button"
                tabIndex={0}
                aria-haspopup="dialog"
                className="cursor-pointer hover:border-border/80 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                onClick={() => setDetail(r)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDetail(r);
                  }
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-baseline justify-between gap-3 mb-1.5">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="display-serif text-xl font-semibold">
                        <Highlight text={r.word} q={q} />
                      </p>
                      <span className="text-xs italic text-muted-foreground">
                        {r.partOfSpeech}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="outline" className="text-[10px]">
                        {formatMonthKey(r.monthKey)} · Day {r.day}
                      </Badge>
                      <div
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          isMastered(r.id)
                            ? "bg-success"
                            : "bg-muted-foreground/30",
                        )}
                      />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    <Highlight text={r.definition} q={q} />
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </AnimatePresence>

      <WordDetail
        word={detail}
        onOpenChange={(open) => !open && setDetail(null)}
        onOpenPractice={(w) => {
          setDetail(null);
          setActiveMonth(w.monthKey);
          setSelectedDay(w.day);
          navigate("practice");
        }}
      />

      {q && results.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-12">
          Nothing matched "{query}".
        </p>
      )}
    </div>
  );
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-accent/25 text-foreground rounded-sm px-0.5">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

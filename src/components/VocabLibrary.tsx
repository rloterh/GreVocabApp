/**
 * The bundled corpus, loaded a month at a time.
 *
 * Three years of vocabulary ships with the app but is **not** bundled into the
 * JavaScript: that would add megabytes to first paint for material most users
 * will never open. Each month is fetched when it is asked for, and this screen
 * lists what is available from a small index.
 *
 * A month already loaded shows as loaded rather than being offered again, and
 * words already known are noted before anything is fetched — the same
 * courtesy the generation plan extends.
 */

import { useEffect, useMemo, useState } from "react";
import { BookMarked, Check, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useVocabStore } from "@/store/useVocabStore";
import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";

interface LibraryMonth {
  month: string;
  displayName: string;
  description?: string;
  words: number;
  days: number;
  sample: string[];
}

export function VocabLibrary() {
  const months = useVocabStore((s) => s.months);
  const loadMonth = useVocabStore((s) => s.loadMonth);
  const showToast = useAppStore((s) => s.showToast);

  const [available, setAvailable] = useState<LibraryMonth[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}vocab/index.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { months: LibraryMonth[] }) => {
        if (!cancelled) setAvailable(data.months ?? []);
      })
      .catch(() => {
        // No index is not an error worth shouting about: a build without the
        // corpus is a legitimate build.
        if (!cancelled) setAvailable([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const notLoaded = useMemo(
    () => (available ?? []).filter((m) => !(m.month in months)),
    [available, months],
  );

  async function load(entry: LibraryMonth) {
    setBusy(entry.month);
    setError(null);
    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}vocab/${entry.month}.json`,
      );
      if (!response.ok) throw new Error(`could not fetch (${response.status})`);
      const result = loadMonth(await response.json());
      if (!result.ok) throw new Error(result.error);
      showToast({
        title: `Added ${entry.displayName}`,
        description: `${entry.words} words`,
        variant: "success",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load that month.");
    } finally {
      setBusy(null);
    }
  }

  async function loadAll() {
    for (const entry of notLoaded) await load(entry);
  }

  if (available === null) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Looking for bundled vocabulary…
      </p>
    );
  }

  if (available.length === 0) return null;

  const totalWords = available.reduce((n, m) => n + m.words, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {available.length} months · {totalWords.toLocaleString()} words, built
          in three difficulty bands. Nothing is downloaded until you ask for it.
        </p>
        {notLoaded.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => void loadAll()} disabled={Boolean(busy)}>
            <Download className="w-3.5 h-3.5" />
            Load all {notLoaded.length}
          </Button>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {available.map((entry) => {
          const loaded = entry.month in months;
          return (
            <div
              key={entry.month}
              className={cn(
                "rounded-md border p-3",
                loaded ? "border-success/40 bg-success/5" : "border-border/60",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <BookMarked className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    {entry.displayName}
                    {loaded && (
                      <Badge variant="success" className="text-[10px]">
                        Loaded
                      </Badge>
                    )}
                  </p>
                  {entry.description && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {entry.description}
                    </p>
                  )}
                </div>
                {!loaded && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === entry.month}
                    onClick={() => void load(entry)}
                  >
                    {busy === entry.month ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                  </Button>
                )}
                {loaded && <Check className="w-4 h-4 text-success shrink-0" />}
              </div>

              <p className="text-[11px] text-muted-foreground mt-2 truncate">
                {entry.sample.join(" · ")}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1 tabular">
                {entry.words} words · {entry.days} days
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

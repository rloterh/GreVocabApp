/**
 * Which AI the app will use, and why.
 *
 * The cascade picks a provider on its own, which is the right default and a
 * bad thing to leave invisible: a user who cannot see what answered cannot
 * reason about why the output changed, or whether their words left the device.
 *
 * This screen makes it legible — what was found, what will be used, what it
 * costs in privacy — and lets the user override it.
 *
 * See docs/AI-PROVIDERS.md and docs/adr/0001-provider-cascade.md.
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Cpu, Globe, LogIn, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSettingsStore } from "@/store/useSettingsStore";
import { aiRegistry, installedClis } from "@/lib/ai/client";
import type { Availability, ProviderId } from "@/lib/ai/types";
import { useOpenRouterConnect } from "@/hooks/useOpenRouterConnect";
import { cn } from "@/lib/utils";

interface Row {
  id: ProviderId;
  label: string;
  tier: number;
  onDevice: boolean;
  availability: Availability;
}

/** What each availability means for the person reading it. */
const AVAILABILITY_COPY: Record<Availability, { text: string; tone: string }> = {
  available: { text: "Ready", tone: "text-success" },
  downloadable: { text: "Needs download", tone: "text-warning" },
  "needs-setup": { text: "Needs setup", tone: "text-warning" },
  unavailable: { text: "Not found", tone: "text-muted-foreground" },
};

export function ProviderSettings() {
  const pinned = useSettingsStore((s) => s.pinnedProvider);
  const setSettings = useSettingsStore((s) => s.set);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true);
  const openrouter = useOpenRouterConnect();

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const registry = await aiRegistry(await installedClis());
      const availability = await registry.detectAll(true);
      setRows(
        registry.list().map((provider) => ({
          id: provider.id,
          label: provider.label,
          tier: provider.tier,
          onDevice: provider.capabilities().onDevice,
          availability: availability.get(provider.id) ?? "unavailable",
        })),
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A new key changes what is available, and a stale list saying "Not found"
  // next to a working connection reads as a failure.
  useEffect(() => {
    void refresh();
  }, [openrouter.connected, refresh]);

  // What would actually answer right now: the pinned one, or the first ready.
  const active = pinned
    ? rows.find((r) => r.id === pinned)
    : rows.find((r) => r.availability === "available");

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm">
          {busy ? (
            <span className="text-muted-foreground">Looking for AI…</span>
          ) : active ? (
            <>
              Using <span className="font-medium">{active.label}</span>
              {active.onDevice && (
                <span className="text-muted-foreground">
                  {" "}
                  — nothing leaves this device
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">
              No AI is ready. You can still use{" "}
              <span className="text-foreground">Generate elsewhere</span>, which
              needs no key.
            </span>
          )}
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void refresh()}
          disabled={busy}
        >
          <RefreshCw className={cn("w-3.5 h-3.5", busy && "animate-spin")} />
          <span className="sr-only">Check again</span>
        </Button>
      </div>

      <ul className="space-y-1">
        {rows.map((row) => {
          const copy = AVAILABILITY_COPY[row.availability];
          const isPinned = pinned === row.id;
          const isActive = active?.id === row.id;
          return (
            <li key={row.id}>
              <button
                type="button"
                aria-pressed={isPinned}
                onClick={() =>
                  setSettings({ pinnedProvider: isPinned ? null : row.id })
                }
                className={cn(
                  "w-full flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors",
                  isActive
                    ? "border-accent bg-accent/10"
                    : "border-border/60 hover:border-border",
                )}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {row.onDevice ? (
                    <Cpu className="w-3.5 h-3.5 text-success shrink-0" />
                  ) : (
                    <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-sm truncate">{row.label}</span>
                  {row.onDevice && (
                    <Badge variant="success" className="text-[10px] shrink-0">
                      On device
                    </Badge>
                  )}
                  {isPinned && (
                    <Badge variant="accent" className="text-[10px] shrink-0">
                      Pinned
                    </Badge>
                  )}
                </span>
                <span
                  className={cn("text-xs shrink-0 flex items-center gap-1", copy.tone)}
                >
                  {isActive && <Check className="w-3 h-3" />}
                  {copy.text}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="rounded-md border border-border/60 p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {/* A div, not a p: Badge renders a div, and a div inside a p is
                invalid nesting that React reparents at runtime. */}
            <div className="text-sm font-medium flex items-center gap-2">
              OpenRouter
              {openrouter.connected && (
                <Badge variant="success" className="text-[10px]">
                  Connected
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
              {openrouter.connected
                ? "Signed in. Claude, GPT, Gemini and the open models all answer through one account."
                : "Sign in with your browser instead of finding and pasting a key. One account reaches Claude, GPT, Gemini and the open models."}
            </p>
          </div>
          <Button
            size="sm"
            variant={openrouter.connected ? "ghost" : "default"}
            disabled={openrouter.busy}
            onClick={() =>
              void (openrouter.connected
                ? openrouter.disconnect()
                : openrouter.connect())
            }
          >
            {!openrouter.connected && <LogIn className="w-3.5 h-3.5" />}
            {openrouter.busy
              ? "Waiting…"
              : openrouter.connected
                ? "Disconnect"
                : "Connect"}
          </Button>
        </div>
        {openrouter.busy && !openrouter.connected && (
          <p className="text-[11px] text-muted-foreground">
            Approve the sign-in in your browser, then come back here.
          </p>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Providers are tried in order of what they cost you — on-device first,
        then anything needing a key. Click one to pin it; click again to let the
        app choose. A pinned provider is used even if this list is pessimistic
        about it.
      </p>
    </div>
  );
}

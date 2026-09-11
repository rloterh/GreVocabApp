/**
 * Building a registry from what the user has configured.
 *
 * The registry itself takes plain values so it stays testable; this is the one
 * place that reads them out of the settings store. Keeping the read here means
 * nothing under `src/lib/ai/` imports a store, and the layering rule in
 * docs/ARCHITECTURE.md holds.
 */

import { useSettingsStore } from "@/store/useSettingsStore";
import { ProviderRegistry } from "./registry";
import type { Provider } from "./types";

/**
 * A registry reflecting current settings.
 *
 * Built per call rather than cached: settings change, and a stale registry
 * would keep using a key the user has replaced. Construction is cheap — it
 * builds a handful of objects and performs no I/O.
 */
export function aiRegistry(): ProviderRegistry {
  const settings = useSettingsStore.getState();
  return new ProviderRegistry({
    secrets: { anthropicApiKey: settings.anthropicApiKey },
  });
}

/**
 * The provider that will answer, or an `AiError` explaining what is missing.
 *
 * Callers that want to generate something should use this rather than
 * constructing a provider, so the cascade applies uniformly.
 */
export async function selectProvider(): Promise<Provider> {
  return aiRegistry().select();
}

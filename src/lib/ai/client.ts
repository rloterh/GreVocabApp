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
import { detectAiClis, type DetectedCli } from "./providers/cli";
import { platformTransport } from "./tauri-transport";
import type { Provider } from "./types";

/**
 * Installed CLIs, cached for the session. Detection shells out to look at
 * PATH, which is cheap but not free, and the answer does not change while the
 * app is open.
 */
let cachedClis: DetectedCli[] | null = null;

export async function installedClis(): Promise<DetectedCli[]> {
  cachedClis ??= await detectAiClis();
  return cachedClis;
}

/**
 * A registry reflecting current settings.
 *
 * Built per call rather than cached: settings change, and a stale registry
 * would keep using a key the user has replaced. Construction is cheap — it
 * builds a handful of objects and performs no I/O.
 */
export function aiRegistry(detectedClis: DetectedCli[] = []): ProviderRegistry {
  const settings = useSettingsStore.getState();
  return new ProviderRegistry({
    // Rust on desktop so local servers are reachable at all; fetch on web.
    transport: platformTransport(),
    secrets: { anthropicApiKey: settings.anthropicApiKey },
    detectedClis,
    enabledClis: settings.enabledAiTools,
  });
}

/**
 * The provider that will answer, or an `AiError` explaining what is missing.
 *
 * Callers that want to generate something should use this rather than
 * constructing a provider, so the cascade applies uniformly.
 */
export async function selectProvider(): Promise<Provider> {
  return aiRegistry(await installedClis()).select();
}

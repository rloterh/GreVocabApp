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
import { getSecret } from "./keystore";
import { guardCredentials } from "./credential-guard";
import type { Provider, ProviderId } from "./types";

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
 * would keep using a key the user has replaced. Async because the credential
 * comes from the OS keychain, which is a round trip to another process.
 */
export async function aiRegistry(
  detectedClis: DetectedCli[] = [],
): Promise<ProviderRegistry> {
  const settings = useSettingsStore.getState();
  // From the keychain, never from the settings blob — that copy is the one
  // that used to reach exported backups. See docs/adr/0010-secrets-handling.md.
  const [anthropic, openrouter] = await Promise.all([
    getSecret("anthropicApiKey"),
    getSecret("openrouterApiKey"),
  ]);
  return new ProviderRegistry({
    // Rust on desktop so local servers are reachable at all; fetch on web —
    // wrapped so a credential cannot reach a host it was not issued for,
    // whatever an adapter or a mistyped base URL asks for. ADR 0010.
    transport: guardCredentials(platformTransport()),
    secrets: {
      anthropicApiKey: anthropic?.reveal() ?? null,
      openrouterApiKey: openrouter?.reveal() ?? null,
    },
    detectedClis,
    enabledClis: settings.enabledAiTools,
    pinned: (settings.pinnedProvider as ProviderId | null) ?? null,
  });
}

/**
 * The provider that will answer, or an `AiError` explaining what is missing.
 *
 * Callers that want to generate something should use this rather than
 * constructing a provider, so the cascade applies uniformly.
 */
export async function selectProvider(): Promise<Provider> {
  const registry = await aiRegistry(await installedClis());
  return registry.select();
}

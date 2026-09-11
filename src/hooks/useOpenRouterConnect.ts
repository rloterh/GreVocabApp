/**
 * "Connect" for OpenRouter, on both builds.
 *
 * The two platforms differ only in how the authorization code gets back:
 *
 * - **Desktop** becomes a server for a few seconds. Rust binds a loopback port,
 *   opens the real browser, and returns the code. The app never leaves the
 *   screen and the flow is one `await`.
 * - **Web** cannot listen on a socket, so it redirects to OpenRouter and back
 *   to itself. The page unloads in the middle, which is why the verifier has to
 *   outlive it — and why finishing the flow is a separate hook mounted in
 *   `App.tsx`. The app reopens on whatever page it defaults to, not on Settings,
 *   so a resume living inside the settings panel would never run.
 *
 * Everything provider-specific — the URL, the crypto, the exchange — is in
 * `src/lib/ai/oauth.ts`. See docs/adr/0007-authentication-strategy.md.
 */

import { useCallback, useEffect, useState } from "react";
import { AiError } from "@/lib/ai/errors";
import { getSecret, setSecret, deleteSecret } from "@/lib/ai/keystore";
import {
  buildAuthUrl,
  codeFromCallback,
  createPkcePair,
  exchangeCode,
  PORT_PLACEHOLDER,
} from "@/lib/ai/oauth";
import { platformTransport } from "@/lib/ai/tauri-transport";
import { isTauri } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";

/**
 * Where the web flow parks the verifier while the page is gone.
 *
 * `sessionStorage`, not `localStorage`: this is a few seconds of in-flight
 * state, not something to persist. It should not outlive the tab, and it must
 * never reach a backup — which is the whole point of ADR 0010.
 */
const PENDING_VERIFIER = "lexicon.openrouter.pkce";

export interface OpenRouterConnection {
  /** True once a key is stored, however it got there. */
  connected: boolean;
  /** A sign-in is in flight. */
  busy: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

/**
 * Finish a web sign-in that redirected away and came back.
 *
 * Mounted once, in `App.tsx`. It must not live in the settings panel: the
 * redirect reopens the app on its default page, so a resume that waited for
 * that panel to mount would never run, and the user would be returned to an app
 * that quietly forgot it had asked them to sign in.
 *
 * Inert on desktop, where the code never leaves the process.
 */
export function useOpenRouterCallback(): void {
  const showToast = useAppStore((s) => s.showToast);
  const navigate = useAppStore((s) => s.navigate);

  useEffect(() => {
    if (isTauri()) return;
    const verifier = sessionStorage.getItem(PENDING_VERIFIER);
    if (!verifier) return;

    let code: string | null = null;
    try {
      code = codeFromCallback(window.location.href);
    } catch (error) {
      sessionStorage.removeItem(PENDING_VERIFIER);
      clearCallbackParams();
      showToast({
        title: "Could not connect",
        description: describe(error),
        variant: "error",
      });
      return;
    }
    if (!code) return;

    sessionStorage.removeItem(PENDING_VERIFIER);
    // Strip the code from the address bar before doing anything else: it is
    // single-use, but a URL with a credential in it gets pasted and bookmarked.
    clearCallbackParams();

    void exchangeCode(code, verifier, platformTransport())
      .then(async (key) => {
        await setSecret("openrouterApiKey", key);
        // They left from Settings; return them there to see the result rather
        // than dropping them on the dashboard wondering whether it worked.
        navigate("settings");
        showToast({
          title: "Connected to OpenRouter",
          description: "Claude, GPT, Gemini and the open models are now available.",
          variant: "success",
        });
      })
      .catch((error: unknown) =>
        showToast({
          title: "Could not connect",
          description: describe(error),
          variant: "error",
        }),
      );
  }, [showToast, navigate]);
}

export function useOpenRouterConnect(): OpenRouterConnection {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const showToast = useAppStore((s) => s.showToast);

  const refresh = useCallback(async () => {
    const secret = await getSecret("openrouterApiKey");
    setConnected(Boolean(secret && !secret.isEmpty));
  }, []);

  const store = useCallback(
    async (key: string) => {
      await setSecret("openrouterApiKey", key);
      setConnected(true);
      showToast({
        title: "Connected to OpenRouter",
        description: "Claude, GPT, Gemini and the open models are now available.",
        variant: "success",
      });
    },
    [showToast],
  );

  const fail = useCallback(
    (error: unknown) => {
      // A user who closed the tab is not an error worth shouting about, but
      // silence would leave them wondering whether it worked.
      showToast({
        title: "Could not connect",
        description: describe(error),
        variant: "error",
      });
    },
    [showToast],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A sign-in finished by `useOpenRouterCallback` lands while this panel is
  // unmounted, so re-read on mount rather than trusting local state.
  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const connect = useCallback(async () => {
    setBusy(true);
    try {
      const { verifier, challenge } = await createPkcePair();

      if (isTauri()) {
        // The port is not known until Rust binds one, so the placeholder goes
        // through the encoding intact and is substituted on the other side.
        const url = buildAuthUrl(
          `http://localhost:${PORT_PLACEHOLDER}/callback`,
          challenge,
        );
        const { invoke } = await import("@tauri-apps/api/core");
        const code = await invoke<string>("oauth_authorize", {
          urlTemplate: url,
        });
        await store(await exchangeCode(code, verifier, platformTransport()));
        return;
      }

      // Web: hand off to OpenRouter and pick this up again on the way back.
      sessionStorage.setItem(PENDING_VERIFIER, verifier);
      window.location.assign(buildAuthUrl(callbackOrigin(), challenge));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }, [store, fail]);

  const disconnect = useCallback(async () => {
    await deleteSecret("openrouterApiKey");
    setConnected(false);
    showToast({ title: "Disconnected from OpenRouter", variant: "success" });
  }, [showToast]);

  return { connected, busy, connect, disconnect };
}

/** A message worth showing, from whatever was thrown. */
function describe(error: unknown): string {
  return error instanceof AiError || error instanceof Error
    ? error.message
    : String(error);
}

/** This page, without any query or hash — where OpenRouter should return to. */
function callbackOrigin(): string {
  return window.location.origin + window.location.pathname;
}

/** Take `code` and `error` out of the address bar without a reload. */
function clearCallbackParams(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");
  window.history.replaceState({}, "", url.toString());
}

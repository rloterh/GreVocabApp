/**
 * Android's back gesture, handled inside the app.
 *
 * A back press that closes the app from three screens deep feels broken — it
 * is the single most common way a webview-based Android app gives itself away.
 * So back navigates within the app first, and only exits from the home screen.
 *
 * Implemented over the History API, which is what the system back gesture
 * drives in a webview. Inert everywhere else.
 *
 * See docs/MOBILE.md.
 */

import { useEffect } from "react";
import { useAppStore, type Page } from "@/store/useAppStore";
import { hasSystemBack } from "@/lib/platform";

/** Where back goes from anywhere that is not itself the home screen. */
const HOME: Page = "dashboard";

export function useSystemBack(): void {
  const page = useAppStore((s) => s.page);
  const navigate = useAppStore((s) => s.navigate);

  useEffect(() => {
    if (!hasSystemBack()) return;

    // One entry per navigation, so the system gesture has something to pop.
    // `replaceState` on the home screen keeps the stack from growing without
    // bound as the user moves around.
    if (page === HOME) {
      window.history.replaceState({ page }, "");
    } else {
      window.history.pushState({ page }, "");
    }

    const onPopState = (event: PopStateEvent) => {
      const previous = (event.state as { page?: Page } | null)?.page;
      // Anywhere but home goes home rather than exiting. From home, the event
      // is left alone and the system closes the app, which is what a user
      // expects from the first screen.
      if (page !== HOME) {
        navigate(previous ?? HOME);
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [page, navigate]);
}

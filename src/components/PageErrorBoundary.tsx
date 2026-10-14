import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * One page failing should cost you that page, not the app.
 *
 * React unmounts the whole tree when a render throws and nothing catches it,
 * so before this existed a single bad screen left an empty window — no nav, no
 * way back, nothing on screen to say what happened. That is how the Settings
 * crash presented: a blank dark rectangle with a title bar.
 *
 * The nav lives outside this boundary, so the rest of the app stays usable and
 * the user can simply go somewhere else. That matters more than it sounds:
 * with progress persisted, "this screen is broken" is a nuisance, while "the
 * app is dead" looks like lost data.
 *
 * Keyed by page in App.tsx, so navigating away and back clears the error
 * without a reload.
 *
 * The message shows the error text because this is a local-first app with no
 * crash reporting: if the user does not read it, nobody ever will.
 */
interface Props {
  children: ReactNode;
  /** Shown in the message, so the user knows which screen gave up. */
  page: string;
}
interface State {
  error: Error | null;
}

export class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The console is the only place this evidence exists before a bug report.
    console.error(
      `[lexicon] ${this.props.page} failed to render`,
      error,
      info.componentStack,
    );
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="w-full max-w-lg mx-auto py-16 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="display-serif text-2xl font-semibold mb-2">
          This screen ran into a problem.
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-1">
          Everything else still works, and nothing you have studied is affected
          — your progress is saved separately.
        </p>
        <p className="text-xs text-muted-foreground/80 font-mono break-words mb-6">
          {error.message || String(error)}
        </p>
        <Button
          variant="outline"
          onClick={() => this.setState({ error: null })}
        >
          <RotateCcw className="h-4 w-4" />
          Try again
        </Button>
      </div>
    );
  }
}

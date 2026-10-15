import React from "react";
import { ShieldAlert, RefreshCw } from "lucide-react";
import { tokens } from "@/lib/api";

type Props = { children: React.ReactNode };
type State = { error: Error | null; info: React.ErrorInfo | null };

/** A bundle/chunk that no longer exists because the app was redeployed. */
const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|dynamically imported module|Loading chunk \S+ failed|ChunkLoadError|error loading dynamically imported module/i;

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error) {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error.message);
    console.error("Component stack:", info.componentStack);
    this.setState({ info });
  }

  render() {
    if (this.state.error) {
      // A stale tab after a deploy: the chunk it wants is gone. Reloading once
      // fetches the new build; clearing the session here would be needless (and
      // alarming) since auth is fine.
      if (CHUNK_ERROR_RE.test(this.state.error.message)) {
        return (
          <div className="flex min-h-screen items-center justify-center bg-phantix-950 text-slate-200">
            <div className="card w-full max-w-md p-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-gold-400/15">
                <RefreshCw size={22} className="text-gold-400" />
              </div>
              <h1 className="text-lg font-semibold text-white">A new version is available</h1>
              <p className="mt-1.5 text-sm text-slate-400">
                This tab is running an older build. Reload to continue — you stay signed in.
              </p>
              <button
                type="button"
                className="btn-primary mt-5 w-full"
                onClick={() => window.location.reload()}
              >
                <RefreshCw size={14} /> Reload
              </button>
            </div>
          </div>
        );
      }
      return (
        <div className="flex min-h-screen items-center justify-center bg-phantix-950 text-slate-200">
          <div className="card w-full max-w-xl p-8">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-md bg-severity-critical/15 p-2.5">
                <ShieldAlert size={22} className="text-severity-critical" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">Something went wrong</h1>
                <p className="mt-1 text-xs text-slate-500">The user interface crashed. Check the console for the component stack trace.</p>
              </div>
            </div>
            <pre className="my-3 max-h-40 overflow-auto rounded-md bg-phantix-950 p-3.5 text-[13px] text-severity-critical whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
            {this.state.info && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[13px] text-slate-500">Component stack trace</summary>
                <pre className="mt-1.5 max-h-48 overflow-auto rounded-lg bg-phantix-950 p-2.5 text-[12px] text-slate-500 whitespace-pre-wrap">
                  {this.state.info.componentStack}
                </pre>
              </details>
            )}
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={() => {
                  // Clear through the token store so the persistent keys (not just
                  // the legacy sessionStorage ones) are emptied.
                  try {
                    tokens.platform = null;
                    tokens.orgUser = null;
                    tokens.dualControl = null;
                    tokens.email = null;
                  } catch { /* storage unavailable */ }
                  window.location.href = "/login";
                }}
              >
                Clear session and go to login
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { this.setState({ error: null, info: null }); }}
              >
                <RefreshCw size={14} />
                Dismiss
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

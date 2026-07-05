import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary for the side panel — converts a full React crash (white screen)
 * into a recoverable UI with a "Reload" button. Without this, any uncaught render
 * error (malformed field data, storage race, etc.) kills the entire panel.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      '[OneClick Apply] Panel crash caught by error boundary:',
      error,
      info.componentStack,
    );
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-sm font-semibold text-slate-200">Something went wrong</h2>
          <p className="max-w-xs text-xs text-slate-400">
            The panel hit an unexpected error. Your data is safe — click below to reload.
          </p>
          {this.state.error && (
            <pre className="max-w-xs overflow-auto rounded bg-slate-800 p-2 text-[10px] text-red-400">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-indigo-700"
          >
            ↻ Reload panel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

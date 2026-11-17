import { Component } from "react";

// Catches any rendering error so one broken component shows a message
// instead of turning the whole app into a blank white screen.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("App error:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md rounded-lg border bg-background p-6 text-center shadow-sm">
          <h2 className="text-lg font-semibold">Terjadi kesalahan di halaman ini</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Data Anda aman. Klik tombol di bawah untuk memuat ulang.
          </p>
          <p className="mt-3 break-words rounded bg-muted px-2 py-1 text-left font-mono text-xs text-muted-foreground">
            {String(this.state.error?.message || this.state.error)}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Muat ulang
          </button>
        </div>
      </div>
    );
  }
}

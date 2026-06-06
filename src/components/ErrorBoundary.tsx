import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./Button";
import { useI18n } from "../lib/i18n";

interface ErrorBoundaryProps {
  children: ReactNode;
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Panel render failed", error, errorInfo);
  }

  private retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <section className="panel">
        <ErrorFallback error={this.state.error} onRetry={this.retry} />
      </section>
    );
  }
}

function ErrorFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { t } = useI18n();

  return (
    <div className="empty-state error-state">
      <AlertTriangle size={48} aria-hidden="true" />
      <p>{t("error.panelTitle")}</p>
      <span className="muted">{error.message || t("error.runtime")}</span>
      <Button icon={<RotateCcw size={16} />} onClick={onRetry}>
        {t("error.retry")}
      </Button>
    </div>
  );
}

"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

// Icons
const AlertIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" x2="12" y1="8" y2="12"/>
    <line x1="12" x2="12.01" y1="16" y2="16"/>
  </svg>
);

const RefreshIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
    <path d="M21 3v5h-5"/>
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
    <path d="M8 16H3v5"/>
  </svg>
);

const HomeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const BugIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m8 2 1.88 1.88"/>
    <path d="M14.12 3.88 16 2"/>
    <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/>
    <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/>
    <path d="M12 20v-9"/>
    <path d="M6.53 9C4.6 8.8 3 7.1 3 5"/>
    <path d="M6 13H2"/>
    <path d="M3 21c0-2.1 1.7-3.9 3.8-4"/>
    <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/>
    <path d="M22 13h-4"/>
    <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>
  </svg>
);

interface Props {
  children: ReactNode;
  fallbackUI?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    
    // Log error to console in development
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
    
    // In production, send to error tracking service
    if (process.env.NODE_ENV === "production") {
      this.logErrorToService(error, errorInfo);
    }
  }

  logErrorToService(error: Error, errorInfo: ErrorInfo) {
    // TODO: Send to error tracking service (Sentry, LogRocket, etc.)
    console.error("[ErrorBoundary] Production error:", {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      url: typeof window !== "undefined" ? window.location.href : "unknown",
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleGoHome = () => {
    if (typeof window !== "undefined") {
      window.location.href = "/workspace";
    }
  };

  handleRefresh = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallbackUI) {
        return this.props.fallbackUI;
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-[#1c1c1e] rounded-2xl border border-[#3a3a3c] p-8 text-center">
            {/* Icon */}
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-400">
              <AlertIcon />
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-white mb-2">Something went wrong</h2>
            <p className="text-[#8e8e93] mb-6">
              We encountered an error while rendering this page. This has been logged and we&apos;re working on it.
            </p>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 bg-[#0a84ff] text-white rounded-lg font-medium hover:bg-[#0070e0] flex items-center justify-center gap-2"
              >
                <RefreshIcon /> Try Again
              </button>
              <button
                onClick={this.handleGoHome}
                className="px-4 py-2 border border-[#3a3a3c] text-white rounded-lg font-medium hover:bg-[#2c2c2e] flex items-center justify-center gap-2"
              >
                <HomeIcon /> Go to Dashboard
              </button>
            </div>

            {/* Error Details (collapsed by default) */}
            <div className="text-left">
              <button
                onClick={this.toggleDetails}
                className="text-sm text-[#8e8e93] hover:text-white flex items-center gap-2 mx-auto"
              >
                <BugIcon />
                {this.state.showDetails ? "Hide" : "Show"} technical details
              </button>

              {this.state.showDetails && this.state.error && (
                <div className="mt-4 p-4 bg-[#2c2c2e] rounded-lg text-left overflow-auto max-h-64">
                  <p className="text-xs font-mono text-red-400 mb-2">
                    {this.state.error.message}
                  </p>
                  {this.state.error.stack && (
                    <pre className="text-xs font-mono text-[#8e8e93] whitespace-pre-wrap break-all">
                      {this.state.error.stack}
                    </pre>
                  )}
                </div>
              )}
            </div>

            {/* Recovery Tips */}
            <div className="mt-6 p-4 bg-[#2c2c2e] rounded-lg text-left">
              <p className="text-sm font-medium text-white mb-2">Recovery Tips:</p>
              <ul className="text-sm text-[#8e8e93] space-y-1">
                <li>• Try refreshing the page</li>
                <li>• Clear your browser cache</li>
                <li>• Check your internet connection</li>
                <li>• If the problem persists, contact support</li>
              </ul>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// =============================================================================
// FUNCTIONAL WRAPPER FOR HOOKS
// =============================================================================

interface ErrorBoundaryWrapperProps {
  children: ReactNode;
  pageName?: string;
}

export function WorkspaceErrorBoundary({ children, pageName }: ErrorBoundaryWrapperProps) {
  return (
    <ErrorBoundary
      fallbackUI={
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-[#1c1c1e] rounded-2xl border border-[#3a3a3c] p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-yellow-500/10 flex items-center justify-center text-yellow-400">
              <AlertIcon />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              {pageName ? `${pageName} Error` : "Page Error"}
            </h2>
            <p className="text-[#8e8e93] mb-4">
              Something went wrong loading this section. Please try refreshing.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#0a84ff] text-white rounded-lg font-medium hover:bg-[#0070e0]"
            >
              Refresh Page
            </button>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

export default ErrorBoundary;


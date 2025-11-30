'use client';

import { useEffect } from 'react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error(error);
    }, [error]);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
            <div className="max-w-md w-full bg-card border border-border rounded-xl p-6 shadow-lg text-center">
                <div className="w-12 h-12 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" x2="12" y1="8" y2="12" />
                        <line x1="12" x2="12.01" y1="16" y2="16" />
                    </svg>
                </div>
                <h2 className="text-xl font-semibold mb-2">Something went wrong!</h2>
                <p className="text-muted-foreground text-sm mb-6">
                    We encountered an unexpected error. Please try again or contact support if the problem persists.
                </p>
                <div className="flex gap-3 justify-center">
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
                    >
                        Reload Page
                    </button>
                    <button
                        onClick={() => reset()}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                        Try Again
                    </button>
                </div>
                {process.env.NODE_ENV === 'development' && (
                    <div className="mt-6 p-4 bg-secondary/50 rounded-lg text-left overflow-auto max-h-48">
                        <p className="text-xs font-mono text-destructive">{error.message}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

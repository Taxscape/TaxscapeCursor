"use client";

import React from "react";

// =============================================================================
// ICONS
// =============================================================================

const EmptyIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M20 7h-9"/>
    <path d="M14 17H5"/>
    <circle cx="17" cy="17" r="3"/>
    <circle cx="7" cy="7" r="3"/>
  </svg>
);

const ErrorIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10"/>
    <path d="m15 9-6 6"/>
    <path d="m9 9 6 6"/>
  </svg>
);

const LoadingSpinner = ({ size = 24 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className="animate-spin"
  >
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="2"
      strokeOpacity="0.2"
    />
    <path
      d="M12 2a10 10 0 0 1 10 10"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

// =============================================================================
// EMPTY STATE
// =============================================================================

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon = <EmptyIcon />,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 px-8 text-center ${className}`}>
      <div className="w-20 h-20 mb-6 rounded-2xl bg-[#2c2c2e] flex items-center justify-center text-[#8e8e93]">
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      {description && (
        <p className="text-[#8e8e93] max-w-md mb-6">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-3 bg-[#0a84ff] text-white rounded-xl font-medium hover:bg-[#0070e0]"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// =============================================================================
// LOADING STATE
// =============================================================================

interface LoadingStateProps {
  message?: string;
  size?: "small" | "medium" | "large";
  inline?: boolean;
  className?: string;
}

export function LoadingState({
  message = "Loading...",
  size = "medium",
  inline = false,
  className = "",
}: LoadingStateProps) {
  const sizes = {
    small: { spinner: 16, text: "text-sm", padding: "py-4" },
    medium: { spinner: 24, text: "text-base", padding: "py-12" },
    large: { spinner: 40, text: "text-lg", padding: "py-20" },
  };

  const sizeConfig = sizes[size];

  if (inline) {
    return (
      <div className={`flex items-center gap-2 text-[#8e8e93] ${className}`}>
        <LoadingSpinner size={sizeConfig.spinner} />
        <span className={sizeConfig.text}>{message}</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center ${sizeConfig.padding} ${className}`}>
      <div className="text-[#0a84ff] mb-4">
        <LoadingSpinner size={sizeConfig.spinner} />
      </div>
      <p className={`${sizeConfig.text} text-[#8e8e93]`}>{message}</p>
    </div>
  );
}

// =============================================================================
// ERROR STATE
// =============================================================================

interface ErrorStateProps {
  title?: string;
  message?: string;
  retry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  message = "We encountered an error. Please try again.",
  retry,
  className = "",
}: ErrorStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 px-8 text-center ${className}`}>
      <div className="w-20 h-20 mb-6 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-400">
        <ErrorIcon />
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-[#8e8e93] max-w-md mb-6">{message}</p>
      {retry && (
        <button
          onClick={retry}
          className="px-6 py-3 bg-[#0a84ff] text-white rounded-xl font-medium hover:bg-[#0070e0]"
        >
          Try Again
        </button>
      )}
    </div>
  );
}

// =============================================================================
// NO CLIENT SELECTED STATE
// =============================================================================

interface NoClientSelectedProps {
  onSelectClient?: () => void;
}

export function NoClientSelected({ onSelectClient }: NoClientSelectedProps) {
  return (
    <EmptyState
      icon={
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      }
      title="No Client Selected"
      description="Select a client from the dropdown above to view their data and start working on their R&D tax credit study."
      action={onSelectClient ? { label: "Select Client", onClick: onSelectClient } : undefined}
    />
  );
}

// =============================================================================
// SKELETON COMPONENTS
// =============================================================================

export function SkeletonText({ lines = 1, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {[...Array(lines)].map((_, i) => (
        <div
          key={i}
          className="h-4 bg-[#2c2c2e] rounded animate-pulse"
          style={{ width: `${Math.random() * 40 + 60}%` }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-[#1c1c1e] rounded-2xl border border-[#3a3a3c] p-6 animate-pulse ${className}`}>
      <div className="h-6 bg-[#2c2c2e] rounded w-1/3 mb-4" />
      <div className="space-y-3">
        <div className="h-4 bg-[#2c2c2e] rounded w-full" />
        <div className="h-4 bg-[#2c2c2e] rounded w-2/3" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-[#1c1c1e] rounded-2xl border border-[#3a3a3c] overflow-hidden">
      {/* Header */}
      <div className="flex border-b border-[#3a3a3c] bg-[#2c2c2e] p-4 gap-4">
        {[...Array(cols)].map((_, i) => (
          <div key={i} className="h-4 bg-[#3a3a3c] rounded flex-1 animate-pulse" />
        ))}
      </div>
      {/* Rows */}
      {[...Array(rows)].map((_, rowIdx) => (
        <div key={rowIdx} className="flex border-b border-[#2c2c2e] p-4 gap-4">
          {[...Array(cols)].map((_, colIdx) => (
            <div
              key={colIdx}
              className="h-4 bg-[#2c2c2e] rounded flex-1 animate-pulse"
              style={{ animationDelay: `${(rowIdx * cols + colIdx) * 50}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// DESKTOP ONLY GATE
// =============================================================================

export function DesktopOnlyGate({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  if (isMobile) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-[#2c2c2e] flex items-center justify-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#8e8e93]">
              <rect width="18" height="12" x="3" y="4" rx="2" ry="2"/>
              <line x1="2" x2="22" y1="20" y2="20"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-4">Desktop Required</h1>
          <p className="text-[#8e8e93]">
            TaxScape Pro is designed for desktop use to provide the best experience 
            for complex R&D tax credit analysis. Please access this application 
            from a desktop or laptop computer.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default {
  EmptyState,
  LoadingState,
  ErrorState,
  NoClientSelected,
  SkeletonText,
  SkeletonCard,
  SkeletonTable,
  DesktopOnlyGate,
};


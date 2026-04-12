"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/context/auth-context";
import { JobsProvider } from "@/context/jobs-context";
import { JobProgressToaster, JobDetailModal } from "@/components/jobs";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <JobsProvider>
          {children}
          {/* Global job progress UI */}
          <JobProgressToaster />
          <JobDetailModal />
        </JobsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}





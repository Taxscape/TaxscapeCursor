"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { WorkspaceProvider } from '@/context/workspace-context';
import { TestscapeShell } from '@/components/testscape/TestscapeShell';

export default function TestscapeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  
  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login?redirect=/testscape');
    }
  }, [user, isLoading, router]);
  
  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400">Loading Testscape...</p>
        </div>
      </div>
    );
  }
  
  // Don't render if not authenticated (will redirect)
  if (!user) {
    return null;
  }
  
  return (
    <WorkspaceProvider>
      <TestscapeShell>
        {children}
      </TestscapeShell>
    </WorkspaceProvider>
  );
}
